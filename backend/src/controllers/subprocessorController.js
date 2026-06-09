import { supabase } from '../lib/supabase.js';

// GET /api/subprocessors — público
export const listSubprocessors = async (req, res) => {
  try {
    const { data } = await supabase
      .from('subprocessors')
      .select('id, name, category, purpose, data_categories, country, scc_signed, dpa_url, privacy_url, added_at, removed_at, active')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    res.json({ subprocessors: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/admin/subprocessors
export const addSubprocessor = async (req, res) => {
  try {
    const { data, error } = await supabase.from('subprocessors').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ subprocessor: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/admin/subprocessors/:id — para deactivar o actualizar
export const updateSubprocessor = async (req, res) => {
  try {
    const patch = { ...req.body };
    if (patch.active === false && !patch.removed_at) patch.removed_at = new Date().toISOString();
    const { error } = await supabase.from('subprocessors').update(patch).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/processing-activities — público (Records of Processing Art. 30)
export const listProcessingActivities = async (req, res) => {
  try {
    const { data } = await supabase
      .from('processing_activities')
      .select('*')
      .eq('active', true)
      .order('is_special_category', { ascending: true })
      .order('name', { ascending: true });
    res.json({ activities: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/cookies — público
export const listCookies = async (req, res) => {
  try {
    const { data } = await supabase
      .from('cookies_inventory')
      .select('*')
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    res.json({ cookies: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
