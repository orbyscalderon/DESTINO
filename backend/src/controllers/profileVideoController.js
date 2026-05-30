import { supabase } from '../lib/supabase.js';
import { uploadFile, deleteFile } from '../lib/storageProvider.js';
import { spendCoins, addCoins, CREATOR_CUT } from './coinController.js';
import multer from 'multer';
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten videos (mp4, webm, mov, avi)'), false);
  },
});

export const uploadVideoMiddleware = (req, res, next) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El video no puede superar 500 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// POST /api/profiles/videos
export const uploadProfileVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún video' });

    const userId = req.user.id;
    const { title, description, is_paid, price, is_adult } = req.body;
    const isPaid = is_paid === 'true' || is_paid === true;
    const isAdult = is_adult === 'true' || is_adult === true;
    const coinPrice = isPaid ? Math.max(1, Math.min(9999, parseInt(price) || 0)) : 0;

    if (isPaid && coinPrice < 1) {
      return res.status(400).json({ error: 'El precio mínimo es 1 coin' });
    }

    if (isAdult) {
      const { data: prof } = await supabase.from('profiles').select('is_adult_creator').eq('id', userId).single();
      if (!prof?.is_adult_creator) {
        return res.status(403).json({ error: 'Activa el modo creador adulto para subir contenido 18+' });
      }
    }

    const ext = req.file.mimetype === 'video/webm' ? 'webm' : 'mp4';
    const storagePath = `profile_videos/${userId}/${Date.now()}.${ext}`;

    const url = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);

    const { data: video, error } = await supabase
      .from('profile_videos')
      .insert({
        user_id: userId,
        title: title?.trim() || null,
        description: description?.trim() || null,
        url,
        storage_path: storagePath,
        is_paid: isPaid,
        price: coinPrice,
        is_adult: isAdult,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ video });
  } catch (err) {
    console.error('uploadProfileVideo error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/:id/videos
export const getProfileVideos = async (req, res) => {
  try {
    const ownerId = req.params.id;
    const viewerId = req.user?.id;

    const { data: videos, error } = await supabase
      .from('profile_videos')
      .select('id, title, description, url, thumbnail_url, duration_seconds, is_paid, price, is_adult, views_count, created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Owner sees everything
    if (viewerId === ownerId) return res.json({ videos: videos || [] });

    // Check adult gating
    const { data: ownerProf } = await supabase.from('profiles').select('is_adult_creator').eq('id', ownerId).single();
    if (ownerProf?.is_adult_creator) {
      const { data: vp } = await supabase.from('profiles').select('is_adult_creator, age_verified_at').eq('id', viewerId).single();
      if (!vp?.is_adult_creator && !vp?.age_verified_at) {
        return res.json({ videos: [], requires_age_verification: true });
      }
    }

    // Check which paid videos the viewer has purchased
    const paidIds = (videos || []).filter(v => v.is_paid).map(v => v.id);
    let purchasedIds = new Set();
    if (paidIds.length > 0 && viewerId) {
      const { data: purchases } = await supabase
        .from('content_purchases')
        .select('content_id')
        .eq('buyer_id', viewerId)
        .eq('content_type', 'profile_video')
        .in('content_id', paidIds);
      purchasedIds = new Set((purchases || []).map(p => p.content_id));
    }

    const result = (videos || []).map(v => {
      if (!v.is_paid) return v;
      const purchased = purchasedIds.has(v.id);
      return { ...v, url: purchased ? v.url : null, is_purchased: purchased };
    });

    res.json({ videos: result });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/profiles/videos/:videoId
export const deleteProfileVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { data: video } = await supabase.from('profile_videos').select('id, user_id, storage_path').eq('id', videoId).single();

    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (video.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    if (video.storage_path) {
      await deleteFile([video.storage_path]).catch(() => {});
    }

    await supabase.from('profile_videos').delete().eq('id', videoId);
    res.json({ message: 'Video eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/videos/:videoId/pricing
export const setVideoPricing = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { is_paid, price } = req.body;
    const { data: video } = await supabase.from('profile_videos').select('id, user_id').eq('id', videoId).single();

    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (video.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const coinPrice = parseInt(price) || 0;
    if (is_paid && (coinPrice < 1 || coinPrice > 9999)) {
      return res.status(400).json({ error: 'El precio debe estar entre 1 y 9999 coins' });
    }

    await supabase.from('profile_videos').update({
      is_paid: !!is_paid,
      price: is_paid ? coinPrice : 0,
    }).eq('id', videoId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/videos/:videoId/purchase
export const purchaseProfileVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const buyerId = req.user.id;

    const { data: video } = await supabase
      .from('profile_videos')
      .select('id, user_id, is_paid, price, title')
      .eq('id', videoId)
      .single();

    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (!video.is_paid) return res.status(400).json({ error: 'Este video es gratuito' });
    if (video.user_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propio video' });

    // Check already purchased
    const { data: existing } = await supabase
      .from('content_purchases')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('content_id', videoId)
      .eq('content_type', 'profile_video')
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Ya compraste este video' });

    // Charge buyer
    try {
      await spendCoins(buyerId, video.price, 'video_purchase');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: `Coins insuficientes (necesitas ${video.price})`, code: 'INSUFFICIENT_COINS' });
      }
      throw e;
    }

    // Record purchase
    await supabase.from('content_purchases').insert({
      buyer_id: buyerId,
      content_id: videoId,
      content_type: 'profile_video',
      coins_paid: video.price,
    });

    // Credit creator (70% of price)
    const creatorShare = Math.floor(video.price * CREATOR_CUT);
    if (creatorShare > 0) {
      await addCoins(video.user_id, creatorShare, 'video_sale').catch(() => {});
    }

    res.json({ success: true, message: 'Video desbloqueado' });
  } catch (err) {
    console.error('purchaseProfileVideo error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
