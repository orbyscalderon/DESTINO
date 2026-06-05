import { supabase } from '../lib/supabase.js';
import { encryptField } from '../lib/encrypt.js';

// Whitelist de country codes ISO 3166-1 alpha-2 — solo validamos formato.
// La distinción importante es US vs no-US para form_type.
const COUNTRY_REGEX = /^[A-Z]{2}$/;

// US TIN: SSN (XXX-XX-XXXX) o EIN (XX-XXXXXXX) — solo dígitos para el form
const US_TIN_REGEX = /^\d{9}$/;

// W-8BEN: TIN extranjero es opcional y muy variable; solo validamos longitud razonable
const FOREIGN_TIN_MIN_LEN = 4;

// POST /api/tax-forms — submit del form
//
// Body: {
//   form_type: 'W9' | 'W8BEN',
//   full_name, country, address_line1, address_line2?, city,
//   state_or_province?, postal_code,
//   tin, // solo dígitos (US: 9; foreign: variable)
//   date_of_birth?, treaty_country?, // W-8BEN
//   signed_full_name, // typed signature
//   agreed: true, // checkbox de "acepto bajo perjurio…"
// }
export const submitTaxForm = async (req, res) => {
  try {
    const userId = req.user.id;
    const b = req.body || {};

    // ── Validación ──────────────────────────────────────────
    if (!['W9', 'W8BEN'].includes(b.form_type)) {
      return res.status(400).json({ error: 'form_type debe ser W9 o W8BEN' });
    }
    if (!b.agreed) {
      return res.status(400).json({ error: 'Debes aceptar la declaración bajo perjurio para firmar' });
    }

    const requiredStrings = ['full_name', 'country', 'address_line1', 'city', 'postal_code', 'signed_full_name'];
    for (const f of requiredStrings) {
      if (!b[f] || typeof b[f] !== 'string' || !b[f].trim()) {
        return res.status(400).json({ error: `Campo requerido: ${f}` });
      }
    }

    const country = String(b.country).toUpperCase().trim();
    if (!COUNTRY_REGEX.test(country)) {
      return res.status(400).json({ error: 'Código de país inválido (usa ISO 3166-1, ej. US, MX, ES)' });
    }

    // Verificar consistencia form_type ↔ country
    if (b.form_type === 'W9' && country !== 'US') {
      return res.status(400).json({ error: 'W-9 es solo para personas con dirección en US' });
    }
    if (b.form_type === 'W8BEN' && country === 'US') {
      return res.status(400).json({ error: 'W-8BEN es solo para personas fuera de US — usa W-9' });
    }

    // TIN
    const tinDigits = String(b.tin || '').replace(/\D/g, '');
    if (b.form_type === 'W9') {
      if (!US_TIN_REGEX.test(tinDigits)) {
        return res.status(400).json({ error: 'SSN/EIN debe tener 9 dígitos' });
      }
    } else {
      if (tinDigits.length < FOREIGN_TIN_MIN_LEN) {
        return res.status(400).json({ error: 'Ingresa tu TIN/identificación fiscal local' });
      }
    }

    // Firma electrónica — debe coincidir con full_name (E-SIGN Act buena práctica)
    const sigNorm = b.signed_full_name.trim().toLowerCase();
    const nameNorm = b.full_name.trim().toLowerCase();
    if (sigNorm !== nameNorm) {
      return res.status(400).json({ error: 'La firma debe coincidir exactamente con tu nombre legal' });
    }

    // ── Upsert ──────────────────────────────────────────────
    const row = {
      user_id: userId,
      form_type: b.form_type,
      full_name: b.full_name.trim(),
      country,
      address_line1: b.address_line1.trim(),
      address_line2: b.address_line2?.trim() || null,
      city: b.city.trim(),
      state_or_province: b.state_or_province?.trim() || null,
      postal_code: b.postal_code.trim(),
      tin_encrypted: encryptField(tinDigits),
      tin_last4: tinDigits.slice(-4),
      foreign_tax_id: b.form_type === 'W8BEN' ? (b.foreign_tax_id?.trim() || null) : null,
      date_of_birth: b.form_type === 'W8BEN' ? (b.date_of_birth || null) : null,
      treaty_country: b.form_type === 'W8BEN' ? (b.treaty_country?.toUpperCase().trim() || null) : null,
      signed_full_name: b.signed_full_name.trim(),
      signed_at: new Date().toISOString(),
      signed_ip: req.ip,
      signed_user_agent: req.headers['user-agent']?.slice(0, 500) || null,
      status: 'signed',
      expires_at: new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('tax_forms')
      .upsert(row, { onConflict: 'user_id' });

    if (error) throw error;

    res.status(201).json({
      ok: true,
      form_type: row.form_type,
      tin_last4: row.tin_last4,
      expires_at: row.expires_at,
    });
  } catch (err) {
    console.error('[tax-forms submit]', err);
    res.status(500).json({ error: 'No se pudo guardar el formulario' });
  }
};

// GET /api/tax-forms/status — devuelve resumen (sin TIN completo)
export const getTaxFormStatus = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tax_forms')
      .select('form_type, full_name, country, tin_last4, status, signed_at, expires_at, treaty_country')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) return res.json({ submitted: false });

    const expired = data.status === 'signed' && new Date(data.expires_at) <= new Date();
    res.json({
      submitted: true,
      form_type: data.form_type,
      full_name: data.full_name,
      country: data.country,
      tin_last4: data.tin_last4,
      status: expired ? 'expired' : data.status,
      signed_at: data.signed_at,
      expires_at: data.expires_at,
      treaty_country: data.treaty_country,
    });
  } catch (err) {
    console.error('[tax-forms status]', err);
    res.status(500).json({ error: 'No se pudo consultar el estado' });
  }
};

// DELETE /api/tax-forms — borrar (solo si no hay payouts pendientes)
export const deleteTaxForm = async (req, res) => {
  try {
    const userId = req.user.id;
    // No bloqueamos hard — el creator puede borrar para resubmitir con datos
    // corregidos. El historial queda en backups de DB.
    const { error } = await supabase
      .from('tax_forms')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    console.error('[tax-forms delete]', err);
    res.status(500).json({ error: 'No se pudo eliminar' });
  }
};
