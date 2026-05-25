import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function getKey() {
  const hex = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!hex) return null;
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('PAYOUT_ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)');
  return key;
}

// Cifra un texto. Si PAYOUT_ENCRYPTION_KEY no está configurada, devuelve el texto sin cifrar.
export function encryptField(text) {
  const key = getKey();
  if (!key) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Descifra un texto. Si no está cifrado (legacy plaintext), lo devuelve tal cual.
export function decryptField(data) {
  if (!data || !data.startsWith(ENC_PREFIX)) return data;
  const key = getKey();
  if (!key) return data;
  try {
    const [, ivHex, tagHex, encryptedHex] = data.split(':');
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '[error al descifrar]';
  }
}
