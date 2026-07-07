import { supabase } from '../lib/supabase.js';
import { uploadFile, deleteFile } from '../lib/storageProvider.js';
import { parsePagination } from '../lib/pagination.js';
import { spendCoins, addCoins } from './coinController.js';
import { logError } from '../lib/logger.js';
import multer from 'multer';

// Sec audit #14: cambio de denylist (PRIVATE_FIELDS) a ALLOWLIST. Antes,
// si se agregaba una columna sensible nueva al schema y se olvidaba
// añadirla a PRIVATE_FIELDS, leak. Ahora solo se exponen explícitamente
// las columnas listadas. Cualquier columna nueva queda oculta por default.
const PUBLIC_FIELDS = [
  'id', 'username', 'full_name', 'avatar_url', 'bio',
  'age', 'gender', 'country', 'language', 'city',
  'height', 'zodiac', 'interests', 'looking_for',
  'is_verified', 'is_premium', 'premium_tier', 'is_creator', 'is_adult_creator',
  'creator_subscription_price', 'creator_since',
  'subscribers_count', 'followers_count', 'following_count', 'posts_count',
  'profile_video_url', 'intro_video_url',
  'last_active', 'is_online', 'created_at',
  // Spotlight fields — el publisher acepta exponerlos al publicar
  'fucknow_publisher', 'fucknow_bio', 'fucknow_looking_for',
  'fucknow_intent', 'fucknow_city', 'fucknow_interests',
  'fucknow_availability', 'fucknow_expires_at',
  'height_cm', 'body_type', 'ethnicity', 'languages',
];

function sanitizeForPublic(profile) {
  if (!profile) return profile;
  const out = {};
  for (const f of PUBLIC_FIELDS) {
    if (f in profile) out[f] = profile[f];
  }
  return out;
}

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


