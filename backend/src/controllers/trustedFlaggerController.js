import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

function hashKey(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

// POST /api/trusted-flaggers/report — autenticado vía X-Flagger-Key
// Body: { content_type, content_id?, content_url?, reason, illegality_basis? }
export const submitTrustedFlag = async (req, res) => {
  try {
    const rawKey = req.headers['x-flagger-key'];
    if (!rawKey) {
      return res.status(401).json({ error: 'X-Flagger-Key header requerido' });
    }

    const { data: flagger } = await supabase
      .from('trusted_flaggers')
      .select('id, organization_name, active')
      .eq('api_key_hash', hashKey(String(rawKey)))
      .eq('active', true)
      .maybeSingle();

    if (!flagger) {
      return res.status(403).json({ error: 'Trusted flagger no autorizado' });
    }

    const {
      content_type, content_id, content_url,
      reason, illegality_basis,
    } = req.body;

    if (!content_type || !reason) {
      return res.status(400).json({ error: 'content_type y reason son requeridos' });
    }

    const { data, error } = await supabase
      .from('trusted_flag_reports')
      .insert({
        flagger_id: flagger.id,
        content_type, content_id: content_id || null,
        content_url: content_url || null,
        reason, illegality_basis: illegality_basis || null,
      })
      .select('id, submitted_at')
      .single();

    if (error) throw error;

    res.status(201).json({
      ok: true,
      report_id: data.id,
      received_at: data.submitted_at,
      sla: '24 hours per DSA Art. 22(1)',
    });
  } catch (err) {
    console.error('[submitTrustedFlag]', err.message);
    res.status(500).json({ error: 'Error procesando flag' });
  }
};

// GET /api/admin/trusted-flag-reports?status=pending
export const listFlagReports = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { data } = await supabase
      .from('trusted_flag_reports')
      .select('*, flagger:trusted_flaggers(organization_name, country_code)')
      .eq('status', status)
      .order('submitted_at', { ascending: false })
      .limit(200);
    res.json({ reports: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PATCH /api/admin/trusted-flag-reports/:id
// Body: { action: 'review'|'action'|'dismiss', resolution?, notes? }
export const processFlagReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, resolution, notes } = req.body;

    const statusMap = { review: 'reviewed', action: 'actioned', dismiss: 'dismissed' };
    const status = statusMap[action];
    if (!status) return res.status(400).json({ error: 'Acción inválida' });

    const { error } = await supabase
      .from('trusted_flag_reports')
      .update({
        status,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        resolution: resolution || null,
        resolution_notes: notes || null,
      })
      .eq('id', id);
    if (error) throw error;

    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/trusted-flaggers
export const listFlaggers = async (req, res) => {
  try {
    const { data } = await supabase
      .from('trusted_flaggers')
      .select('id, organization_name, contact_name, contact_email, country_code, designation_authority, active, designated_at, notes')
      .order('designated_at', { ascending: false });
    res.json({ flaggers: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/admin/trusted-flaggers — crear con API key
export const createFlagger = async (req, res) => {
  try {
    const {
      organization_name, contact_name, contact_email,
      country_code, designation_authority, notes,
    } = req.body;

    if (!organization_name || !contact_email || !country_code) {
      return res.status(400).json({ error: 'organization_name, contact_email y country_code requeridos' });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const { data, error } = await supabase.from('trusted_flaggers').insert({
      organization_name, contact_name: contact_name || null,
      contact_email: contact_email.toLowerCase().trim(),
      country_code: country_code.toUpperCase(),
      designation_authority: designation_authority || null,
      api_key_hash: hashKey(apiKey),
      notes: notes || null,
    }).select('id, organization_name').single();

    if (error) throw error;

    res.status(201).json({
      flagger: data,
      api_key: apiKey,
      warning: 'Guarda este api_key — no volveremos a mostrarlo. El flagger lo usará en X-Flagger-Key.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/admin/trusted-flaggers/:id — toggle active
export const toggleFlaggerActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active boolean requerido' });
    await supabase.from('trusted_flaggers').update({ active }).eq('id', id);
    res.json({ ok: true, active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
