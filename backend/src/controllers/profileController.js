import { supabase } from '../lib/supabase.js';
import multer from 'multer';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const imageFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'), false);
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: imageFilter });
export const uploadMiddleware = (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La imagen no puede superar 20 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: imageFilter });
export const uploadPhotoMiddleware = (req, res, next) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La foto no puede superar 20 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const MAX_PHOTOS = 20;
const BUCKET = 'DESTINO';

async function uploadToStorage(path, buffer, mimetype) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimetype,
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// GET /api/profiles/feed
export const getFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const { gender, minAge, maxAge, country, language } = req.query;

    const [
      { data: seenMatches },
      { data: matchedAsUser2 },
      { data: blockedRows },
      { data: blockedByRows },
    ] = await Promise.all([
      // Perfiles que YO ya swipé (yo soy user1)
      supabase.from('matches').select('user2_id').eq('user1_id', userId),
      // Perfiles con los que ya hice match (ellos me likearon primero, yo soy user2)
      supabase.from('matches').select('user1_id').eq('user2_id', userId).eq('is_match', true),
      supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
      supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
    ]);

    const seenIds = [
      ...(seenMatches?.map(m => m.user2_id) || []),
      ...(matchedAsUser2?.map(m => m.user1_id) || []),
      ...(blockedRows?.map(r => r.blocked_id) || []),
      ...(blockedByRows?.map(r => r.blocker_id) || []),
      userId,
    ];

    let query = supabase
      .from('profiles')
      .select('id, username, full_name, age, gender, bio, avatar_url, is_premium, is_verified, country, language')
      .not('id', 'in', `(${seenIds.join(',')})`)
      .not('username', 'is', null)
      .order('is_premium', { ascending: false })
      .limit(limit);

    if (gender && gender !== 'all') query = query.eq('gender', gender);
    if (minAge) query = query.gte('age', parseInt(minAge));
    if (maxAge) query = query.lte('age', parseInt(maxAge));
    if (country) query = query.eq('country', country);
    if (language) query = query.eq('language', language);

    const { data: profiles, error } = await query;

    if (error) throw error;

    const profileIds = (profiles || []).map(p => p.id);
    let photosByUser = {};
    if (profileIds.length > 0) {
      const { data: photos } = await supabase
        .from('profile_photos')
        .select('user_id, id, url, position')
        .in('user_id', profileIds)
        .order('position', { ascending: true });

      (photos || []).forEach(photo => {
        if (!photosByUser[photo.user_id]) photosByUser[photo.user_id] = [];
        photosByUser[photo.user_id].push({ id: photo.id, url: photo.url });
      });
    }

    res.json({
      profiles: (profiles || []).map(p => ({ ...p, photos: photosByUser[p.id] || [] })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/:id
export const getProfile = async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, age, gender, bio, avatar_url, is_premium, is_verified, country, language, created_at')
      .eq('id', req.params.id)
      .single();

    if (error || !profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    const { data: photos } = await supabase
      .from('profile_photos')
      .select('id, url, position')
      .eq('user_id', req.params.id)
      .order('position', { ascending: true });

    res.json({ profile: { ...profile, photos: photos || [] } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/:id
export const updateProfile = async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { username, full_name, age, gender, bio, country, language } = req.body;

    if (username !== undefined) {
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'Username: solo minúsculas, números y _ (3-20 caracteres)' });
      }
    }

    if (full_name !== undefined && full_name.trim().length > 60) {
      return res.status(400).json({ error: 'El nombre no puede superar 60 caracteres' });
    }

    if (bio !== undefined && bio.length > 500) {
      return res.status(400).json({ error: 'La bio no puede superar 500 caracteres' });
    }

    const parsedAge = age !== undefined ? parseInt(age) : undefined;
    if (parsedAge !== undefined && (isNaN(parsedAge) || parsedAge < 18 || parsedAge > 100)) {
      return res.status(400).json({ error: 'Edad inválida (18-100)' });
    }

    const validGenders = ['male', 'female', 'other'];
    if (gender !== undefined && !validGenders.includes(gender)) {
      return res.status(400).json({ error: 'Género inválido' });
    }

    const VALID_LANGS = ['es','en','pt','fr','de','it','ru','ja','zh','ar','hi','ko','tr'];
    if (language !== undefined && !VALID_LANGS.includes(language)) {
      return res.status(400).json({ error: 'Idioma inválido' });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        ...(username !== undefined && { username }),
        ...(full_name !== undefined && { full_name: full_name.trim() }),
        ...(parsedAge !== undefined && { age: parsedAge }),
        ...(gender !== undefined && { gender }),
        ...(bio !== undefined && { bio }),
        ...(country !== undefined && { country }),
        ...(language !== undefined && { language }),
        last_active: new Date(),
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/avatar
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const path = `avatars/${req.user.id}`;
    const url = await uploadToStorage(path, req.file.buffer, req.file.mimetype);

    await supabase.from('profiles').update({ avatar_url: url }).eq('id', req.user.id);

    res.json({ avatar_url: url });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/heartbeat
export const heartbeat = async (req, res) => {
  try {
    await supabase
      .from('profiles')
      .update({ last_active: new Date().toISOString() })
      .eq('id', req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/:id/photos
export const getPhotos = async (req, res) => {
  try {
    const { data: photos, error } = await supabase
      .from('profile_photos')
      .select('id, url, position, created_at')
      .eq('user_id', req.params.id)
      .order('position', { ascending: true });

    if (error) throw error;
    res.json({ photos: photos || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/photos
export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const { count } = await supabase
      .from('profile_photos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (count >= MAX_PHOTOS) {
      return res.status(400).json({ error: `Límite de ${MAX_PHOTOS} fotos alcanzado` });
    }

    const storagePath = `photos/${req.user.id}/${Date.now()}`;
    const url = await uploadToStorage(storagePath, req.file.buffer, req.file.mimetype);

    const { data: photo, error } = await supabase
      .from('profile_photos')
      .insert({
        user_id: req.user.id,
        url,
        storage_path: storagePath,
        position: count || 0,
      })
      .select('id, url, position')
      .single();

    if (error) throw error;
    res.json({ photo });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/profiles/me — elimina la cuenta completa del usuario autenticado
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Eliminar fotos del storage para no dejar huérfanos
    const { data: photos } = await supabase
      .from('profile_photos')
      .select('storage_path')
      .eq('user_id', userId);

    const paths = (photos || []).map(p => p.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths);
    }

    // Eliminar avatar del storage
    await supabase.storage.from(BUCKET).remove([`avatars/${userId}`]);

    // Eliminar el usuario de auth — CASCADE borra profiles y datos relacionados
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ message: 'Cuenta eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la cuenta' });
  }
};

// DELETE /api/profiles/photos/:photoId
export const deletePhoto = async (req, res) => {
  try {
    const { photoId } = req.params;

    const { data: photo, error: fetchError } = await supabase
      .from('profile_photos')
      .select('id, user_id, storage_path')
      .eq('id', photoId)
      .single();

    if (fetchError || !photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (photo.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    if (photo.storage_path) {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    }

    const { error } = await supabase.from('profile_photos').delete().eq('id', photoId);
    if (error) throw error;

    res.json({ message: 'Foto eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
