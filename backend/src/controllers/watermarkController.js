import { supabase } from '../lib/supabase.js';

// POST /api/watermark/enqueue
// Body: { video_id, source_url, watermark_text, priority? }
// Solo backend interno o admin lo llama — desde el uploadController de adult videos.
export const enqueueJob = async (req, res) => {
  try {
    const { video_id, source_url, watermark_text, priority } = req.body;
    if (!source_url || !watermark_text) {
      return res.status(400).json({ error: 'source_url y watermark_text requeridos' });
    }

    const { data, error } = await supabase.from('watermark_jobs').insert({
      source_video_id: video_id || null,
      source_url,
      watermark_text,
      priority: priority != null ? parseInt(priority) : 5,
    }).select('id').single();

    if (error) throw error;
    res.status(201).json({ job_id: data.id, status: 'queued' });
  } catch (err) {
    console.error('enqueueJob', err.message);
    res.status(500).json({ error: 'Error enqueing watermark' });
  }
};

// GET /api/watermark/status/:jobId
export const getJobStatus = async (req, res) => {
  try {
    const { data } = await supabase
      .from('watermark_jobs')
      .select('id, status, output_url, error, retries, started_at, completed_at')
      .eq('id', req.params.jobId)
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Job no encontrado' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/admin/watermark/queue
export const listQueue = async (req, res) => {
  try {
    const status = req.query.status || 'queued';
    const { data } = await supabase
      .from('watermark_jobs')
      .select('*')
      .eq('status', status)
      .order('enqueued_at', { ascending: false })
      .limit(100);
    res.json({ jobs: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
