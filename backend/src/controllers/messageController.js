import { supabase } from '../lib/supabase.js';
import { sendPushToUser } from './notificationController.js';
import multer from 'multer';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
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

const BUCKET = 'DESTINO';

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

    const storagePath = `chat-images/${matchId}/${userId}-${Date.now()}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) throw uploadError;

    const imageUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: userId, content: '', image_url: imageUrl })
      .select(`id, sender_id, content, image_url, created_at, is_read,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)`)
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
        image_url,
        created_at,
        is_read,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);

    const { data: messages, error } = await query;
    if (error) throw error;

    // Marcar mensajes del otro como leídos (solo en la carga inicial, no en paginación)
    if (!before) {
      await supabase
        .from('messages')
        .update({ is_read: true })
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
    const { matchId, content } = req.body;
    if (!matchId || !isValidUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });
    const userId = req.user.id;

    if (!content?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    const sanitized = content.trim().replace(/<[^>]*>/g, '');
    if (sanitized.length === 0) return res.status(400).json({ error: 'Mensaje vacío' });
    if (sanitized.length > 1000) return res.status(400).json({ error: 'El mensaje no puede superar 1000 caracteres' });

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
      .insert({ match_id: matchId, sender_id: userId, content: sanitized })
      .select(`
        id, sender_id, content, created_at, is_read,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) throw error;

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

    // Incrementar contador diario (solo usuarios no premium)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', userId)
      .single();

    let remaining = null;
    if (!profile?.is_premium) {
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
