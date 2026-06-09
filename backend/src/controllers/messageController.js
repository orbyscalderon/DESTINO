import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import { sendPushToUser } from './notificationController.js';
import { spendCoins, addCoins, coinsToUSD, creatorCutUSD, CREATOR_CUT } from './coinController.js';
import { detectImageType, detectVideoType, safeErrorMessage, sanitizeUserText } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { upsertCreatorEarnings } from './showController.js';
import { trackFunnel } from '../lib/funnelTracker.js';
import { moderateText } from '../lib/textModeration.js';
import { insertMessageMentions } from '../lib/mentions.js';
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

    trackFunnel(userId, 'first_message', { match_id: matchId });

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
        sticker_id,
        expires_at,
        created_at,
        is_read,
        read_at,
        is_ppv,
        ppv_price,
        sender:profiles!sender_id(id, full_name, avatar_url),
        reactions:message_reactions(id, user_id, emoji),
        sticker:sticker_items!sticker_id(id, image_url, label)
      `)
      .eq('match_id', matchId)
      .eq('is_scheduled', false)
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
    const { matchId, conversationId, content, type, sticker_id, scheduled_for } = req.body;
    const userId = req.user.id;

    // Target: match (1:1) o conversation (group). Exactamente uno.
    const targetMatch = matchId && isValidUUID(matchId) ? matchId : null;
    const targetConv  = conversationId && isValidUUID(conversationId) ? conversationId : null;
    if (!targetMatch && !targetConv) return res.status(400).json({ error: 'matchId o conversationId requerido' });
    if (targetMatch && targetConv)   return res.status(400).json({ error: 'Especifica solo uno' });

    const ALLOWED_TYPES = ['text', 'gif', 'sticker'];
    const msgType = ALLOWED_TYPES.includes(type) ? type : 'text';

    // Validar sticker
    let validatedStickerId = null;
    if (msgType === 'sticker') {
      if (!sticker_id) return res.status(400).json({ error: 'sticker_id requerido' });
      // Verificar ownership del pack
      const { data: item } = await supabase
        .from('sticker_items')
        .select('id, pack_id')
        .eq('id', sticker_id)
        .single();
      if (!item) return res.status(404).json({ error: 'Sticker no encontrado' });
      const { data: own } = await supabase
        .from('user_sticker_packs')
        .select('user_id').eq('user_id', userId).eq('pack_id', item.pack_id).maybeSingle();
      if (!own) return res.status(403).json({ error: 'No posees este sticker' });
      validatedStickerId = item.id;
    } else {
      if (!content?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    }

    // Sanitize content (no aplica a stickers)
    const sanitized = msgType === 'sticker' ? '' : (content || '').trim()
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    if (msgType === 'text' && sanitized.length === 0) return res.status(400).json({ error: 'Mensaje vacío' });
    if (msgType === 'text' && sanitized.length > 1000) return res.status(400).json({ error: 'El mensaje no puede superar 1000 caracteres' });

    if (msgType === 'text') {
      const mod = await moderateText(sanitized, { context: 'chat' });
      if (!mod.ok) {
        return res.status(422).json({ error: mod.reason, severity: mod.severity });
      }
    }

    // Verificar permisos sobre target
    let disappearMinutes = null;
    let recipientIds = [];
    let dmPaywallCharged = false;
    if (targetMatch) {
      const { data: match } = await supabase
        .from('matches').select('user1_id, user2_id, is_match, disappear_minutes')
        .eq('id', targetMatch).single();
      if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
        return res.status(403).json({ error: 'No tienes acceso a este chat' });
      }
      disappearMinutes = match.disappear_minutes;
      recipientIds = [match.user1_id === userId ? match.user2_id : match.user1_id];

      // v70: cobrar DM paywall/sexting si el receptor lo tiene activo
      const receiverId = recipientIds[0];
      const { chargeDmIfRequired } = await import('./dmPricingController.js');
      const chargeResult = await chargeDmIfRequired({
        payerId: userId, receiverId, matchId: targetMatch, messageId: null,
      });
      if (chargeResult.error === 'insufficient_coins') {
        return res.status(402).json({
          error: 'Coins insuficientes para enviar DM',
          required_coins: chargeResult.price,
          code: 'DM_PAYWALL',
        });
      }
      dmPaywallCharged = chargeResult.charged === true;
    } else {
      const { data: membership } = await supabase
        .from('conversation_members')
        .select('user_id').eq('conversation_id', targetConv).eq('user_id', userId).maybeSingle();
      if (!membership) return res.status(403).json({ error: 'No eres miembro de este grupo' });
      const { data: others } = await supabase
        .from('conversation_members')
        .select('user_id').eq('conversation_id', targetConv).neq('user_id', userId);
      recipientIds = (others || []).map(o => o.user_id);
    }

    // Scheduled: validar fecha (max 30 días futuro)
    let scheduledIso = null;
    let isScheduled = false;
    if (scheduled_for) {
      const target = new Date(scheduled_for);
      if (isNaN(target.getTime())) return res.status(400).json({ error: 'scheduled_for inválido' });
      const now = Date.now();
      const future = target.getTime() - now;
      if (future < 60_000) return res.status(400).json({ error: 'Programa al menos 1 minuto al futuro' });
      if (future > 30 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Max 30 días al futuro' });
      scheduledIso = target.toISOString();
      isScheduled = true;
    }

    // Calcular expires_at si match es disappearing
    const expiresAt = (!isScheduled && disappearMinutes)
      ? new Date(Date.now() + disappearMinutes * 60_000).toISOString()
      : null;

    // Insertar mensaje
    const row = {
      sender_id: userId,
      content: sanitized,
      type: msgType,
      sticker_id: validatedStickerId,
      scheduled_for: scheduledIso,
      is_scheduled: isScheduled,
      expires_at: expiresAt,
    };
    if (targetMatch) row.match_id = targetMatch;
    else row.conversation_id = targetConv;

    const { data: message, error } = await supabase
      .from('messages').insert(row)
      .select(`
        id, sender_id, content, type, created_at, is_read, sticker_id,
        scheduled_for, is_scheduled, expires_at, match_id, conversation_id,
        sender:profiles!sender_id(id, full_name, avatar_url),
        sticker:sticker_items!sticker_id(id, image_url, label)
      `)
      .single();

    if (error) throw error;

    // Mentions en el texto del mensaje (sólo si NO es scheduled — al enviarse en el cron también se procesa)
    if (msgType === 'text' && sanitized.includes('@') && !isScheduled) {
      insertMessageMentions(message.id, sanitized, userId).catch(() => {});
    }

    // Clear match expiry when conversation starts
    if (targetMatch) {
      await supabase.from('matches').update({ expires_at: null }).eq('id', targetMatch).not('expires_at', 'is', null);
    }

    // Si es scheduled, no notificamos ni contamos hasta que el cron lo dispare
    if (isScheduled) {
      return res.json({ message, remaining: null, scheduled: true });
    }

    // Enviar push notification a cada destinatario (1 en match, N en group)
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    const previewBody = msgType === 'sticker' ? '🎟️ Sticker' : sanitized.substring(0, 100);
    const targetUrl = targetMatch ? `/chat/${targetMatch}` : `/conversations/${targetConv}`;
    recipientIds.forEach(rid => {
      sendPushToUser(rid, {
        title: senderProfile?.full_name || 'Nuevo mensaje',
        body: previewBody,
        url: targetUrl,
      }).catch(() => {});
    });

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

    trackFunnel(userId, 'first_message', { match_id: targetMatch, conversation_id: targetConv });

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
// Hasta 3 mensajes pinneados por match (v63 trigger). Si ya hay 3 y pinneas
// un 4to, el más viejo se despinea automáticamente.
export const pinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;
    const { messageId } = req.body;

    if (!messageId) return res.status(400).json({ error: 'messageId requerido' });

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Verificar que el mensaje pertenece a este match
    const { data: msg } = await supabase
      .from('messages').select('id, match_id').eq('id', messageId).single();
    if (!msg || msg.match_id !== matchId) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    // Insert; UNIQUE (match_id, message_id) lo hace idempotente
    const { error } = await supabase.from('pinned_messages').insert({
      match_id: matchId,
      message_id: messageId,
      pinned_by: userId,
    });
    // 23505 = unique_violation → ya estaba pinneado, no es error
    if (error && error.code !== '23505') throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/messages/:matchId/pin?messageId=xxx — despinea un mensaje específico
// Si no se pasa messageId, despinea TODOS (backward compat con UI vieja)
export const unpinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;
    const { messageId } = req.query;

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    let query = supabase.from('pinned_messages').delete().eq('match_id', matchId);
    if (messageId) query = query.eq('message_id', messageId);
    await query;

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

// GET /api/messages/:matchId/pin — get hasta 3 pinned messages (más reciente primero)
// Backward compatible: la UI vieja lee `pinned` (1er item), la nueva lee `pinned_list`.
export const getPinnedMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: pins } = await supabase
      .from('pinned_messages')
      .select(`
        message_id, pinned_at, pinned_by,
        message:messages!message_id(id, content, type, sender_id, created_at)
      `)
      .eq('match_id', matchId)
      .order('pinned_at', { ascending: false })
      .limit(3);

    const list = (pins || []).map(p => p.message).filter(Boolean);
    res.json({
      pinned: list[0] || null,    // legacy single
      pinned_list: list,          // nueva
    });
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

// PATCH /api/messages/:matchId/disappear — { minutes }
// Configura disappearing para todos los mensajes nuevos del match.
// minutes válidos: null, 5, 60, 1440, 10080
export const setDisappearing = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;
    const VALID = [null, 5, 60, 1440, 10080];
    const raw = req.body.minutes;
    const minutes = raw === null || raw === undefined ? null : parseInt(raw, 10);
    if (!VALID.includes(minutes)) return res.status(400).json({ error: 'minutes inválido' });

    const { data: match } = await supabase
      .from('matches').select('user1_id, user2_id').eq('id', matchId).single();
    if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await supabase.from('matches').update({ disappear_minutes: minutes }).eq('id', matchId);
    res.json({ success: true, minutes });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// DELETE /api/messages/scheduled/:id — cancela un mensaje programado propio
export const cancelScheduled = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { data: msg } = await supabase.from('messages')
      .select('sender_id, is_scheduled')
      .eq('id', id).single();
    if (!msg) return res.status(404).json({ error: 'No encontrado' });
    if (msg.sender_id !== userId) return res.status(403).json({ error: 'No autorizado' });
    if (!msg.is_scheduled) return res.status(400).json({ error: 'Mensaje no estaba programado' });

    await supabase.from('messages').delete().eq('id', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/messages/scheduled — lista mis scheduled pendientes
export const listScheduled = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data } = await supabase
      .from('messages')
      .select(`
        id, content, type, scheduled_for, match_id, conversation_id, created_at
      `)
      .eq('sender_id', userId)
      .eq('is_scheduled', true)
      .gt('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });
    res.json({ scheduled: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};
