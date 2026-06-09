import { supabase } from '../lib/supabase.js';

// PATCH /api/scheduled-content/post/:id — programar un post existente
export const schedulePost = async (req, res) => {
  try {
    const { scheduled_for } = req.body;
    if (!scheduled_for) return res.status(400).json({ error: 'scheduled_for requerido' });
    const when = new Date(scheduled_for);
    if (isNaN(when.getTime()) || when < new Date()) {
      return res.status(400).json({ error: 'scheduled_for debe ser futuro' });
    }

    const { data: post } = await supabase.from('posts')
      .select('user_id').eq('id', req.params.id).single();
    if (post?.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('posts').update({
      scheduled_for: when.toISOString(),
      status: 'scheduled',
      published_at: null,
    }).eq('id', req.params.id);
    res.json({ ok: true, scheduled_for: when.toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// PATCH /api/scheduled-content/reel/:id
export const scheduleReel = async (req, res) => {
  try {
    const { scheduled_for } = req.body;
    if (!scheduled_for) return res.status(400).json({ error: 'scheduled_for requerido' });
    const when = new Date(scheduled_for);
    if (isNaN(when.getTime()) || when < new Date()) {
      return res.status(400).json({ error: 'scheduled_for debe ser futuro' });
    }

    const { data: reel } = await supabase.from('reels')
      .select('user_id').eq('id', req.params.id).single();
    if (reel?.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('reels').update({
      scheduled_for: when.toISOString(),
      published_at: null,
    }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/scheduled-content/mine
export const listMyScheduled = async (req, res) => {
  try {
    const [posts, reels] = await Promise.all([
      supabase.from('posts')
        .select('id, caption, media_url, scheduled_for, status')
        .eq('user_id', req.user.id).not('scheduled_for', 'is', null).is('published_at', null)
        .order('scheduled_for', { ascending: true }),
      supabase.from('reels')
        .select('id, caption, video_url, scheduled_for')
        .eq('user_id', req.user.id).not('scheduled_for', 'is', null).is('published_at', null)
        .order('scheduled_for', { ascending: true }),
    ]);
    res.json({
      posts: posts.data || [],
      reels: reels.data || [],
    });
  } catch { res.status(500).json({ error: 'Error' }); }
};

// DELETE /api/scheduled-content/post/:id — cancelar programación
export const cancelScheduledPost = async (req, res) => {
  try {
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', req.params.id).single();
    if (post?.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('posts').update({ scheduled_for: null, status: 'draft' }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Helper interno — cron job que publica posts/reels cuyo scheduled_for ya pasó
export async function publishDueScheduledContent() {
  try {
    const now = new Date().toISOString();
    const { data: duePosts } = await supabase.from('posts')
      .select('id').lte('scheduled_for', now).is('published_at', null).limit(100);
    for (const p of duePosts || []) {
      await supabase.from('posts').update({
        published_at: now,
        status: 'published',
      }).eq('id', p.id);
    }

    const { data: dueReels } = await supabase.from('reels')
      .select('id').lte('scheduled_for', now).is('published_at', null).limit(100);
    for (const r of dueReels || []) {
      await supabase.from('reels').update({ published_at: now }).eq('id', r.id);
    }

    if ((duePosts?.length || 0) + (dueReels?.length || 0) > 0) {
      console.log(`[scheduled] published ${duePosts?.length || 0} posts, ${dueReels?.length || 0} reels`);
    }
  } catch (err) {
    console.error('[publishDueScheduledContent]', err.message);
  }
}
