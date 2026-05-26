import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import multer from 'multer';
const STORY_EXPIRY_HOURS = 24;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB para videos
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado'), false);
  },
});
export const storyUploadMiddleware = (req, res, next) => {
  upload.single('media')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo no puede superar 50 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// GET /api/stories — stories de usuarios activos (no expiradas)
export const listStories = async (req, res) => {
  try {
    const userId = req.user.id;

    // Stories de: usuarios con match activo + los propios
    const { data: matchedUsers } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('is_match', true);

    const friendIds = new Set([userId]);
    (matchedUsers || []).forEach(m => {
      friendIds.add(m.user1_id);
      friendIds.add(m.user2_id);
    });

    const { data: stories, error } = await supabase
      .from('stories')
      .select(`
        id, media_url, media_type, is_adult, expires_at, views_count, created_at,
        user:profiles!user_id(id, full_name, avatar_url, is_verified)
      `)
      .in('user_id', Array.from(friendIds))
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Marcar cuáles ha visto el usuario
    const storyIds = (stories || []).map(s => s.id);
    let viewedIds = new Set();
    if (storyIds.length > 0) {
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', userId)
        .in('story_id', storyIds);
      viewedIds = new Set((views || []).map(v => v.story_id));
    }

    // Agrupar por usuario
    const grouped = {};
    (stories || []).forEach(s => {
      const uid = s.user.id;
      if (!grouped[uid]) grouped[uid] = { user: s.user, stories: [] };
      grouped[uid].stories.push({ ...s, viewed: viewedIds.has(s.id) });
    });

    const result = Object.values(grouped).map(g => ({
      ...g,
      has_unseen: g.stories.some(s => !s.viewed),
    }));

    // Propias primero, luego ordenar por has_unseen
    result.sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      return (b.has_unseen ? 1 : 0) - (a.has_unseen ? 1 : 0);
    });

    res.json({ stories: result });
  } catch (err) {
    console.error('listStories error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/stories — subir story
export const createStory = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const userId = req.user.id;
    const isAdult = req.body.is_adult === 'true';

    // Solo creadores pueden publicar stories adultas
    if (isAdult) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_adult_creator')
        .eq('id', userId)
        .single();
      if (!profile?.is_adult_creator) {
        return res.status(403).json({ error: 'Solo creadores de contenido adulto pueden publicar este tipo de story' });
      }
    }

    const isVideo = req.file.mimetype.startsWith('video/');
    const ext = isVideo ? 'mp4' : 'jpg';
    const storagePath = `stories/${userId}/${Date.now()}.${ext}`;

    const mediaUrl = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);
    const expiresAt = new Date(Date.now() + STORY_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const { data: story, error } = await supabase
      .from('stories')
      .insert({
        user_id: userId,
        media_url: mediaUrl,
        media_type: isVideo ? 'video' : 'photo',
        is_adult: isAdult,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ story });
  } catch (err) {
    console.error('createStory error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/stories/:id/view — marcar story como vista
export const markStoryViewed = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user.id;

    const { data: story } = await supabase
      .from('stories')
      .select('user_id, views_count')
      .eq('id', id)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!story) return res.status(404).json({ error: 'Story no encontrada o expirada' });
    if (story.user_id === viewerId) return res.json({ ok: true }); // no contar vista propia

    const { error } = await supabase
      .from('story_views')
      .upsert({ story_id: id, viewer_id: viewerId }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });

    if (!error) {
      await supabase.rpc('update_story_views', { p_story_id: id, p_delta: 1 });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/stories/:id/viewers — quién vio mi story (solo el autor puede consultarlo)
export const getStoryViewers = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: story } = await supabase
      .from('stories')
      .select('user_id, views_count')
      .eq('id', id)
      .single();

    if (!story) return res.status(404).json({ error: 'Story no encontrada' });
    if (story.user_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    const { data: views } = await supabase
      .from('story_views')
      .select('viewed_at, viewer:profiles!viewer_id(id, full_name, avatar_url, is_verified)')
      .eq('story_id', id)
      .order('viewed_at', { ascending: false })
      .limit(100);

    res.json({ viewers: (views || []).map(v => ({ ...v.viewer, viewed_at: v.viewed_at })), total: story.views_count || 0 });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/stories/:id
export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: story } = await supabase
      .from('stories')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!story) return res.status(404).json({ error: 'Story no encontrada' });
    if (story.user_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('stories').delete().eq('id', id);
    res.json({ message: 'Story eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