// GET /api/profiles/geoip — detecta país del usuario por su IP
export const getGeoIp = async (req, res) => {
  try {
    const raw = req.ip || '';
    // Limpiar IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4)
    const ip = raw.replace(/^::ffff:/, '');

    // En desarrollo/localhost no hay IP pública que consultar
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return res.json({ countryCode: null });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,countryCode`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await response.json();
    if (data.status === 'success' && data.countryCode) {
      return res.json({ countryCode: data.countryCode });
    }
    res.json({ countryCode: null });
  } catch {
    res.json({ countryCode: null }); // falla silenciosamente
  }
};

// GET /api/profiles/top-creators — top 3 creadores por categoría ordenados por suscriptores
export const getTopCreators = async (req, res) => {
  try {
    const CATEGORIES = ['music', 'dance', 'comedy', 'chat', 'gaming', 'fitness', 'cooking', 'art', 'adult'];
    const CATEGORY_META = {
      adult:   { label: 'Adulto',  emoji: '🔞' },
      music:   { label: 'Música',  emoji: '🎵' },
      dance:   { label: 'Baile',   emoji: '💃' },
      comedy:  { label: 'Comedia', emoji: '😂' },
      chat:    { label: 'Chat',    emoji: '💬' },
      gaming:  { label: 'Gaming',  emoji: '🎮' },
      fitness: { label: 'Fitness', emoji: '💪' },
      cooking: { label: 'Cocina',  emoji: '🍳' },
      art:     { label: 'Arte',    emoji: '🎨' },
    };

    const { data: showData } = await supabase
      .from('live_shows')
      .select('host_id, category')
      .not('host_id', 'is', null);

    // category → Set de host_id
    const catMap = {};
    (showData || []).forEach(s => {
      if (!CATEGORIES.includes(s.category)) return;
      if (!catMap[s.category]) catMap[s.category] = new Set();
      catMap[s.category].add(s.host_id);
    });

    const creatorIds = [...new Set((showData || []).map(s => s.host_id).filter(Boolean))];

    if (creatorIds.length === 0) return res.json({ categories: [] });

    const [{ data: profiles }, { data: subData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, is_verified, is_creator, premium_tier')
        .in('id', creatorIds)
        .eq('is_creator', true),
      supabase
        .from('creator_subscriptions')
        .select('creator_id')
        .eq('status', 'active')
        .in('creator_id', creatorIds),
    ]);

    const subCount = {};
    (subData || []).forEach(s => { subCount[s.creator_id] = (subCount[s.creator_id] || 0) + 1; });

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const categories = CATEGORIES
      .map(cat => {
        const hostIds = [...(catMap[cat] || new Set())];
        const creators = hostIds
          .map(id => profileMap[id])
          .filter(Boolean)
          .sort((a, b) => (subCount[b.id] || 0) - (subCount[a.id] || 0))
          .slice(0, 3)
          .map(p => ({ ...p, subscriber_count: subCount[p.id] || 0 }));
        return { key: cat, ...CATEGORY_META[cat], creators };
      })
      .filter(c => c.creators.length > 0);

    res.json({ categories });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/search?q=... — búsqueda de usuarios por nombre/username
export const searchProfiles = async (req, res) => {
  try {
    const { q, gender, min_age, max_age, country, language, interests, is_creator } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 60 });
    if (!q || q.trim().length < 2) return res.json({ profiles: [], page, limit, has_more: false });

    // Strip PostgREST special chars to prevent query injection
    const term = q.trim().toLowerCase().replace(/[%_().,'";\\]/g, '');
    const userId = req.user.id;

    // Block list — don't show blocked/blocking users in search
    const [{ data: blockedRows }, { data: blockedByRows }] = await Promise.all([
      supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
      supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
    ]);
    const excludeIds = [
      userId,
      ...(blockedRows?.map(r => r.blocked_id) || []),
      ...(blockedByRows?.map(r => r.blocker_id) || []),
    ];

    // SECURITY: these two filters are mandatory — never remove them
    let query = supabase
      .from('profiles')
      .select('*')
      .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
      .not('id', 'in', `(${excludeIds.join(',')})`)
      // CRITICAL: never show adult creator profiles in general search
      .or('is_adult_creator.is.null,is_adult_creator.eq.false')
      .or('is_incognito.is.null,is_incognito.eq.false')
      .or('is_paused.is.null,is_paused.eq.false')
      .range(offset, offset + limit - 1);

    if (gender && gender !== 'all') query = query.eq('gender', gender);
    if (min_age) query = query.gte('age', parseInt(min_age));
    if (max_age) query = query.lte('age', parseInt(max_age));
    if (country) query = query.eq('country', country);
    if (language) query = query.eq('language', language);
    if (is_creator === 'true') query = query.eq('is_creator', true);
    if (interests) {
      const tags = interests.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) query = query.overlaps('interests', tags);
    }

    let { data, error } = await query;

    if (error) {
      console.error('[searchProfiles] primary query error:', error.message);
      const fallback = await supabase
        .from('profiles')
        .select('*')
        .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
        .not('id', 'in', `(${excludeIds.join(',')})`)
        .limit(30);
      if (fallback.error) throw fallback.error;
      // Re-apply security filters in JS
      data = (fallback.data || []).filter(p => !p.is_adult_creator && !p.is_incognito);
    }

    const profiles = (data || []).map(sanitizeForPublic);
    res.json({
      profiles,
      page,
      limit,
      has_more: profiles.length >= limit,
    });
  } catch (err) {
    console.error('[searchProfiles]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/feed
export const getFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const { gender, minAge, maxAge, country, language, interests, lookingFor, maxDistance } = req.query;
    const maxDistanceKm = maxDistance ? parseFloat(maxDistance) : null;

    const [
      { data: seenMatches },
      { data: matchedAsUser2 },
      { data: blockedRows },
      { data: blockedByRows },
      { data: viewer },
    ] = await Promise.all([
      supabase.from('matches').select('user2_id').eq('user1_id', userId),
      supabase.from('matches').select('user1_id').eq('user2_id', userId).eq('is_match', true),
      supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
      supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
      supabase.from('profiles').select('latitude, longitude, travel_latitude, travel_longitude, travel_until').eq('id', userId).single(),
    ]);

    // Origen del usuario: si tiene travel activo, usa esa ubicación
    const usingTravel = viewer?.travel_until && new Date(viewer.travel_until) > new Date();
    const myLat = usingTravel ? viewer.travel_latitude : viewer?.latitude;
    const myLng = usingTravel ? viewer.travel_longitude : viewer?.longitude;

    const seenIds = [
      ...(seenMatches?.map(m => m.user2_id) || []),
      ...(matchedAsUser2?.map(m => m.user1_id) || []),
      ...(blockedRows?.map(r => r.blocked_id) || []),
      ...(blockedByRows?.map(r => r.blocker_id) || []),
      userId,
    ];

    // SECURITY: these two filters are mandatory — never remove them
    let query = supabase
      .from('profiles')
      .select('*')
      .not('id', 'in', `(${seenIds.join(',')})`)
      .not('full_name', 'is', null)
      .or('is_adult_creator.is.null,is_adult_creator.eq.false')
      .or('is_incognito.is.null,is_incognito.eq.false')
      .or('is_paused.is.null,is_paused.eq.false')
      .limit(limit);

    if (gender && gender !== 'all') query = query.eq('gender', gender);
    if (minAge) query = query.gte('age', parseInt(minAge));
    if (maxAge) query = query.lte('age', parseInt(maxAge));
    if (country) query = query.eq('country', country);
    if (language) query = query.eq('language', language);
    if (lookingFor) query = query.eq('looking_for', lookingFor);
    if (interests) {
      const tags = interests.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) query = query.overlaps('interests', tags);
    }

    let { data: profiles, error } = await query;

    // If query failed (likely a missing column like is_adult_creator/is_incognito),
    // retry with a safer filter that works even on minimal schema
    if (error) {
      console.error('[getFeed] primary query error:', error.message);
      const fallback = await supabase
        .from('profiles')
        .select('*')
        .not('id', 'in', `(${seenIds.join(',')})`)
        .not('full_name', 'is', null)
        .limit(limit);
      if (fallback.error) throw fallback.error;
      // Re-apply security filter in JavaScript when DB columns are missing
      profiles = (fallback.data || []).filter(p =>
        !p.is_adult_creator && !p.is_incognito
      );
    }

    const profileIds = (profiles || []).map(p => p.id);
    let photosByUser = {};
    if (profileIds.length > 0) {
      // Try position first, fallback to order_index
      let photosQuery = await supabase
        .from('profile_photos')
        .select('user_id, id, url, position')
        .in('user_id', profileIds)
        .order('position', { ascending: true });

      if (photosQuery.error) {
        photosQuery = await supabase
          .from('profile_photos')
          .select('user_id, id, url')
          .in('user_id', profileIds);
      }

      (photosQuery.data || []).forEach(photo => {
        if (!photosByUser[photo.user_id]) photosByUser[photo.user_id] = [];
        photosByUser[photo.user_id].push({ id: photo.id, url: photo.url });
      });
    }

    // Haversine — calcular distancia y filtrar
    const haversine = (lat1, lng1, lat2, lng2) => {
      if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) ** 2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    };

    let enriched = (profiles || []).map(p => {
      const targetLat = p.travel_until && new Date(p.travel_until) > new Date() ? p.travel_latitude : p.latitude;
      const targetLng = p.travel_until && new Date(p.travel_until) > new Date() ? p.travel_longitude : p.longitude;
      const distance_km = haversine(myLat, myLng, targetLat, targetLng);
      return { ...sanitizeForPublic(p), photos: photosByUser[p.id] || [], distance_km };
    });

    if (maxDistanceKm && myLat != null && myLng != null) {
      enriched = enriched.filter(p => p.distance_km == null || p.distance_km <= maxDistanceKm);
    }

    res.json({ profiles: enriched });
  } catch (err) {
    console.error('[getFeed]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/:id
export const getProfile = async (req, res) => {
  const targetId = req.params.id;
  const viewerId = req.user?.id;
  let _step = 'init';

  try {
    _step = 'query_profile';
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single();

    if (error || !profile) {
      console.error('[getProfile] not found:', error?.message);
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    _step = 'query_photos';
    let photos = [];
    const { data: photoData, error: photoErr } = await supabase
      .from('profile_photos')
      .select('id, url, position, is_paid, price')
      .eq('user_id', targetId)
      .order('position', { ascending: true });

    if (photoErr) {
      // Retry without optional columns
      const { data: photoFallback } = await supabase
        .from('profile_photos')
        .select('id, url')
        .eq('user_id', targetId);
      photos = photoFallback || [];
    } else {
      photos = photoData || [];
    }

    _step = 'query_subscription';
    let isSubscribed = false;
    if (profile.is_creator && profile.creator_subscription_price && viewerId) {
      const { data: subData } = await supabase
        .from('creator_subscriptions')
        .select('id')
        .eq('subscriber_id', viewerId)
        .eq('creator_id', targetId)
        .eq('status', 'active')
        .maybeSingle();
      isSubscribed = !!subData;
    }

    _step = 'increment_views';
    if (viewerId && viewerId !== targetId) {
      supabase.rpc('increment_profile_views', { target_user_id: targetId }).then(null, () => {});
    }

    _step = 'send_response';
    const isOwner = viewerId === targetId;
    const safeProfile = isOwner ? profile : sanitizeForPublic(profile);
    res.json({
      profile: { ...safeProfile, photos, is_subscribed: isSubscribed },
    });
  } catch (err) {
    console.error(`[getProfile] error at step="${_step}":`, err?.message, err?.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { username, full_name, bio, country } = req.body;
    // Tratar empty strings como "no enviado"
    const age      = req.body.age      !== '' ? req.body.age      : undefined;
    const gender   = req.body.gender   !== '' ? req.body.gender   : undefined;
    const language = req.body.language !== '' ? req.body.language : undefined;
    const height   = req.body.height   !== '' ? req.body.height   : undefined;
    const zodiac   = req.body.zodiac   !== '' ? req.body.zodiac   : undefined;
    const interests = Array.isArray(req.body.interests) ? req.body.interests.slice(0, 8) : undefined;

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

    // Moderación de bio (solo si se está actualizando con texto)
    if (bio !== undefined && bio.trim().length > 0) {
      const { moderateText } = await import('../lib/textModeration.js');
      const mod = await moderateText(bio, { context: 'bio' });
      if (!mod.ok && mod.severity === 'severe') {
        return res.status(422).json({ error: mod.reason, severity: mod.severity });
      }
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
      .upsert({
        id: req.user.id,
        ...(username !== undefined && { username }),
        ...(full_name !== undefined && { full_name: full_name.trim() }),
        ...(parsedAge !== undefined && { age: parsedAge }),
        ...(gender !== undefined && { gender }),
        ...(bio !== undefined && { bio }),
        ...(country !== undefined && { country }),
        ...(language !== undefined && { language }),
        ...(height !== undefined && { height: parseInt(height) || null }),
        ...(zodiac !== undefined && { zodiac }),
        ...(interests !== undefined && { interests }),
        last_active: new Date(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('updateProfile supabase error:', error);
      throw error;
    }

    res.json({ profile });
  } catch (err) {
    console.error('updateProfile error:', err?.message || err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/avatar
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const path = `avatars/${req.user.id}`;
    const url = await uploadFile(path, req.file.buffer, req.file.mimetype);

    await supabase.from('profiles').update({ avatar_url: url }).eq('id', req.user.id);

    res.json({ avatar_url: url });
  } catch (err) {
    logError('profileController', err);
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
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/incognito — activar/desactivar modo incógnito (requiere Premium+)
export const toggleIncognito = async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;

    if (enabled) {
      const { data: profile } = await supabase
        .from('profiles').select('premium_tier').eq('id', userId).single();
      const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
      if (!isPremium) {
        return res.status(403).json({ error: 'El modo incógnito requiere Plan Premium o VIP', code: 'PREMIUM_REQUIRED' });
      }
    }

    await supabase.from('profiles').update({ is_incognito: !!enabled }).eq('id', userId);
    res.json({ is_incognito: !!enabled });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/email-prefs
export const getEmailPrefs = async (req, res) => {
  try {
    const { data } = await supabase.from('profiles')
      .select('email_prefs').eq('id', req.user.id).single();
    res.json({ prefs: data?.email_prefs || {} });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/profiles/email-prefs — body { key, enabled } o { prefs: {...} }
export const updateEmailPrefs = async (req, res) => {
  try {
    const { key, enabled, prefs } = req.body;
    const { data: cur } = await supabase.from('profiles')
      .select('email_prefs').eq('id', req.user.id).single();
    const current = cur?.email_prefs || {};
    const next = prefs ? { ...current, ...prefs } : { ...current, [key]: !!enabled };
    await supabase.from('profiles').update({ email_prefs: next }).eq('id', req.user.id);
    res.json({ prefs: next });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/verify-age — consumer declares 18+ consent
export const verifyAge = async (req, res) => {
  try {
    const userId = req.user.id;
    await supabase.from('profiles').update({ age_verified_at: new Date().toISOString() }).eq('id', userId);
    res.json({ age_verified_at: new Date().toISOString() });
  } catch (err) {
    logError('profileController', err);
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
    logError('profileController', err);
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

    const storagePath = `photos/${req.user.id}/${Date.now()}`;
    const url = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);

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
    logError('profileController', err);
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
      await deleteFile(paths);
    }

    // Eliminar avatar del storage
    await deleteFile([`avatars/${userId}`]);

    // Eliminar el usuario de auth — CASCADE borra profiles y datos relacionados
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ message: 'Cuenta eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la cuenta' });
  }
};

// GET /api/profiles/:id/photos — ahora incluye is_paid y price; oculta la URL si es de pago y el viewer no la compró
export const getPhotosForViewer = async (req, res) => {
  try {
    const ownerId = req.params.id;
    const viewerId = req.user?.id;

    const [{ data: photos, error }, { data: ownerProfile }] = await Promise.all([
      supabase
        .from('profile_photos')
        .select('id, url, position, created_at, is_paid, price')
        .eq('user_id', ownerId)
        .order('position', { ascending: true }),
      supabase
        .from('profiles')
        .select('is_adult_creator')
        .eq('id', ownerId)
        .single(),
    ]);

    if (error) throw error;

    // Si el viewer es el dueño, devolver todo
    if (viewerId === ownerId) {
      return res.json({ photos: photos || [] });
    }

    // Si el creador es adulto, verificar permisos del viewer.
    // 3 formas válidas de ver contenido adulto:
    //   1. El viewer es también creador adulto
    //   2. El viewer ha verificado su edad (age_verified_at)
    //   3. El viewer tiene tier VIP
    // Antes solo se aceptaban 1 y 3 → users normales se quedaban bloqueados
    // sin saber que solo tenían que verificar su edad.
    if (ownerProfile?.is_adult_creator) {
      if (!viewerId) {
        return res.json({ photos: [], requires_age_verification: true });
      }
      const { data: vp } = await supabase
        .from('profiles')
        .select('is_adult_creator, age_verified_at, premium_tier')
        .eq('id', viewerId)
        .single();
      const canSeeAdult = vp?.is_adult_creator || vp?.age_verified_at || vp?.premium_tier === 'vip';
      if (!canSeeAdult) {
        return res.json({ photos: [], requires_age_verification: true });
      }
    }

    // Para fotos de pago, verificar qué compró el viewer
    const paidIds = (photos || []).filter(p => p.is_paid).map(p => p.id);
    let purchasedIds = new Set();

    if (paidIds.length > 0 && viewerId) {
      const { data: purchases } = await supabase
        .from('content_purchases')
        .select('content_id')
        .eq('buyer_id', viewerId)
        .eq('content_type', 'photo')
        .in('content_id', paidIds);

      purchasedIds = new Set((purchases || []).map(p => p.content_id));
    }

    const result = (photos || []).map(p => {
      if (!p.is_paid) return p;
      const purchased = purchasedIds.has(p.id);
      return {
        ...p,
        url: purchased ? p.url : null, // ocultar URL si no compró
        is_purchased: purchased,
      };
    });

    res.json({ photos: result });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/photos/:photoId/pricing — el creador establece precio de una foto
export const setPhotoPricing = async (req, res) => {
  try {
    const { photoId } = req.params;
    const { is_paid, price } = req.body;

    const { data: photo } = await supabase
      .from('profile_photos')
      .select('id, user_id')
      .eq('id', photoId)
      .single();

    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (photo.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const parsedPrice = parseFloat(price) || 0;
    if (is_paid && (parsedPrice <= 0 || parsedPrice > 999)) {
      return res.status(400).json({ error: 'El precio debe ser entre $0.01 y $999' });
    }

    await supabase
      .from('profile_photos')
      .update({
        is_paid: !!is_paid,
        price: is_paid ? parsedPrice : null,
      })
      .eq('id', photoId);

    res.json({ success: true });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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
      await deleteFile([photo.storage_path]);
    }

    const { error } = await supabase.from('profile_photos').delete().eq('id', photoId);
    if (error) throw error;

    res.json({ message: 'Foto eliminada' });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/photos/order — reordenar fotos
export const reorderPhotos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { photoIds } = req.body;
    if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds debe ser un array' });

    await Promise.all(
      photoIds.map((id, idx) =>
        supabase.from('profile_photos').update({ position: idx }).eq('id', id).eq('user_id', userId)
      )
    );

    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/profiles/completion/status — devuelve si el usuario ya reclamó la recompensa de perfil completo
export const getCompletionStatus = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('completion_claimed_at')
      .eq('id', req.user.id)
      .single();
    res.json({ claimed: !!profile?.completion_claimed_at });
  } catch {
    res.json({ claimed: false });
  }
};

// POST /api/profiles/completion/claim — reclamar 50 coins por perfil al 100%
export const claimCompletion = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, age, bio, gender, country, language, avatar_url, completion_claimed_at')
      .eq('id', userId)
      .single();

    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (profile.completion_claimed_at) return res.status(400).json({ error: 'Ya reclamaste esta recompensa', code: 'ALREADY_CLAIMED' });

    const steps = [
      !!profile.avatar_url,
      !!profile.full_name,
      !!profile.age,
      !!profile.bio,
      !!profile.gender,
      !!profile.country,
      !!profile.language,
    ];
    const photos = await supabase.from('profile_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const hasPhotos = (photos.count || 0) > 0;
    const complete = steps.every(Boolean) && hasPhotos;

    if (!complete) return res.status(400).json({ error: 'Tu perfil no está al 100% aún', code: 'INCOMPLETE' });

    await addCoins(userId, 50, 'completion_reward');

    await supabase.from('profiles').update({ completion_claimed_at: new Date().toISOString() }).eq('id', userId);

    res.json({ claimed: true, coins_awarded: 50 });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/boost — activar boost de visibilidad
export const boostProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const BOOST_COST = 50;

    try {
      await spendCoins(userId, BOOST_COST, 'boost');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: 'Coins insuficientes (necesitas 50 coins)', code: 'INSUFFICIENT_COINS' });
      }
      throw e;
    }

    await supabase.from('profiles').update({ boosted_until: new Date(Date.now() + 30 * 60 * 1000) }).eq('id', userId);

    // Email confirmando — pequeño feel-good, también sirve para que el user
    // sepa cuánto le quedan si pierde el reloj. No bloquea response.
    import('../lib/emailNotifier.js').then(({ notifyUser }) =>
      notifyUser(userId, 'boost', { durationMin: 30 }).catch(() => {})
    );

    res.json({ message: 'Boost activado por 30 minutos', cost: BOOST_COST });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/profiles/hide-online — toggle hide_online_status
export const toggleHideOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;
    await supabase.from('profiles').update({ hide_online_status: !!enabled }).eq('id', userId);
    res.json({ hide_online_status: !!enabled });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/pause — pausar cuenta temporalmente
export const pauseAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    await supabase.from('profiles').update({ is_paused: true, paused_at: new Date().toISOString() }).eq('id', userId);
    res.json({ is_paused: true });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/unpause — reactivar cuenta pausada
export const unpauseAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    await supabase.from('profiles').update({ is_paused: false, paused_at: null }).eq('id', userId);
    res.json({ is_paused: false });
  } catch (err) {
    logError('profileController', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/profiles/location — actualizar lat/lng del usuario
export const updateLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'lat/lng inválidos' });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Coordenadas fuera de rango' });
    }
    await supabase.from('profiles').update({
      latitude, longitude,
      location_consent: true,
      location_updated_at: new Date().toISOString(),
    }).eq('id', userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al guardar ubicación' });
  }
};

// PUT /api/profiles/looking-for — qué busca el usuario
export const setLookingFor = async (req, res) => {
  try {
    const { value } = req.body;
    const valid = ['relationship', 'casual', 'friendship', 'unsure', null];
    if (!valid.includes(value)) return res.status(400).json({ error: 'Valor inválido' });
    await supabase.from('profiles').update({ looking_for: value }).eq('id', req.user.id);
    res.json({ looking_for: value });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/profiles/travel — modo viajando (premium)
export const setTravelMode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, city, until } = req.body;

    const { data: profile } = await supabase
      .from('profiles').select('premium_tier').eq('id', userId).single();
    const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
    if (!isPremium) return res.status(403).json({ error: 'Modo viajando requiere Premium', code: 'PREMIUM_REQUIRED' });

    if (!latitude || !longitude) return res.status(400).json({ error: 'Coordenadas requeridas' });

    await supabase.from('profiles').update({
      travel_latitude: latitude,
      travel_longitude: longitude,
      travel_city: city || null,
      travel_until: until || new Date(Date.now() + 7 * 86400000).toISOString(),
    }).eq('id', userId);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// DELETE /api/profiles/travel — desactivar travel mode
export const clearTravelMode = async (req, res) => {
  try {
    await supabase.from('profiles').update({
      travel_latitude: null, travel_longitude: null, travel_city: null, travel_until: null,
    }).eq('id', req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// PUT /api/profiles/search-preferences — guardar filtros
export const saveSearchPreferences = async (req, res) => {
  try {
    const { preferences } = req.body;
    if (typeof preferences !== 'object' || preferences === null) {
      return res.status(400).json({ error: 'preferences debe ser objeto' });
    }
    await supabase.from('profiles').update({ search_preferences: preferences }).eq('id', req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/profiles/search-preferences — recuperar filtros
export const getSearchPreferences = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles').select('search_preferences').eq('id', req.user.id).single();
    res.json({ preferences: profile?.search_preferences || {} });
  } catch {
    res.json({ preferences: {} });
  }
};

// Multer para selfie
const selfieUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });
export const uploadSelfieMiddleware = (req, res, next) => {
  selfieUpload.single('selfie')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La selfie no puede superar 10 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// POST /api/profiles/selfie-verify — subir selfie, marca verificado (basic check)
export const verifySelfie = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selfie requerida' });
    const userId = req.user.id;
    const path = `selfies/${userId}/${Date.now()}.jpg`;
    const url = await uploadFile(path, req.file.buffer, req.file.mimetype);

    // Auto-aprobar — en producción se conectaría a face-match API
    await supabase.from('profiles').update({
      selfie_url: url,
      selfie_verified_at: new Date().toISOString(),
      is_verified: true,
      verification_status: 'verified',
    }).eq('id', userId);

    res.json({ verified: true, selfie_url: url });
  } catch {
    res.status(500).json({ error: 'Error al verificar selfie' });
  }
};

// GET /api/profiles/export — GDPR: exportar todos los datos del usuario
export const exportData = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      { data: profile },
      { data: photos },
      { data: matches },
      { data: messages },
      { data: posts },
      { data: coins },
      { data: subscriptions },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('profile_photos').select('url, created_at').eq('user_id', userId),
      supabase.from('matches').select('id, created_at, status').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).limit(200),
      supabase.from('messages').select('content, type, created_at').eq('sender_id', userId).limit(500),
      supabase.from('posts').select('caption, media_url, created_at').eq('user_id', userId).limit(200),
      supabase.from('coin_transactions').select('amount, type, description, created_at').eq('user_id', userId).limit(500),
      supabase.from('subscriptions').select('plan, status, current_period_end').eq('user_id', userId),
    ]);

    const PRIVATE_FIELDS = ['stripe_customer_id', 'stripe_subscription_id', 'stripe_account_id', 'stripe_account_status'];
    const sanitizedProfile = { ...profile };
    PRIVATE_FIELDS.forEach(f => delete sanitizedProfile[f]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      profile: sanitizedProfile,
      photos: photos || [],
      matches: matches || [],
      messages: messages || [],
      posts: posts || [],
      coin_transactions: coins || [],
      subscriptions: subscriptions || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="destino_datos_${userId.slice(0,8)}.json"`);
    res.json(exportPayload);
  } catch (err) {
    res.status(500).json({ error: 'Error al exportar datos' });
  }
};

