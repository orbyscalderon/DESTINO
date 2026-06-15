import { supabase } from '../lib/supabase.js';
import { sanitizeImageUrl } from '../lib/urlValidation.js';
import { uploadFile, deleteFile } from '../lib/storageProvider.js';
import { spendCoins, addCoins, CREATOR_CUT } from './coinController.js';
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
    const { creator_id, message, price, package_id } = req.body;

    if (!creator_id) return res.status(400).json({ error: 'Falta el creador' });
    if (creator_id === requesterId) return res.status(400).json({ error: 'No puedes hacerte una solicitud a ti mismo' });

    // Verify creator exists and is a creator
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, is_creator, full_name, custom_video_min_price, accepts_video_requests')
      .eq('id', creator_id)
      .single();

    if (!creator) return res.status(404).json({ error: 'Creador no encontrado' });
    if (!creator.is_creator) return res.status(400).json({ error: 'Este usuario no es creador' });
    if (creator.accepts_video_requests === false) {
      return res.status(403).json({ error: 'Este creador no acepta encargos de video por ahora' });
    }

    // Determinar precio
    let coinPrice;
    if (package_id) {
      const { data: pkg } = await supabase
        .from('video_packages')
        .select('id, price, active, creator_id')
        .eq('id', package_id)
        .single();
      if (!pkg || pkg.creator_id !== creator_id || !pkg.active) {
        return res.status(400).json({ error: 'Paquete no disponible' });
      }
      coinPrice = pkg.price;
    } else {
      coinPrice = Math.max(1, Math.min(99999, parseInt(price) || 0));
      const minPrice = creator.custom_video_min_price || 50;
      if (coinPrice < minPrice) {
        return res.status(400).json({ error: `El precio mínimo para video custom es ${minPrice} coins`, code: 'PRICE_TOO_LOW' });
      }
    }
    if (!coinPrice) return res.status(400).json({ error: 'Precio inválido' });

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
        package_id: package_id || null,
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
    const creatorShare = Math.floor(request.price * CREATOR_CUT);
    if (creatorShare > 0) {
      await addCoins(creatorId, creatorShare, 'video_request_sale').catch(() => {});
    }

    res.json({ success: true, video_url: videoUrl });
  } catch (err) {
    console.error('deliverVideoRequest error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VIDEO PACKAGES (catálogo del creador) ────────────────────────────────────

// GET /api/video-requests/packages/:creatorId — listado público del catálogo
export const listPackages = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { data: creator } = await supabase
      .from('profiles')
      .select('custom_video_min_price, accepts_video_requests, is_creator')
      .eq('id', creatorId).single();

    if (!creator?.is_creator) return res.json({ packages: [], min_price: null, accepts: false });

    const { data: packages } = await supabase
      .from('video_packages')
      .select('id, title, description, price, delivery_days, max_duration_sec, cover_url, position')
      .eq('creator_id', creatorId)
      .eq('active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    res.json({
      packages: packages || [],
      min_price: creator.custom_video_min_price || 50,
      accepts: creator.accepts_video_requests !== false,
    });
  } catch {
    res.json({ packages: [], min_price: 50, accepts: true });
  }
};

// GET /api/video-requests/my-packages — paquetes del creador autenticado
export const getMyPackages = async (req, res) => {
  try {
    const { data } = await supabase
      .from('video_packages')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    res.json({ packages: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/video-requests/packages — crear paquete
export const createPackage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, price, delivery_days, max_duration_sec, cover_url } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', userId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'Solo creadores pueden crear paquetes' });

    if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    const coinPrice = parseInt(price);
    if (!coinPrice || coinPrice < 10 || coinPrice > 99999) {
      return res.status(400).json({ error: 'Precio debe estar entre 10 y 99999 coins' });
    }

    const { data: pkg, error } = await supabase
      .from('video_packages')
      .insert({
        creator_id: userId,
        title: title.trim().substring(0, 100),
        description: description?.trim()?.substring(0, 500) || null,
        price: coinPrice,
        delivery_days: Math.max(1, Math.min(30, parseInt(delivery_days) || 7)),
        max_duration_sec: Math.max(10, Math.min(600, parseInt(max_duration_sec) || 60)),
        cover_url: sanitizeImageUrl(cover_url),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ package: pkg });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear paquete' });
  }
};

// PUT /api/video-requests/packages/:id — actualizar
export const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('video_packages').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Paquete no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const updates = {};
    const { title, description, price, delivery_days, max_duration_sec, cover_url, active, position } = req.body;
    if (title !== undefined) updates.title = String(title).trim().substring(0, 100);
    if (description !== undefined) updates.description = description ? String(description).trim().substring(0, 500) : null;
    if (price !== undefined) {
      const p = parseInt(price);
      if (!p || p < 10 || p > 99999) return res.status(400).json({ error: 'Precio inválido' });
      updates.price = p;
    }
    if (delivery_days !== undefined) updates.delivery_days = Math.max(1, Math.min(30, parseInt(delivery_days) || 7));
    if (max_duration_sec !== undefined) updates.max_duration_sec = Math.max(10, Math.min(600, parseInt(max_duration_sec) || 60));
    if (cover_url !== undefined) updates.cover_url = sanitizeImageUrl(cover_url);
    if (active !== undefined) updates.active = !!active;
    if (position !== undefined) updates.position = parseInt(position) || 0;
    updates.updated_at = new Date().toISOString();

    const { data: pkg, error } = await supabase
      .from('video_packages').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json({ package: pkg });
  } catch {
    res.status(500).json({ error: 'Error al actualizar paquete' });
  }
};

// DELETE /api/video-requests/packages/:id
export const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('video_packages').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Paquete no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('video_packages').delete().eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar paquete' });
  }
};

// PUT /api/video-requests/settings — precio mínimo custom + accepts_video_requests
export const updateVideoRequestSettings = async (req, res) => {
  try {
    const { custom_video_min_price, accepts_video_requests } = req.body;
    const updates = {};
    if (custom_video_min_price !== undefined) {
      const p = parseInt(custom_video_min_price);
      if (p < 10 || p > 99999) return res.status(400).json({ error: 'Precio mínimo inválido' });
      updates.custom_video_min_price = p;
    }
    if (accepts_video_requests !== undefined) updates.accepts_video_requests = !!accepts_video_requests;

    await supabase.from('profiles').update(updates).eq('id', req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al actualizar configuración' });
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
