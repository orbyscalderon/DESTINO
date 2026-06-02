import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import { detectVideoType, safeErrorMessage, safeString } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';
import multer from 'multer';

const MAX_REEL_DURATION_SECONDS = 90;
const MAX_REEL_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const reelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_REEL_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    // Validamos magic bytes después (más confiable que el header)
    if (file.mimetype?.startsWith('video/')) cb(null, true);
    else cb(new Error('Formato no soportado'), false);
  },
});

export const reelUploadMiddleware = (req, res, next) => {
  reelUpload.single('video')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El video no puede superar 100 MB' });
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
// FormData: video (file), caption (string), duration_seconds (number),
//           is_adult (boolean), thumbnail_url (optional)
export const uploadReel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Video requerido' });

    const userId = req.user.id;
    const caption = safeString(req.body.caption, 2000);
    const durationSec = parseFloat(req.body.duration_seconds);
    const isAdult = req.body.is_adult === 'true' || req.body.is_adult === true;
    const thumbnailUrl = safeString(req.body.thumbnail_url, 500);

    if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_REEL_DURATION_SECONDS) {
      return res.status(400).json({
        error: `Duración inválida (max ${MAX_REEL_DURATION_SECONDS}s)`,
      });
    }

    // Validar magic bytes
    const realType = detectVideoType(req.file.buffer);
    if (!realType) {
      return res.status(400).json({ error: 'Archivo no es un video válido' });
    }

    // Si marca adult, verificar que es creator adulto
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

    // Subir a storage
    const ext = realType === 'video/webm' ? 'webm' : 'mp4';
    const safeUserId = userId.replace(/[^a-f0-9\-]/gi, '');
    const storagePath = `reels/${safeUserId}/${Date.now()}.${ext}`;
    const videoUrl = await uploadFile(storagePath, req.file.buffer, realType);

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
      .select('id, video_url, caption, duration_seconds, hashtags, is_adult, created_at')
      .single();

    if (error) throw error;
    res.status(201).json({ reel });
  } catch (err) {
    console.error('[uploadReel] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/reels/feed?cursor=<created_at>&limit=10
// Algoritmo "For You" MVP: mezcla
//   - Reels recientes de cualquiera (mayoría)
//   - Reels de creadores que sigues (boost)
//   - Excluye reels que ya viste completos
//   - Filtra adult según permisos
export const getReelsFeed = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const cursor = req.query.cursor; // ISO timestamp

    // Permisos adult
    const { data: viewer } = await supabase
      .from('profiles')
      .select('is_adult_creator, age_verified_at, premium_tier')
      .eq('id', viewerId)
      .single();
    const canSeeAdult = !!viewer?.is_adult_creator
                     || !!viewer?.age_verified_at
                     || viewer?.premium_tier === 'vip';

    // Reels completados (>= 80%) para excluir
    const { data: completedViews } = await supabase
      .from('reel_views')
      .select('reel_id')
      .eq('viewer_id', viewerId)
      .eq('completed', true)
      .limit(500); // viewer reciente
    const completedSet = new Set((completedViews || []).map(v => v.reel_id));

    // Query principal
    let query = supabase
      .from('reels')
      .select(`
        id, video_url, thumbnail_url, caption, duration_seconds, hashtags,
        is_adult, likes_count, comments_count, views_count, shares_count, created_at,
        user:profiles!user_id (id, full_name, avatar_url, is_verified, is_creator, is_adult_creator)
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit * 2); // pedimos extra para filtrar

    if (!canSeeAdult) query = query.eq('is_adult', false);
    if (cursor)        query = query.lt('created_at', cursor);

    const { data: reels, error } = await query;
    if (error) throw error;

    // Filtrar los ya completados
    const filtered = (reels || []).filter(r => !completedSet.has(r.id)).slice(0, limit);

    // Marcar cuáles likeó el viewer
    if (filtered.length > 0) {
      const ids = filtered.map(r => r.id);
      const { data: likes } = await supabase
        .from('reel_likes')
        .select('reel_id')
        .eq('user_id', viewerId)
        .in('reel_id', ids);
      const likedSet = new Set((likes || []).map(l => l.reel_id));
      filtered.forEach(r => { r.viewer_liked = likedSet.has(r.id); });
    }

    const nextCursor = filtered.length > 0
      ? filtered[filtered.length - 1].created_at
      : null;

    res.json({ reels: filtered, next_cursor: nextCursor });
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
      return res.json({ liked: false, likes_count: newCount ?? 0 });
    }

    await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userId });
    const { data: newCount } = await supabase.rpc('increment_reel_likes', {
      p_reel_id: reelId, p_delta: 1,
    });

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
