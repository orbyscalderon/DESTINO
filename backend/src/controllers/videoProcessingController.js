import { supabase } from '../lib/supabase.js';

// Encola un job de procesamiento async (Whisper captions o sprite thumbnails).
// El worker `videoProcessingWorker.js` lo procesa según feature flag.
export async function enqueueProcessingJob({ video_id, source_url, kind }) {
  try {
    const { data, error } = await supabase.from('video_processing_jobs').insert({
      video_id, source_url, kind, status: 'queued',
    }).select('id').single();
    if (error) throw error;
    return data?.id;
  } catch (err) {
    console.error('[enqueueProcessingJob]', err.message);
    return null;
  }
}

// GET /api/adult-video/captions/:video_id
export const listCaptions = async (req, res) => {
  try {
    const { data } = await supabase.from('video_captions')
      .select('id, language, vtt_url, source, is_default')
      .eq('video_id', req.params.video_id);
    res.json({ captions: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/adult-video/captions  body: { video_id, language, vtt_url, is_default }
// Para creators que subieron caption manual
export const addCaption = async (req, res) => {
  try {
    const { video_id, language, vtt_url, is_default } = req.body;
    const { data: video } = await supabase.from('profile_videos')
      .select('user_id').eq('id', video_id).maybeSingle();
    if (video?.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    if (is_default) {
      await supabase.from('video_captions').update({ is_default: false }).eq('video_id', video_id);
    }

    const { data, error } = await supabase.from('video_captions').insert({
      video_id, language: language || 'es', vtt_url,
      source: 'creator', is_default: !!is_default,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ caption: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/adult-video/processing/:video_id/status
export const getJobsStatus = async (req, res) => {
  try {
    const { data } = await supabase.from('video_processing_jobs')
      .select('id, kind, status, output_url, error, completed_at')
      .eq('video_id', req.params.video_id);
    res.json({ jobs: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
