import { supabase, broadcastToChannel } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import { detectImageType, detectVideoType, safeErrorMessage, safeString } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';
import multer from 'multer';

// Broadcast helper: emite evento a todos los viewers del reel (vía Supabase Realtime).
// Fire-and-forget para no bloquear la respuesta.
function broadcastReelEvent(reelId, event, payload) {
  broadcastToChannel(`reel:${reelId}`, event, payload).catch(() => {});
}

const MAX_REEL_DURATION_SECONDS = 90;
const MAX_REEL_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const reelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_REEL_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    // Aceptamos video Y un thumbnail opcional (imagen)
    const ok = file.mimetype?.startsWith('video/')
            || file.mimetype?.startsWith('image/');
    if (ok) cb(null, true);
    else cb(new Error('Formato no soportado'), false);
  },
});

// Multipart con 2 campos: 'video' (requerido) + 'thumbnail' (opcional)
export const reelUploadMiddleware = (req, res, next) => {
  reelUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ])(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo no puede superar 100 MB' });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// Extraer hashtags de un caption ("#palabra" → "palabra")
function extractHashtags(caption) {
  if (!caption) return [];
  const matches = caption.match(/#([a-zA-Z0-9_áéíóúüñ]+)/gi) || [];
  return Array.from(new Set(matches.map(t => t.substring(1).toLowerCase()))).slice(0, 10);
}

// POST /api/reels — subir un reel
// multipart/form-data:
//   video (file, requerido)
//   thumbnail (file, opcional — primer frame generado por el cliente)
//   caption, duration_seconds, is_adult
export const uploadReel = async (req, res) => {
  try {
    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];
    if (!videoFile) return res.status(400).json({ error: 'Video requerido' });

    const userId = req.user.id;
    const caption = safeString(req.body.caption, 2000);
    const durationSec = parseFloat(req.body.duration_seconds);
    const isAdult = req.body.is_adult === 'true' || req.body.is_adult === true;

    if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_REEL_DURATION_SECONDS) {
      return res.status(400).json({
        error: `Duración inválida (max ${MAX_REEL_DURATION_SECONDS}s)`,
      });
    }

    // Validar magic bytes del video
    const realVideoType = detectVideoType(videoFile.buffer);
    if (!realVideoType) {
      return res.status(400).json({ error: 'Archivo no es un video válido' });
    }

    // Si marca adult, verificar que es creator adulto verificado
    if (isAdult) {
      const { data: profile } = await supabase
        .from('profiles').select('is_adult_creator, age_verified_at').eq('id', userId).single();
      const canPublishAdult = !!profile?.is_adult_creator && !!profile?.age_verified_at;
      if (!canPublishAdult) {
        return res.status(403).json({
          error: 'Solo creadores adultos verificados pueden publicar contenido +18',
        });
      }
    }

    const safeUserId = userId.replace(/[^a-f0-9\-]/gi, '');
    const base = `reels/${safeUserId}/${Date.now()}`;

    // Subir video
    const ext = realVideoType === 'video/webm' ? 'webm' : 'mp4';
    const videoUrl = await uploadFile(`${base}.${ext}`, videoFile.buffer, realVideoType);

    // Subir thumbnail si vino + es válido
    let thumbnailUrl = null;
    if (thumbFile) {
      const thumbType = detectImageType(thumbFile.buffer);
      if (thumbType) {
        const thumbExt = thumbType.split('/')[1] || 'jpg';
        thumbnailUrl = await uploadFile(`${base}_thumb.${thumbExt}`, thumbFile.buffer, thumbType);
      }
    }

    const hashtags = extractHashtags(caption);

    const { data: reel, error } = await supabase
      .from('reels')
      .insert({
        user_id: userId,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption,
        duration_seconds: durationSec,
        hashtags,
        is_adult: isAdult,
        status: 'published',
      })
      .select('id, video_url, thumbnail_url, caption, duration_seconds, hashtags, is_adult, created_at')
      .single();

    if (error) throw error;
    res.status(201).json({ reel });
  } catch (err) {
    console.error('[uploadReel] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/reels/feed?cursor=<offset>&limit=10&tag=<hashtag>
// Algoritmo "For You 2.0" usando RPC rank_reels_for_user:
//   - +50 si sigues al creator
//   - +20 si comparte hashtags con reels que likeaste
//   - +log(likes/views) por engagement
//   - +decay temporal (recencia)
//   - Excluye reels ya completados (>=80% watched)
//   - Filtra adult según permisos
//   - Filtra por hashtag específico si viene query.tag
export const getReelsFeed = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const offset = Math.max(parseInt(req.query.cursor) || 0, 0);
    const tag = (req.query.tag || '').toLowerCase().trim() || null;

    // Permisos adult
    const { data: viewer } = await supabase
      .from('profiles')
      .select('is_adult_creator, age_verified_at, premium_tier')
      .eq('id', viewerId)
      .single();
    const canSeeAdult = !!viewer?.is_adult_creator
                     || !!viewer?.age_verified_at
                     || viewer?.premium_tier === 'vip';

    // RPC: ranking inteligente
    const { data: ranked, error: rpcErr } = await supabase.rpc('rank_reels_for_user', {
      p_viewer_id: viewerId,
      p_limit: limit + offset,           // pedir suficiente para paginar
      p_max_age_days: 30,
      p_include_adult: canSeeAdult,
      p_filter_hashtag: tag,
    });
    if (rpcErr) throw rpcErr;

    const slice = (ranked || []).slice(offset, offset + limit);
    if (slice.length === 0) {
      return res.json({ reels: [], next_cursor: null });
    }

    const ids = slice.map(r => r.reel_id);

    // Hydrate reels con sus columnas + creator
    const { data: reels } = await supabase
      .from('reels')
      .select(`
        id, video_url, thumbnail_url, caption, duration_seconds, hashtags,
        is_adult, likes_count, comments_count, views_count, shares_count, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified, is_creator, is_adult_creator)
      `)
      .in('id', ids);

    // Likes del viewer
    const { data: likes } = await supabase
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', viewerId)
      .in('reel_id', ids);
    const likedSet = new Set((likes || []).map(l => l.reel_id));

    // Mantener el orden del ranking
    const idToReel = new Map((reels || []).map(r => [r.id, r]));
    const ordered = slice
      .map(s => idToReel.get(s.reel_id))
      .filter(Boolean)
      .map(r => ({ ...r, viewer_liked: likedSet.has(r.id) }));

    const nextCursor = (ranked || []).length > offset + limit ? offset + limit : null;
    res.json({ reels: ordered, next_cursor: nextCursor });
  } catch (err) {
    console.error('[getReelsFeed] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/reels/user/:userId — reels de un creador específico
export const getUserReels = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 30);

    const { data: reels } = await supabase
      .from('reels')
      .select('id, video_url, thumbnail_url, caption, duration_seconds, hashtags, is_adult, likes_count, comments_count, views_count, created_at')
      .eq('user_id', userId)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);

    res.json({ reels: reels || [] });
  } catch (err) {
    console.error('[getUserReels] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/reels/:id/like — toggle like
export const toggleLikeReel = async (req, res) => {
  try {
    const userId = req.user.id;
    const reelId = req.params.id;

    // ¿Ya likeado?
    const { data: existing } = await supabase
      .from('reel_likes')
      .select('reel_id')
      .eq('reel_id', reelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('reel_likes')
        .delete()
        .eq('reel_id', reelId)
        .eq('user_id', userId);
      const { data: newCount } = await supabase.rpc('increment_reel_likes', {
        p_reel_id: reelId, p_delta: -1,
      });
      broadcastReelEvent(reelId, 'like_changed', { likes_count: newCount ?? 0, delta: -1 });
      return res.json({ liked: false, likes_count: newCount ?? 0 });
    }

    await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userId });
    const { data: newCount } = await supabase.rpc('increment_reel_likes', {
      p_reel_id: reelId, p_delta: 1,
    });
    broadcastReelEvent(reelId, 'like_changed', { likes_count: newCount ?? 1, delta: 1 });

    // Notificar al dueño del reel (no si se likea a sí mismo)
    const { data: reel } = await supabase
      .from('reels').select('user_id, caption').eq('id', reelId).single();
    if (reel && reel.user_id !== userId) {
      const { data: liker } = await supabase.from('profiles')
        .select('full_name').eq('id', userId).single();
      createNotification(
        reel.user_id, 'reel_like',
        `❤️ A ${liker?.full_name || 'alguien'} le gustó tu reel`,
        reel.caption?.substring(0, 80) || '',
        { reel_id: reelId, liker_id: userId }
      ).catch(() => {});
      sendPushToUser(reel.user_id, {
        title: `❤️ ${liker?.full_name || 'Alguien'} likeó tu reel`,
        body: reel.caption?.substring(0, 80) || '',
        url: `/reels#${reelId}`,
      }).catch(() => {});
    }

    res.json({ liked: true, likes_count: newCount ?? 1 });
  } catch (err) {
    console.error('[toggleLikeReel] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/reels/:id/view — track view
// Body: { watched_seconds: number }
export const trackReelView = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const reelId = req.params.id;
    const watched = parseFloat(req.body.watched_seconds) || 0;

    // Necesitamos la duración para decidir si "completó"
    const { data: reel } = await supabase
      .from('reels').select('user_id, duration_seconds').eq('id', reelId).single();
    if (!reel) return res.status(404).json({ error: 'Reel no encontrado' });

    const isOwner = viewerId === reel.user_id;
    if (isOwner) return res.json({ skipped: true, reason: 'own_reel' });

    const completed = watched >= (parseFloat(reel.duration_seconds) * 0.8);

    // Upsert reel_views (una fila final por viewer)
    const { data: existing } = await supabase
      .from('reel_views')
      .select('id, watched_seconds, completed')
      .eq('reel_id', reelId)
      .eq('viewer_id', viewerId)
      .maybeSingle();

    if (existing) {
      // Solo actualizar si watched_seconds aumentó (no permitir down-grade)
      if (watched > (parseFloat(existing.watched_seconds) || 0)) {
        await supabase.from('reel_views').update({
          watched_seconds: watched,
          completed: completed || existing.completed,
          viewed_at: new Date().toISOString(),
        }).eq('id', existing.id);
      }
      return res.json({ tracked: true, was_first: false });
    }

    await supabase.from('reel_views').insert({
      reel_id: reelId, viewer_id: viewerId,
      watched_seconds: watched, completed,
    });

    // Incrementar views_count del reel solo en la PRIMERA view
    await supabase.rpc('increment_reel_views', { p_reel_id: reelId });

    res.json({ tracked: true, was_first: true });
  } catch (err) {
    console.error('[trackReelView] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// DELETE /api/reels/:id — borrar reel (solo dueño)
export const deleteReel = async (req, res) => {
  try {
    const userId = req.user.id;
    const reelId = req.params.id;

    const { data: reel } = await supabase
      .from('reels').select('user_id').eq('id', reelId).single();
    if (!reel) return res.status(404).json({ error: 'Reel no encontrado' });
    if (reel.user_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('reels').delete().eq('id', reelId);
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteReel] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/reels/:id/comments?cursor=<created_at>&limit=20
// Devuelve solo comments raíz (parent_comment_id IS NULL).
// Cada comment incluye reply_count y viewer_liked.
export const getReelComments = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const reelId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor;

    let query = supabase
      .from('reel_comments')
      .select(`
        id, content, likes_count, reply_count, parent_comment_id, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified)
      `)
      .eq('reel_id', reelId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);

    const { data: comments, error } = await query;
    if (error) throw error;

    // Marcar cuáles likeó el viewer
    const list = comments || [];
    if (list.length > 0) {
      const ids = list.map(c => c.id);
      const { data: likes } = await supabase
        .from('reel_comment_likes')
        .select('comment_id')
        .eq('user_id', viewerId)
        .in('comment_id', ids);
      const liked = new Set((likes || []).map(l => l.comment_id));
      list.forEach(c => { c.viewer_liked = liked.has(c.id); });
    }

    const nextCursor = list.length === limit ? list[list.length - 1].created_at : null;
    res.json({ comments: list, next_cursor: nextCursor });
  } catch (err) {
    console.error('[getReelComments] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/reels/:id/comments/:commentId/replies?cursor=<created_at>&limit=20
export const getReelCommentReplies = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { id: reelId, commentId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor;

    let query = supabase
      .from('reel_comments')
      .select(`
        id, content, likes_count, reply_count, parent_comment_id, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified)
      `)
      .eq('reel_id', reelId)
      .eq('parent_comment_id', commentId)
      .order('created_at', { ascending: true })  // replies en orden cronológico
      .limit(limit);

    if (cursor) query = query.gt('created_at', cursor);

    const { data: replies, error } = await query;
    if (error) throw error;

    const list = replies || [];
    if (list.length > 0) {
      const ids = list.map(c => c.id);
      const { data: likes } = await supabase
        .from('reel_comment_likes')
        .select('comment_id')
        .eq('user_id', viewerId)
        .in('comment_id', ids);
      const liked = new Set((likes || []).map(l => l.comment_id));
      list.forEach(c => { c.viewer_liked = liked.has(c.id); });
    }

    const nextCursor = list.length === limit ? list[list.length - 1].created_at : null;
    res.json({ replies: list, next_cursor: nextCursor });
  } catch (err) {
    console.error('[getReelCommentReplies] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/reels/:id/comments
// Body: { content, parent_comment_id? }
export const addReelComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const reelId = req.params.id;
    const content = safeString(req.body.content, 500);
    const parentId = req.body.parent_comment_id || null;

    if (!content) return res.status(400).json({ error: 'Comentario vacío' });

    // Verificar que el reel existe
    const { data: reel } = await supabase
      .from('reels').select('user_id').eq('id', reelId).single();
    if (!reel) return res.status(404).json({ error: 'Reel no encontrado' });

    // Si es reply, validar que el parent existe y es del mismo reel
    let parentComment = null;
    if (parentId) {
      const { data: parent } = await supabase
        .from('reel_comments').select('id, reel_id, user_id, parent_comment_id')
        .eq('id', parentId).single();
      if (!parent || parent.reel_id !== reelId) {
        return res.status(400).json({ error: 'Comentario padre inválido' });
      }
      // No permitir replies a replies (solo 1 nivel) — replyear al raíz directamente
      if (parent.parent_comment_id) {
        return res.status(400).json({ error: 'Solo se permite un nivel de respuestas' });
      }
      parentComment = parent;
    }

    const { data: comment, error } = await supabase
      .from('reel_comments')
      .insert({ reel_id: reelId, user_id: userId, content, parent_comment_id: parentId })
      .select(`
        id, content, likes_count, reply_count, parent_comment_id, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified)
      `)
      .single();

    if (error) throw error;
    comment.viewer_liked = false;

    // Counters atómicos
    if (parentId) {
      await supabase.rpc('increment_reel_reply_count', { p_comment_id: parentId, p_delta: 1 });
      await supabase.rpc('increment_reel_comments', { p_reel_id: reelId, p_delta: 1 });
    } else {
      await supabase.rpc('increment_reel_comments', { p_reel_id: reelId, p_delta: 1 });
    }

    broadcastReelEvent(reelId, 'comment_added', {
      comment_id: comment.id,
      parent_id: parentId,
      delta: 1,
    });

    // Notificar
    const { data: commenter } = await supabase.from('profiles')
      .select('full_name').eq('id', userId).single();

    if (parentComment && parentComment.user_id !== userId) {
      // Reply → notificar al autor del comment padre
      createNotification(
        parentComment.user_id, 'reel_reply',
        `💬 ${commenter?.full_name || 'Alguien'} te respondió`,
        content.substring(0, 100),
        { reel_id: reelId, comment_id: comment.id, parent_id: parentId, user_id: userId }
      ).catch(() => {});
      sendPushToUser(parentComment.user_id, {
        title: `💬 ${commenter?.full_name || 'Alguien'} te respondió`,
        body: content.substring(0, 80),
        url: `/reels?id=${reelId}`,
      }).catch(() => {});
    } else if (!parentId && reel.user_id !== userId) {
      // Comment raíz → notificar al dueño del reel
      createNotification(
        reel.user_id, 'reel_comment',
        `💬 ${commenter?.full_name || 'Alguien'} comentó tu reel`,
        content.substring(0, 100),
        { reel_id: reelId, comment_id: comment.id, user_id: userId }
      ).catch(() => {});
      sendPushToUser(reel.user_id, {
        title: `💬 ${commenter?.full_name || 'Alguien'} comentó tu reel`,
        body: content.substring(0, 80),
        url: `/reels?id=${reelId}`,
      }).catch(() => {});
    }

    res.status(201).json({ comment });
  } catch (err) {
    console.error('[addReelComment] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/reels/comments/:commentId/like — toggle like a un comment
export const toggleLikeComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { commentId } = req.params;

    const { data: existing } = await supabase
      .from('reel_comment_likes')
      .select('comment_id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('reel_comment_likes')
        .delete().eq('comment_id', commentId).eq('user_id', userId);
      const { data: newCount } = await supabase.rpc('increment_reel_comment_likes', {
        p_comment_id: commentId, p_delta: -1,
      });
      return res.json({ liked: false, likes_count: newCount ?? 0 });
    }

    await supabase.from('reel_comment_likes').insert({ comment_id: commentId, user_id: userId });
    const { data: newCount } = await supabase.rpc('increment_reel_comment_likes', {
      p_comment_id: commentId, p_delta: 1,
    });
    res.json({ liked: true, likes_count: newCount ?? 1 });
  } catch (err) {
    console.error('[toggleLikeComment] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// DELETE /api/reels/:reelId/comments/:commentId
export const deleteReelComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reelId, commentId } = req.params;

    const { data: comment } = await supabase
      .from('reel_comments')
      .select('user_id, reel_id, parent_comment_id, reply_count')
      .eq('id', commentId)
      .single();

    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (comment.reel_id !== reelId) return res.status(400).json({ error: 'Comentario no pertenece a este reel' });

    const { data: reel } = await supabase.from('reels').select('user_id').eq('id', reelId).single();
    const isCommentAuthor = comment.user_id === userId;
    const isReelOwner = reel?.user_id === userId;
    if (!isCommentAuthor && !isReelOwner) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('reel_comments').delete().eq('id', commentId);

    // Decrementar comments_count del reel: -1 por el comment + N por sus replies
    // (CASCADE ya borró las replies hijas).
    const decrementBy = 1 + (comment.reply_count || 0);
    await supabase.rpc('increment_reel_comments', { p_reel_id: reelId, p_delta: -decrementBy });

    // Si era reply, decrementar reply_count del padre
    if (comment.parent_comment_id) {
      await supabase.rpc('increment_reel_reply_count', {
        p_comment_id: comment.parent_comment_id, p_delta: -1,
      });
    }

    broadcastReelEvent(reelId, 'comment_deleted', {
      comment_id: commentId,
      delta: -decrementBy,
    });

    res.json({ success: true, removed_count: decrementBy });
  } catch (err) {
    console.error('[deleteReelComment] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/reels/:id — un reel específico (para deep links)
export const getReel = async (req, res) => {
  try {
    const reelId = req.params.id;
    const viewerId = req.user?.id;

    const { data: reel } = await supabase
      .from('reels')
      .select(`
        id, video_url, thumbnail_url, caption, duration_seconds, hashtags,
        is_adult, likes_count, comments_count, views_count, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified, is_creator)
      `)
      .eq('id', reelId)
      .eq('status', 'published')
      .single();

    if (!reel) return res.status(404).json({ error: 'Reel no encontrado' });

    if (viewerId) {
      const { data: like } = await supabase
        .from('reel_likes').select('reel_id')
        .eq('reel_id', reelId).eq('user_id', viewerId).maybeSingle();
      reel.viewer_liked = !!like;
    }

    res.json({ reel });
  } catch (err) {
    console.error('[getReel] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};
