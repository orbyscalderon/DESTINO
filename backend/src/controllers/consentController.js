import { supabase } from '../lib/supabase.js';

const VALID_PURPOSES = [
  'analytics', 'marketing', 'personalization', 'advertising', 'thirdparty_share',
  'ccpa_optout', 'data_sale',
  // GDPR Art. 9 — special category consents (explicit)
  'sensitive_sexual_orientation', 'sensitive_adult_content',
  'sensitive_political', 'sensitive_health',
];

// GET /api/consents — estado actual del user
export const getMyConsents = async (req, res) => {
  try {
    const { data } = await supabase
      .from('user_consents_current')
      .select('purpose, granted, granted_at')
      .eq('user_id', req.user.id);

    // Default: todo false hasta consent explícito
    const out = Object.fromEntries(VALID_PURPOSES.map(p => [p, false]));
    (data || []).forEach(row => { out[row.purpose] = row.granted; });
    res.json({ consents: out });
  } catch (err) {
    console.error('[getMyConsents]', err.message);
    res.status(500).json({ error: 'Error obteniendo consentimientos' });
  }
};

// POST /api/consents — body: { purpose, granted: bool }
export const updateConsent = async (req, res) => {
  try {
    const { purpose, granted } = req.body;
    if (!VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: 'purpose inválido', valid: VALID_PURPOSES });
    }
    if (typeof granted !== 'boolean') {
      return res.status(400).json({ error: 'granted debe ser boolean' });
    }

    const { error } = await supabase.from('user_consents').insert({
      user_id: req.user.id,
      purpose,
      granted,
      ip: req.ip || null,
      user_agent: req.headers['user-agent']?.slice(0, 500) || null,
    });
    if (error) throw error;

    res.json({ ok: true, purpose, granted });
  } catch (err) {
    console.error('[updateConsent]', err.message);
    res.status(500).json({ error: 'Error actualizando consentimiento' });
  }
};

// POST /api/consents/bulk — body: { consents: { analytics: bool, marketing: bool, ... } }
export const bulkUpdateConsents = async (req, res) => {
  try {
    const { consents } = req.body;
    if (!consents || typeof consents !== 'object') {
      return res.status(400).json({ error: 'consents object requerido' });
    }

    const rows = [];
    for (const purpose of VALID_PURPOSES) {
      if (purpose in consents) {
        rows.push({
          user_id: req.user.id,
          purpose,
          granted: !!consents[purpose],
          ip: req.ip || null,
          user_agent: req.headers['user-agent']?.slice(0, 500) || null,
        });
      }
    }

    if (rows.length === 0) return res.json({ ok: true, written: 0 });

    const { error } = await supabase.from('user_consents').insert(rows);
    if (error) throw error;

    res.json({ ok: true, written: rows.length });
  } catch (err) {
    console.error('[bulkUpdateConsents]', err.message);
    res.status(500).json({ error: 'Error actualizando consentimientos' });
  }
};

// GET /api/consents/history — audit trail para el user
export const getMyConsentHistory = async (req, res) => {
  try {
    const { data } = await supabase
      .from('user_consents')
      .select('purpose, granted, granted_at')
      .eq('user_id', req.user.id)
      .order('granted_at', { ascending: false })
      .limit(200);
    res.json({ history: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
