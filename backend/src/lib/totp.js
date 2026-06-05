import crypto from 'crypto';

// Implementación TOTP RFC 6238 + HOTP RFC 4226 sin dependencias externas.
// Compatible con Google Authenticator, Authy, 1Password, etc.
//
// El secreto se almacena cifrado en BD con AES-256-GCM (TOTP_ENCRYPTION_KEY).
// La key debe ser 32 bytes hex (64 chars). Si falta, los endpoints fallan
// explícitamente — no caemos a una key default por seguridad.

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // acepta el step actual ±1 para tolerar drift de reloj

// ── Base32 (RFC 4648) ────────────────────────────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── HOTP / TOTP ──────────────────────────────────────────────────
function hotp(secretBuf, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) |
              ((hmac[offset + 1] & 0xff) << 16) |
              ((hmac[offset + 2] & 0xff) << 8) |
              (hmac[offset + 3] & 0xff);
  const code = bin % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function generateOtpAuthUri({ secret, issuer, accountName }) {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotp(secretBase32, token) {
  if (!/^\d{6}$/.test(String(token).trim())) return false;
  let secretBuf;
  try { secretBuf = base32Decode(secretBase32); } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  const baseCounter = Math.floor(now / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    if (crypto.timingSafeEqual(
      Buffer.from(hotp(secretBuf, baseCounter + w)),
      Buffer.from(String(token).trim()),
    )) {
      return true;
    }
  }
  return false;
}

// ── Cifrado del secreto en BD ────────────────────────────────────
function getEncryptionKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOTP_ENCRYPTION_KEY env var requerida (32 bytes hex)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(secretBase32) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(stored) {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ctHex] = stored.split(':');
  if (!ivHex || !tagHex || !ctHex) throw new Error('Formato de secret_encrypted inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}

// ── Backup codes ─────────────────────────────────────────────────
export function generateBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    // 10 chars alfanuméricos en bloques de 5 para facilidad de lectura
    const raw = crypto.randomBytes(8).toString('hex').slice(0, 10).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function hashBackupCode(code) {
  // sha256 es suficiente — el espacio de búsqueda es 16^10 ≈ 10¹², el código se
  // usa una sola vez, y un atacante con acceso a la BD ya tiene problemas.
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
