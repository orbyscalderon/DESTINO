import { supabase } from '../lib/supabase.js';
import { uploadFile, deleteFile } from '../lib/storageProvider.js';
import { spendCoins, addCoins } from './coinController.js';
import multer from 'multer';
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten videos (mp4, webm, mov, avi)'), false);
  },
});

export const deliverVideoMiddleware = (req, res, next) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El video no puede superar 500 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// POST /api/video-requests
export const createVideoRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { creator_id, message, price } = req.body;

    if (!creator_id) return res.status(400).json({ error: 'Falta el creador' });
    if (creator_id === requesterId) return res.status(400).json({ error: 'No puedes hacerte una solicitud a ti mismo' });

    const coinPrice = Math.max(1, Math.min(99999, parseInt(price) || 0));
    if (!coinPrice) return res.status(400).json({ error: 'El precio mínimo es 1 coin' });

    // Verify creator exists and is a creator
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, is_creator, full_name')
      .eq('id', creator_id)
      .single();

    if (!creator) return res.status(404).json({ error: 'Creador no encontrado' });
    if (!creator.is_creator) return res.status(400).json({ error: 'Este usuario no es creador' });

    // Hold coins from requester (escrow)
    try {
      await spendCoins(requesterId, coinPrice, 'video_request_escrow');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: `Coins insuficientes (necesitas ${coinPrice})`, code: 'INSUFFICIENT_COINS' });
      }
      throw e;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { data: request, error } = await supabase
      .from('video_requests')
      .insert({
        requester_id: requesterId,
        creator_id,
        message: message?.trim() || null,
        price: coinPrice,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      await addCoins(requesterId, coinPrice, 'video_request_refund').catch(() => {});
      throw error;
    }

    // Notify creator
    const { data: requesterProfile } = await supabase
      .from('profiles').select('full_name').eq('id', requesterId).single();
    await supabase.from('in_app_notifications').insert({
      user_id: creator_id,
      type: 'boost',
      title: `${requesterProfile?.full_name || 'Alguien'} quiere encargarte un video`,
      body: message?.trim() ? message.trim().substring(0, 80) : `Ofrecen ${coinPrice} monedas`,
      data: { request_id: request.id, from_user_id: requesterId, price: coinPrice },
    }).catch(() => {});

    res.status(201).json({ request });
  } catch (err) {
    console.error('createVideoRequest error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/video-requests/received
export const getReceivedRequests = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from('video_requests')
      .select(`
        id, message, price, status, created_at, expires_at, completed_at, video_url,
        requester:profiles!requester_id(id, full_name, username, avatar_url, is_premium)
      `)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ requests: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/video-requests/sent
export const getSentRequests = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from('video_requests')
      .select(`
        id, message, price, status, created_at, expires_at, completed_at, video_url,
        creator:profiles!creator_id(id, full_name, username, avatar_url, is_creator, is_premium)
      `)
      .eq('requester_id', requesterId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ requests: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/video-requests/:id/accept
export const acceptVideoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorId = req.user.id;

    const { data: request } = await supabase
      .from('video_requests')
      .select('id, creator_id, status, expires_at')
      .eq('id', id)
      .single();

    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.creator_id !== creatorId) return res.status(403).json({ error: 'No autorizado' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden aceptar solicitudes pendientes' });
    if (new Date(request.expires_at) < new Date()) return res.status(400).json({ error: 'La solicitud ha expirado' });

    // Extend expiry 7 more days from acceptance
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('video_requests')
      .update({ status: 'accepted', expires_at: newExpiry })
      .eq('id', id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/video-requests/:id/reject
export const rejectVideoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorId = req.user.id;

    const { data: request } = await supabase
      .from('video_requests')
      .select('id, creator_id, requester_id, status, price')
      .eq('id', id)
      .single();

    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.creator_id !== creatorId) return res.status(403).json({ error: 'No autorizado' });
    if (!['pending', 'accepted'].includes(request.status)) {
      return res.status(400).json({ error: 'No se puede rechazar en este estado' });
    }

    await supabase
      .from('video_requests')
      .update({ status: 'rejected' })
      .eq('id', id);

    // Refund buyer
    await addCoins(request.requester_id, request.price, 'video_request_refund').catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/video-requests/:id/deliver
export const deliverVideoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorId = req.user.id;

    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún video' });

    const { data: request } = await supabase
      .from('video_requests')
      .select('id, creator_id, requester_id, status, price, storage_path')
      .eq('id', id)
      .single();

    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.creator_id !== creatorId) return res.status(403).json({ error: 'No autorizado' });
    if (request.status !== 'accepted') return res.status(400).json({ error: 'Solo se pueden entregar solicitudes aceptadas' });

    const ext = req.file.mimetype === 'video/webm' ? 'webm' : 'mp4';
    const storagePath = `video_requests/${creatorId}/${id}.${ext}`;

    // Remove old delivery if re-delivering
    if (request.storage_path) {
      await deleteFile([request.storage_path]).catch(() => {});
    }

    const videoUrl = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);

    await supabase
      .from('video_requests')
      .update({
        status: 'completed',
        video_url: videoUrl,
        storage_path: storagePath,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Pay creator 70%
    const creatorShare = Math.floor(request.price * 0.7);
    if (creatorShare > 0) {
      await addCoins(creatorId, creatorShare, 'video_request_sale').catch(() => {});
    }

    res.json({ success: true, video_url: videoUrl });
  } catch (err) {
    console.error('deliverVideoRequest error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/video-requests/:id/cancel  (buyer can cancel if still pending)
export const cancelVideoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;

    const { data: request } = await supabase
      .from('video_requests')
      .select('id, requester_id, status, price')
      .eq('id', id)
      .single();

    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (request.requester_id !== requesterId) return res.status(403).json({ error: 'No autorizado' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Solo puedes cancelar solicitudes pendientes' });
    }

    await supabase.from('video_requests').update({ status: 'cancelled' }).eq('id', id);

    // Refund buyer
    await addCoins(requesterId, request.price, 'video_request_refund').catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
