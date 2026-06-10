import { supabase } from '../lib/supabase.js';

// POST /api/adult-video/watch  body: { video_id, position_seconds, watched_seconds, completed }
// Llamado periódicamente (cada 15-30s) durante playback + al pause + al unload
export const upsertWatchProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { video_id, position_seconds, watched_seconds, completed } = req.body;
    if (!video_id) return res.status(400).json({ error: 'video_id requerido' });

    const pos = Math.max(0, parseInt(position_seconds) || 0);
    const watched = Math.max(0, parseInt(watched_seconds) || 0);

    const { data: existing } = await supabase.from('video_watch_history')
      .select('view_count').eq('user_id', userId).eq('video_id', video_id).maybeSingle();

    await supabase.from('video_watch_history').upsert({
      user_id: userId, video_id,
      resume_position_seconds: pos,
      watched_seconds: watched,
      completed: !!completed,
      view_count: existing ? existing.view_count : 1,
      last_watched_at: new Date().toISOString(),
    }, { onConflict: 'user_id,video_id' });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/adult-video/watch/:video_id/new-session — incrementa view_count
export const startNewSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { video_id } = req.params;
    const { data: existing } = await supabase.from('video_watch_history')
      .select('view_count').eq('user_id', userId).eq('video_id', video_id).maybeSingle();
    if (existing) {
      await supabase.from('video_watch_history')
        .update({ view_count: (existing.view_count || 0) + 1, last_watched_at: new Date().toISOString() })
        .eq('user_id', userId).eq('video_id', video_id);
    } else {
      await supabase.from('video_watch_history').insert({
        user_id: userId, video_id, view_count: 1,
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/adult-video/watch/:video_id — resume info
export const getResumeInfo = async (req, res) => {
  try {
    const { data } = await supabase.from('video_watch_history')
      .select('resume_position_seconds, watched_seconds, completed, view_count, last_watched_at')
      .eq('user_id', req.user.id).eq('video_id', req.params.video_id).maybeSingle();
    res.json({ resume: data || null });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/adult-video/watch/continue?limit=20 — continue watching feed
export const getContinueWatching = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const { data } = await supabase.from('video_watch_history')
      .select(`
        video_id, resume_position_seconds, watched_seconds, last_watched_at,
        video:profile_videos(id, title, thumbnail_url, duration_seconds, user_id, is_adult, is_hidden)
      `)
      .eq('user_id', req.user.id)
      .eq('completed', false)
      .gt('resume_position_seconds', 30)
      .order('last_watched_at', { ascending: false })
      .limit(limit);

    const items = (data || [])
      .filter(d => d.video && !d.video.is_hidden)
      .map(d => ({
        video: d.video,
        resume_position_seconds: d.resume_position_seconds,
        progress_pct: d.video.duration_seconds
          ? Math.min(100, Math.round((d.resume_position_seconds / d.video.duration_seconds) * 100))
          : 0,
        last_watched_at: d.last_watched_at,
      }));
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// DELETE /api/adult-video/watch/:video_id — limpiar item de history
export const removeFromHistory = async (req, res) => {
  try {
    await supabase.from('video_watch_history')
      .delete()
      .eq('user_id', req.user.id).eq('video_id', req.params.video_id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
