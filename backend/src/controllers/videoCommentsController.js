import { supabase } from '../lib/supabase.js';
import { moderateText } from '../lib/textModeration.js';

// GET /api/adult-video/comments/:video_id?cursor=0&limit=30
export const listComments = async (req, res) => {
  try {
    const { video_id } = req.params;
    const cursor = parseInt(req.query.cursor) || 0;
    const limit  = Math.min(50, parseInt(req.query.limit) || 30);

    // Pinned primero, luego recientes
    const { data: pinned } = await supabase.from('video_comments')
      .select(`
        id, content, likes_count, is_pinned, edited_at, created_at, parent_id,
        user:profiles!user_id(id, full_name, username, avatar_url, is_verified)
      `)
      .eq('video_id', video_id).eq('is_hidden', false).eq('is_pinned', true).is('parent_id', null)
      .order('created_at', { ascending: false });

    const { data: recent } = await supabase.from('video_comments')
      .select(`
        id, content, likes_count, is_pinned, edited_at, created_at, parent_id,
        user:profiles!user_id(id, full_name, username, avatar_url, is_verified)
      `)
      .eq('video_id', video_id).eq('is_hidden', false).eq('is_pinned', false).is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(cursor, cursor + limit - 1);

    res.json({
      comments: [...(pinned || []), ...(recent || [])],
      nextCursor: (recent?.length || 0) === limit ? cursor + limit : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/adult-video/comments/:video_id/:comment_id/replies
export const listReplies = async (req, res) => {
  try {
    const { data } = await supabase.from('video_comments')
      .select(`
        id, content, likes_count, edited_at, created_at,
        user:profiles!user_id(id, full_name, username, avatar_url, is_verified)
      `)
      .eq('parent_id', req.params.comment_id).eq('is_hidden', false)
      .order('created_at', { ascending: true });
    res.json({ replies: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/adult-video/comments  body: { video_id, content, parent_id? }
export const createComment = async (req, res) => {
  try {
    const { video_id, content, parent_id } = req.body;
    if (!video_id || !content?.trim()) return res.status(400).json({ error: 'video_id y content requeridos' });
    if (content.length > 500) return res.status(400).json({ error: 'Máx 500 chars' });

    // Moderar texto
    const mod = await moderateText(content, { context: 'video_comment' });
    if (!mod.ok) {
      return res.status(422).json({ error: mod.reason || 'Comentario rechazado por moderación' });
    }

    const { data, error } = await supabase.from('video_comments').insert({
      video_id,
      user_id: req.user.id,
      parent_id: parent_id || null,
      content: content.trim(),
    }).select(`
      id, content, likes_count, created_at, parent_id,
      user:profiles!user_id(id, full_name, username, avatar_url, is_verified)
    `).single();
    if (error) throw error;

    // Notificar al creator del video si no es el mismo
    const { data: video } = await supabase.from('profile_videos')
      .select('user_id, title').eq('id', video_id).maybeSingle();
    if (video?.user_id && video.user_id !== req.user.id) {
      const { createNotification } = await import('./inAppNotifController.js');
      createNotification(
        video.user_id, 'video_comment',
        '💬 Nuevo comentario en tu video',
        content.slice(0, 100),
        { video_id, comment_id: data.id }
      ).catch(() => {});
    }

    res.status(201).json({ comment: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/adult-video/comments/:id  body: { content?, is_pinned? }
export const updateComment = async (req, res) => {
  try {
    const { content, is_pinned } = req.body;
    const { data: existing } = await supabase.from('video_comments')
      .select('user_id, video_id').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'No encontrado' });

    const patch = {};
    if (content !== undefined) {
      if (existing.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
      const mod = await moderateText(content, { context: 'video_comment' });
      if (!mod.ok) return res.status(422).json({ error: mod.reason });
      patch.content = content.trim();
      patch.edited_at = new Date().toISOString();
    }
    if (is_pinned !== undefined) {
      // Solo el creator del video puede pinear
      const { data: video } = await supabase.from('profile_videos')
        .select('user_id').eq('id', existing.video_id).maybeSingle();
      if (video?.user_id !== req.user.id) return res.status(403).json({ error: 'Solo el dueño del video puede pinear' });
      patch.is_pinned = !!is_pinned;
    }

    await supabase.from('video_comments').update(patch).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/adult-video/comments/:id — owner del comentario o del video
export const deleteComment = async (req, res) => {
  try {
    const { data: c } = await supabase.from('video_comments')
      .select('user_id, video_id').eq('id', req.params.id).maybeSingle();
    if (!c) return res.status(404).json({ error: 'No encontrado' });
    if (c.user_id !== req.user.id) {
      const { data: v } = await supabase.from('profile_videos')
        .select('user_id').eq('id', c.video_id).maybeSingle();
      if (v?.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    }
    await supabase.from('video_comments').update({ is_hidden: true, hidden_by: req.user.id })
      .eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/adult-video/comments/:id/like — toggle like
export const toggleLike = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('video_comment_likes')
      .select('comment_id').eq('comment_id', req.params.id).eq('user_id', req.user.id).maybeSingle();

    if (existing) {
      await supabase.from('video_comment_likes')
        .delete().eq('comment_id', req.params.id).eq('user_id', req.user.id);
      return res.json({ liked: false });
    }
    await supabase.from('video_comment_likes').insert({
      comment_id: req.params.id, user_id: req.user.id,
    });
    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
