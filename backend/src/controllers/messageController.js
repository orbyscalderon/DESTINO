import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import { sendPushToUser } from './notificationController.js';
import { spendCoins, addCoins, coinsToUSD, creatorCutUSD, CREATOR_CUT } from './coinController.js';
import { detectImageType, detectVideoType, safeErrorMessage, sanitizeUserText } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { upsertCreatorEarnings } from './showController.js';
import multer from 'multer';

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO_MIME = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'];

const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'), false);
  },
});
export const chatImageMiddleware = (req, res, next) => {
  chatImageUpload.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La imagen no puede superar 10 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const chatAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de audio no soportado'), false);
  },
});
export const chatAudioMiddleware = (req, res, next) => {
  chatAudioUpload.single('audio')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El audio no puede superar 10 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const chatVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de video no soportado'), false);
  },
});
export const chatVideoMiddleware = (req, res, next) => {
  chatVideoUpload.single('video')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El video no puede superar 30 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// Contenido PPV privado — usa Supabase signed URLs (bucket privado)
// Al migrar a Backblaze B2: B2 soporta private files + presigned URLs igual que S3
const PPV_BUCKET = 'Destino TV-PPV';
const PPV_SIGNED_URL_TTL = 3600;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

const DAILY_LIMIT = 10;

// POST /api/messages/image — enviar imagen en chat
export const sendImageMessage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const { matchId } = req.body;
    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .single();

    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    // Validar magic bytes (no solo MIME del header — fácil de falsificar)
    const realType = detectImageType(req.file.buffer);
    if (!realType) {
      return res.status(400).json({ error: 'Archivo no es una imagen válida' });
    }
    // Sanitizar matchId/userId en path (defensa en profundidad — vienen de JWT)
    const safeMatchId = matchId.replace(/[^a-f0-9\-]/gi, '');
    const safeUserId  = userId.replace(/[^a-f0-9\-]/gi, '');
    const storagePath = `chat-images/${safeMatchId}/${safeUserId}-${Date.now()}`;
    const imageUrl = await uploadFile(storagePath, req.file.buffer, realType);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: userId, content: '', image_url: imageUrl })
      .select(`id, sender_id, content, image_url, created_at, is_read,
        sender:profiles!sender_id(id, full_name, avatar_url)`)
      .single();

    if (error) throw error;

    const recipientId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const { data: senderProfile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    sendPushToUser(recipientId, {
      title: senderProfile?.full_name || 'Nuevo mensaje',
      body: '📷 Te envió una foto',
      url: `/chat/${matchId}`,
    }).catch(() => {});

    res.json({ message });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/messages/:matchId?before=<ISO_timestamp>&limit=50
export const getMessages = async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before; // cursor: ISO timestamp

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('id', matchId)
      .single();

    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    let query = supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        content,
        type,
        image_url,
        audio_url,
        audio_duration_s,
        created_at,
        is_read,
        read_at,
        is_ppv,
        ppv_price,
        sender:profiles!sender_id(id, full_name, avatar_url),
        reactions:message_reactions(id, user_id, emoji)
      `)
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);

    const { data: messages, error } = await query;
    if (error) throw error;

    // Marcar mensajes del otro como leídos con timestamp
    if (!before) {
      await supabase
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('match_id', matchId)
        .neq('sender_id', userId)
        .eq('is_read', false);
    }

    const ordered = (messages || []).reverse();
    res.json({ messages: ordered, hasMore: (messages || []).length === limit });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages — enviar mensaje (pasa por messageLimitMiddleware primero)
export const sendMessage = async (req, res) => {
  try {
    const { matchId, content, type } = req.body;
    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;

    const ALLOWED_TYPES = ['text', 'gif'];
    const msgType = ALLOWED_TYPES.includes(type) ? type : 'text';

    if (!content?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    // Strip all HTML tags and dangerous protocols
    const sanitized = content.trim()
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/on\w+\s*=/gi, '');
    if (sanitized.length === 0) return res.status(400).json({ error: 'Mensaje vacío' });
    if (msgType === 'text' && sanitized.length > 1000) return res.status(400).json({ error: 'El mensaje no puede superar 1000 caracteres' });

    // Verificar pertenencia al match
    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .single();

    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    // Insertar mensaje
    const { data: message, error } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: userId, content: sanitized, type: msgType })
      .select(`
        id, sender_id, content, type, created_at, is_read,
        sender:profiles!sender_id(id, full_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Clear match expiry when conversation starts
    await supabase.from('matches').update({ expires_at: null }).eq('id', matchId).not('expires_at', 'is', null);

    // Enviar push notification al destinatario
    const recipientId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    sendPushToUser(recipientId, {
      title: senderProfile?.full_name || 'Nuevo mensaje',
      body: sanitized.substring(0, 100),
      url: `/chat/${matchId}`,
    }).catch(() => {});

    // Incrementar contador diario (solo usuarios básicos)
    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', userId)
      .single();

    const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
    let remaining = null;
    if (!isPremium) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.rpc('increment_message_count', { p_user_id: userId });

      const { data: counter } = await supabase
        .from('daily_message_count')
        .select('count')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

      remaining = DAILY_LIMIT - (counter?.count || 0);
    }

    res.json({ message, remaining });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages/ppv — enviar mensaje PPV (contenido bloqueado con precio en coins)
export const sendPPVMessage = async (req, res) => {
  try {
    const { matchId, caption, ppv_price } = req.body;
    const userId = req.user.id;

    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });

    const price = parseInt(ppv_price);
    if (!price || price < 1 || price > 10000) return res.status(400).json({ error: 'Precio inválido (1–10000 coins)' });

    // Verificar que es creador
    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', userId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'Solo los creadores pueden enviar mensajes PPV' });

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .single();

    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    let ppvMediaUrl = null;
    if (req.file) {
      const storagePath = `${matchId}/${userId}-${Date.now()}`;
      const { error: uploadError } = await supabase.storage
        .from(PPV_BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw uploadError;
      ppvMediaUrl = storagePath; // guardamos el path, NO la URL pública
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: userId,
        content: sanitizeUserText(caption, 500) || '🔒 Contenido exclusivo',
        is_ppv: true,
        ppv_price: price,
        ppv_media_url: ppvMediaUrl,
      })
      .select(`id, sender_id, content, is_ppv, ppv_price, created_at, is_read,
        sender:profiles!sender_id(id, full_name, avatar_url)`)
      .single();

    if (error) throw error;

    const recipientId = match.user1_id === userId ? match.user2_id : match.user1_id;
    sendPushToUser(recipientId, {
      title: 'Nuevo mensaje exclusivo',
      body: `🔒 ${price} coins para desbloquear`,
      url: `/chat/${matchId}`,
    }).catch(() => {});

    res.json({ message });
  } catch (err) {
    console.error('sendPPVMessage error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages/ppv/:messageId/unlock — desbloquear mensaje PPV
export const unlockPPV = async (req, res) => {
  try {
    const { messageId } = req.params;
    const buyerId = req.user.id;

    const { data: msg } = await supabase
      .from('messages')
      .select('id, sender_id, is_ppv, ppv_price, ppv_media_url, match_id')
      .eq('id', messageId)
      .single();

    if (!msg || !msg.is_ppv) return res.status(404).json({ error: 'Mensaje PPV no encontrado' });
    if (msg.sender_id === buyerId) return res.status(400).json({ error: 'No puedes desbloquear tu propio contenido' });

    // Verificar que el comprador pertenece al match
    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('id', msg.match_id)
      .single();

    if (!match || (match.user1_id !== buyerId && match.user2_id !== buyerId)) {
      return res.status(403).json({ error: 'No tienes acceso a este mensaje' });
    }

    const coins = msg.ppv_price;
    const amountUSD = coinsToUSD(coins);
    const earningsUSD = creatorCutUSD(coins);
    const platformFee = amountUSD - earningsUSD;

    const generatePPVUrl = async (rawUrl) => {
      if (!rawUrl) return null;
      // Rows anteriores al fix guardan la URL pública completa → devolverla tal cual (legacy)
      if (rawUrl.startsWith('http')) return rawUrl;
      // Rows nuevos guardan solo el path → generar signed URL con expiración
      const { data, error } = await supabase.storage
        .from(PPV_BUCKET)
        .createSignedUrl(rawUrl, PPV_SIGNED_URL_TTL);
      if (error) throw error;
      return data.signedUrl;
    };

    // Insert first — unique constraint on (message_id, buyer_id) prevents double-spend
    const { error: insertErr } = await supabase.from('ppv_unlocks').insert({
      message_id: messageId,
      buyer_id: buyerId,
      seller_id: msg.sender_id,
      coins_spent: coins,
      amount_usd: amountUSD,
      creator_earnings: earningsUSD,
      platform_fee: platformFee,
    });

    // Duplicate = already unlocked (race condition or retry)
    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.json({ url: await generatePPVUrl(msg.ppv_media_url), already_unlocked: true });
      }
      throw insertErr;
    }

    await spendCoins(buyerId, coins, 'ppv_spent', messageId);

    await addCoins(msg.sender_id, Math.round(coins * CREATOR_CUT), 'ppv_received', messageId);
    await upsertCreatorEarnings(msg.sender_id, earningsUSD);

    const { data: buyer } = await supabase.from('profiles').select('full_name').eq('id', buyerId).single();
    createNotification(
      msg.sender_id,
      'ppv',
      '¡Alguien desbloqueó tu mensaje!',
      `${buyer?.full_name} pagó ${coins} coins`,
      { message_id: messageId }
    );
    sendPushToUser(msg.sender_id, {
      title: '¡Mensaje desbloqueado!',
      body: `${buyer?.full_name} pagó ${coins} coins`,
      url: `/chat/${msg.match_id}`,
    }).catch(() => {});

    res.json({ url: await generatePPVUrl(msg.ppv_media_url) });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'Saldo de coins insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    console.error('unlockPPV error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages/voice — enviar mensaje de voz
export const sendVoiceMessage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió audio' });
    const { matchId, duration } = req.body;
    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .single();
    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    const ext = req.file.mimetype.includes('ogg') ? 'ogg' : 'webm';
    const storagePath = `chat-audio/${matchId}/${userId}-${Date.now()}.${ext}`;
    const audioUrl = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: userId,
        content: '',
        type: 'voice',
        audio_url: audioUrl,
        audio_duration_s: parseInt(duration) || null,
      })
      .select(`id, sender_id, content, type, audio_url, audio_duration_s, created_at, is_read,
        sender:profiles!sender_id(id, full_name, avatar_url)`)
      .single();
    if (error) throw error;

    const recipientId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const { data: sp } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    sendPushToUser(recipientId, {
      title: sp?.full_name || 'Nuevo mensaje',
      body: '🎤 Mensaje de voz',
      url: `/chat/${matchId}`,
    }).catch(() => {});

    res.json({ message });
  } catch (err) {
    console.error('sendVoiceMessage error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages/video — enviar mensaje de video
export const sendVideoMessage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió video' });
    const { matchId } = req.body;
    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .single();
    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    // Validar magic bytes
    const realType = detectVideoType(req.file.buffer);
    if (!realType) {
      return res.status(400).json({ error: 'Archivo no es un video válido' });
    }
    const ext = realType === 'video/webm' ? 'webm' : 'mp4';
    const safeMatchId = matchId.replace(/[^a-f0-9\-]/gi, '');
    const safeUserId  = userId.replace(/[^a-f0-9\-]/gi, '');
    const storagePath = `chat-video/${safeMatchId}/${safeUserId}-${Date.now()}.${ext}`;
    const videoUrl = await uploadFile(storagePath, req.file.buffer, realType);

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: userId,
        content: videoUrl,
        type: 'video',
      })
      .select(`id, sender_id, content, type, created_at, is_read,
        sender:profiles!sender_id(id, full_name, avatar_url)`)
      .single();
    if (error) throw error;

    const recipientId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const { data: sp } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    sendPushToUser(recipientId, {
      title: sp?.full_name || 'Nuevo mensaje',
      body: '🎥 Mensaje de video',
      url: `/chat/${matchId}`,
    }).catch(() => {});

    res.json({ message });
  } catch (err) {
    console.error('sendVideoMessage error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/messages/:id/reactions — añadir/quitar reacción
export const toggleReaction = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user.id;
    const { emoji } = req.body;

    if (!emoji || emoji.length > 8) return res.status(400).json({ error: 'Emoji inválido' });

    // Verify user belongs to the match
    const { data: msg } = await supabase
      .from('messages')
      .select('match_id')
      .eq('id', messageId)
      .single();
    if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('id', msg.match_id)
      .single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Toggle: if exists → delete, if not → insert
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
      return res.json({ action: 'removed' });
    }

    await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    res.json({ action: 'added' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/messages/:id — borrar mensaje
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: messageId } = req.params;
    const { forAll } = req.body; // boolean

    const { data: msg } = await supabase
      .from('messages').select('sender_id, match_id').eq('id', messageId).single();
    if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

    // Verify user is participant
    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', msg.match_id).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (forAll && msg.sender_id === userId) {
      await supabase.from('messages').update({ deleted_for_all: true, content: '' }).eq('id', messageId);
      return res.json({ action: 'deleted_for_all' });
    }

    // Soft-delete for self only
    if (msg.sender_id === userId) {
      await supabase.from('messages').update({ deleted_for_sender: true }).eq('id', messageId);
    } else {
      // Recipient can also hide for themselves (future: deleted_for_recipient column)
      await supabase.from('messages').update({ deleted_for_sender: true }).eq('id', messageId);
    }
    res.json({ action: 'deleted_for_me' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/messages/:matchId/pin — pin a message in a match
export const pinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;
    const { messageId } = req.body;

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await supabase.from('pinned_messages').upsert(
      { match_id: matchId, message_id: messageId, pinned_by: userId },
      { onConflict: 'match_id' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/messages/:matchId/pin — unpin
export const unpinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await supabase.from('pinned_messages').delete().eq('match_id', matchId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/messages/:matchId/all — borrar toda la conversación
export const clearConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;
    if (!isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await supabase.from('messages').delete().eq('match_id', matchId);
    await supabase.from('pinned_messages').delete().eq('match_id', matchId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/messages/:matchId/pin — get pinned message
export const getPinnedMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: pin } = await supabase
      .from('pinned_messages')
      .select(`
        message_id,
        message:messages!message_id(id, content, type, sender_id, created_at)
      `)
      .eq('match_id', matchId)
      .single();

    res.json({ pinned: pin?.message || null });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/messages/count/today
export const getTodayCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const { data: counter } = await supabase
      .from('daily_message_count')
      .select('count')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    const count = counter?.count || 0;

    res.json({
      count,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
