import { supabase } from '../lib/supabase.js';

// GET /api/transparency — público — lista todos los reportes publicados
export const listPublishedReports = async (req, res) => {
  try {
    const { data } = await supabase
      .from('transparency_reports')
      .select('*')
      .eq('is_published', true)
      .order('period_end', { ascending: false });
    res.json({ reports: data || [] });
  } catch {
    res.status(500).json({ error: 'Error cargando reportes' });
  }
};

// GET /api/transparency/:period — público — un reporte específico
export const getPublishedReport = async (req, res) => {
  try {
    const { data } = await supabase
      .from('transparency_reports')
      .select('*')
      .eq('period', req.params.period)
      .eq('is_published', true)
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Reporte no encontrado o no publicado' });
    res.json({ report: data });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/admin/transparency/generate — body: { period, period_start, period_end }
export const generateReport = async (req, res) => {
  try {
    const { period, period_start, period_end } = req.body;
    if (!period || !period_start || !period_end) {
      return res.status(400).json({ error: 'period, period_start, period_end requeridos' });
    }
    const { data, error } = await supabase.rpc('generate_transparency_report', {
      p_period: period,
      p_start: period_start,
      p_end: period_end,
    });
    if (error) throw error;
    res.json({ report: data });
  } catch (err) {
    console.error('[generateReport]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/admin/transparency/:period — body: { is_published, notes? }
export const updateReport = async (req, res) => {
  try {
    const { is_published, notes } = req.body;
    const patch = {};
    if (typeof is_published === 'boolean') {
      patch.is_published = is_published;
      patch.published_at = is_published ? new Date().toISOString() : null;
    }
    if (typeof notes === 'string') patch.notes = notes;

    const { data, error } = await supabase
      .from('transparency_reports')
      .update(patch)
      .eq('period', req.params.period)
      .select()
      .single();
    if (error) throw error;
    res.json({ report: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/transparency — listar todos (publicados y no)
export const listAllReports = async (req, res) => {
  try {
    const { data } = await supabase
      .from('transparency_reports')
      .select('*')
      .order('period_end', { ascending: false });
    res.json({ reports: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
