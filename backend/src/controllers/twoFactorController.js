import { supabase } from '../lib/supabase.js';
import {
  generateSecret,
  generateOtpAuthUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
} from '../lib/totp.js';

const ISSUER = 'Destino TV';

// POST /api/2fa/enroll
// Crea (o reemplaza si pendiente) un secreto sin activar.
// Devuelve el secret base32 y el otpauth URI para el QR.
// El secret NO se considera activo hasta que el cliente envíe un código
// válido a /verify-enroll.
export const enroll = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: existing } = await supabase
      .from('user_2fa')
      .select('enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.enabled) {
      return res.status(409).json({ error: '2FA ya está activado. Desactívalo primero.' });
    }

    const secret = generateSecret();
    const otpauth = generateOtpAuthUri({
      secret,
      issuer: ISSUER,
      accountName: req.user.email || userId,
    });
    const encrypted = encryptSecret(secret);

    const { error } = await supabase
      .from('user_2fa')
      .upsert({
        user_id: userId,
        secret_encrypted: encrypted,
        enabled: false,
        backup_codes: [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;

    res.json({ secret, otpauth_uri: otpauth });
  } catch (err) {
    console.error('[2fa enroll]', err);
    res.status(500).json({ error: 'No se pudo iniciar el enrolamiento' });
  }
};

// POST /api/2fa/verify-enroll  { token }
// Verifica el código TOTP y activa 2FA. Devuelve backup codes (única vez).
export const verifyEnroll = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Código requerido' });

    const { data: row, error: selErr } = await supabase
      .from('user_2fa')
      .select('secret_encrypted, enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr) throw selErr;
    if (!row) return res.status(404).json({ error: 'Inicia enrolamiento primero' });
    if (row.enabled) return res.status(409).json({ error: '2FA ya activado' });

    const secret = decryptSecret(row.secret_encrypted);
    if (!verifyTotp(secret, token)) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const codes = generateBackupCodes(8);
    const hashedCodes = codes.map(c => ({ hash: hashBackupCode(c), used_at: null }));

    const { error: upErr } = await supabase
      .from('user_2fa')
      .update({
        enabled: true,
        backup_codes: hashedCodes,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (upErr) throw upErr;

    res.json({ enabled: true, backup_codes: codes });
  } catch (err) {
    console.error('[2fa verify-enroll]', err);
    res.status(500).json({ error: 'No se pudo verificar el código' });
  }
};

// POST /api/2fa/verify  { token | backup_code }
// Verifica TOTP o consume un backup code. Usado por operaciones críticas.
export const verify = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, backup_code } = req.body;
    if (!token && !backup_code) return res.status(400).json({ error: 'Código requerido' });

    const { data: row, error: selErr } = await supabase
      .from('user_2fa')
      .select('secret_encrypted, backup_codes, enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr) throw selErr;
    if (!row || !row.enabled) return res.status(400).json({ error: '2FA no activado' });

    let ok = false;

    if (token) {
      const secret = decryptSecret(row.secret_encrypted);
      ok = verifyTotp(secret, token);
    } else if (backup_code) {
      const targetHash = hashBackupCode(backup_code);
      const codes = Array.isArray(row.backup_codes) ? row.backup_codes : [];
      const match = codes.find(c => c.hash === targetHash && !c.used_at);
      if (match) {
        ok = true;
        match.used_at = new Date().toISOString();
        await supabase.from('user_2fa').update({ backup_codes: codes }).eq('user_id', userId);
      }
    }

    if (!ok) return res.status(400).json({ error: 'Código inválido' });

    await supabase
      .from('user_2fa')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('user_id', userId);

    res.json({ verified: true });
  } catch (err) {
    console.error('[2fa verify]', err);
    res.status(500).json({ error: 'No se pudo verificar' });
  }
};

// GET /api/2fa/status
// Devuelve si el user tiene 2FA activado (no expone el secreto).
export const status = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('user_2fa')
      .select('enabled, last_verified_at, backup_codes')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const backupCodesRemaining = Array.isArray(data?.backup_codes)
      ? data.backup_codes.filter(c => !c.used_at).length
      : 0;
    res.json({
      enabled: !!data?.enabled,
      last_verified_at: data?.last_verified_at || null,
      backup_codes_remaining: backupCodesRemaining,
    });
  } catch (err) {
    console.error('[2fa status]', err);
    res.status(500).json({ error: 'No se pudo consultar el estado' });
  }
};

// DELETE /api/2fa  { token }
// Desactiva 2FA. Requiere código TOTP válido para prevenir disable malicioso
// si un atacante tomó la sesión.
export const disable = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, backup_code } = req.body;
    if (!token && !backup_code) return res.status(400).json({ error: 'Código requerido para desactivar' });

    const { data: row } = await supabase
      .from('user_2fa')
      .select('secret_encrypted, backup_codes, enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!row || !row.enabled) return res.status(400).json({ error: '2FA no activado' });

    let ok = false;
    if (token) {
      const secret = decryptSecret(row.secret_encrypted);
      ok = verifyTotp(secret, token);
    } else {
      const targetHash = hashBackupCode(backup_code);
      const codes = Array.isArray(row.backup_codes) ? row.backup_codes : [];
      ok = codes.some(c => c.hash === targetHash && !c.used_at);
    }

    if (!ok) return res.status(400).json({ error: 'Código inválido' });

    const { error } = await supabase.from('user_2fa').delete().eq('user_id', userId);
    if (error) throw error;
    res.json({ disabled: true });
  } catch (err) {
    console.error('[2fa disable]', err);
    res.status(500).json({ error: 'No se pudo desactivar' });
  }
};

// POST /api/2fa/regenerate-backup-codes  { token }
export const regenerateBackupCodes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Código requerido' });

    const { data: row } = await supabase
      .from('user_2fa')
      .select('secret_encrypted, enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!row || !row.enabled) return res.status(400).json({ error: '2FA no activado' });
    const secret = decryptSecret(row.secret_encrypted);
    if (!verifyTotp(secret, token)) return res.status(400).json({ error: 'Código inválido' });

    const codes = generateBackupCodes(8);
    const hashed = codes.map(c => ({ hash: hashBackupCode(c), used_at: null }));
    await supabase
      .from('user_2fa')
      .update({ backup_codes: hashed, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    res.json({ backup_codes: codes });
  } catch (err) {
    console.error('[2fa regenerate-backup-codes]', err);
    res.status(500).json({ error: 'No se pudieron regenerar' });
  }
};
