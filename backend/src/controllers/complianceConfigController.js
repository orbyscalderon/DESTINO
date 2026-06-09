import { supabase } from '../lib/supabase.js';

// Claves que se exponen al público (sin auth) — todo lo demás solo a admin
const PUBLIC_KEYS = new Set([
  'entity_name', 'entity_jurisdiction', 'entity_address',
  'dpo_name', 'dpo_email', 'legal_email', 'support_email', 'dmca_email',
  'dmca_agent_name', 'dmca_agent_address', 'dmca_agent_email',
  'dmca_agent_phone', 'dmca_agent_registered_at',
  'custodian_name', 'custodian_address', 'custodian_email', 'custodian_hours',
  'eu_representative_name', 'eu_representative_address', 'eu_representative_email',
  'governing_law', 'arbitration_venue', 'phase',
]);

let cache = { data: null, expires: 0 };

async function loadAll() {
  if (Date.now() < cache.expires && cache.data) return cache.data;
  const { data } = await supabase
    .from('compliance_config')
    .select('key, value, description, updated_at');
  const map = Object.fromEntries((data || []).map(r => [r.key, r]));
  cache = { data: map, expires: Date.now() + 5 * 60 * 1000 };
  return map;
}

function invalidateCache() {
  cache = { data: null, expires: 0 };
}

// GET /api/compliance/config (público)
export const getPublicConfig = async (req, res) => {
  try {
    const all = await loadAll();
    const out = {};
    for (const key of PUBLIC_KEYS) {
      if (all[key]) out[key] = all[key].value;
    }
    res.json({ config: out });
  } catch (err) {
    console.error('[getPublicConfig]', err.message);
    res.status(500).json({ error: 'Error cargando configuración' });
  }
};

// GET /api/admin/compliance/config (admin)
export const getAllConfig = async (req, res) => {
  try {
    const all = await loadAll();
    res.json({ config: Object.values(all) });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PATCH /api/admin/compliance/config — body: { key, value }
export const updateConfig = async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || typeof value !== 'string') {
      return res.status(400).json({ error: 'key y value requeridos' });
    }
    const { error } = await supabase
      .from('compliance_config')
      .update({ value, updated_at: new Date().toISOString(), updated_by: req.user.id })
      .eq('key', key);
    if (error) throw error;
    invalidateCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
