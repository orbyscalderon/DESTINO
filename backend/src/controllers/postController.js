import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { createNotification } from './inAppNotifController.js';
import { spendCoins, addCoins } from './coinController.js';

const BUCKET = 'DESTINO';
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado'), false);
  },
});
export const postMediaMiddleware = (req, res, next) => {
  upload.single('media')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo no puede superar 50 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// GET /api/posts — feed de momentos
export const getFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const before = req.query.before;

    // Perfil del usuario para saber si es adulto
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('is_adult_creator')
      .eq('id', userId)
      .single();

    let query = supabase
      .from('posts')
      .select(`
        id, caption, media_url, media_type, is_adult, is_subscribers_only,
        is_paid, price, likes_count, comments_count, created_at, status,
        author:profiles!user_id(id, full_name, avatar_url, is_verified, is_creator, is_adult_creator)
      `)
      .or(`status.eq.published,and(status.eq.pending_review,user_id.eq.${userId})`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);

    const { data: posts, error } = await query;
    if (error) throw error;

    // Verificar qué posts le dio like el usuario
    const postIds = (posts || []).map(p => p.id);
    let likedIds = new Set();
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);
      likedIds = new Set((likes || []).map(l => l.post_id));
    }

    // Suscripciones del usuario a creadores
    const { data: subs } = await supabase
      .from('creator_subscriptions')
      .select('creator_id')
      .eq('subscriber_id', userId)
      .eq('status', 'active');
    const subscribedTo = new Set((subs || []).map(s => s.creator_id));

    // Paid posts purchased by viewer
    const paidPostIds = (posts || []).filter(p => p.is_paid).map(p => p.id);
    let purchasedPostIds = new Set();
    if (paidPostIds.length > 0) {
      const { data: purchases } = await supabase
        .from('content_purchases')
        .select('content_id')
        .eq('buyer_id', userId)
        .eq('content_type', 'post')
        .in('content_id', paidPostIds);
      purchasedPostIds = new Set((purchases || []).map(p => p.content_id));
    }

    const result = (posts || []).map(p => {
      const isOwn = p.author?.id === userId;
      const isSubscribed = subscribedTo.has(p.author?.id);
      const canSeeAdult = myProfile?.is_adult_creator || isOwn;

      // Ocultar contenido solo-suscriptores si no está suscrito
      if (p.is_subscribers_only && !isOwn && !isSubscribed) {
        return { ...p, media_url: null, locked: true, liked: false };
      }

      // Ocultar contenido adulto si el viewer no está en modo adulto
      if (p.is_adult && !canSeeAdult && !isSubscribed) {
        return { ...p, media_url: null, caption: null, blurred: true, liked: likedIds.has(p.id) };
      }

      // Paid post gating
      if (p.is_paid && !isOwn && !isSubscribed && !purchasedPostIds.has(p.id)) {
        return { ...p, media_url: null, locked: true, is_purchased: false, liked: likedIds.has(p.id) };
      }

      return { ...p, liked: likedIds.has(p.id), is_purchased: p.is_paid ? purchasedPostIds.has(p.id) : undefined };
    });

    res.json({ posts: result, hasMore: (posts || []).length === limit });
  } catch (err) {
    console.error('getFeed error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/posts/user/:userId — posts de un usuario específico
export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const before = req.query.before;

    const { data: sub } = await supabase
      .from('creator_subscriptions')
      .select('id')
      .eq('subscriber_id', viewerId)
      .eq('creator_id', userId)
      .eq('status', 'active')
      .single();

    const isSubscribed = !!sub || viewerId === userId;

    let query = supabase
      .from('posts')
      .select('id, caption, media_url, media_type, is_adult, is_subscribers_only, is_paid, price, likes_count, comments_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);
    const { data: posts } = await query;

    const postIds = (posts || []).map(p => p.id);
    let likedIds = new Set();
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('post_likes').select('post_id')
        .eq('user_id', viewerId).in('post_id', postIds);
      likedIds = new Set((likes || []).map(l => l.post_id));
    }

    const paidIds = (posts || []).filter(p => p.is_paid).map(p => p.id);
    let purchasedIds = new Set();
    if (paidIds.length > 0 && viewerId !== userId) {
      const { data: purchases } = await supabase
        .from('content_purchases')
        .select('content_id')
        .eq('buyer_id', viewerId)
        .eq('content_type', 'post')
        .in('content_id', paidIds);
      purchasedIds = new Set((purchases || []).map(p => p.content_id));
    }

    const result = (posts || []).map(p => {
      if (p.is_subscribers_only && !isSubscribed) {
        return { ...p, media_url: null, locked: true, liked: false };
      }
      if (p.is_paid && viewerId !== userId && !isSubscribed && !purchasedIds.has(p.id)) {
        return { ...p, media_url: null, locked: true, is_purchased: false, liked: likedIds.has(p.id) };
      }
      return { ...p, liked: likedIds.has(p.id), is_purchased: p.is_paid ? (viewerId === userId || purchasedIds.has(p.id)) : undefined };
    });

    res.json({ posts: result, hasMore: (posts || []).length === limit });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/posts — crear post
export const createPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { caption, is_adult, is_subscribers_only, is_paid, price } = req.body;
    const isAdult = is_adult === 'true' || is_adult === true;
    const subOnly = is_subscribers_only === 'true' || is_subscribers_only === true;
    const isPaid = is_paid === 'true' || is_paid === true;
    const coinPrice = isPaid ? Math.max(1, Math.min(9999, parseInt(price) || 0)) : 0;

    if (isPaid && coinPrice < 1) {
      return res.status(400).json({ error: 'El precio mínimo es 1 coin' });
    }
    if (isPaid) {
      const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', userId).single();
      if (!profile?.is_creator) {
        return res.status(403).json({ error: 'Solo los creadores pueden publicar posts de pago' });
      }
    }

    // Verificar permisos para contenido adulto
    if (isAdult) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_adult_creator, is_creator')
        .eq('id', userId)
        .single();
      if (!profile?.is_adult_creator) {
        return res.status(403).json({ error: 'Activa el modo creador adulto en tu perfil' });
      }
    }

    if (subOnly) {
      const { data: profile } = await supabase
        .from('profiles').select('is_creator').eq('id', userId).single();
      if (!profile?.is_creator) {
        return res.status(403).json({ error: 'Solo los creadores pueden publicar contenido exclusivo para suscriptores' });
      }
    }

    let mediaUrl = null;
    let mediaType = 'text';

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const ext = isVideo ? 'mp4' : 'jpg';
      const storagePath = `posts/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (uploadError) throw uploadError;
      mediaUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
      mediaType = isVideo ? 'video' : 'photo';
    }

    if (!caption?.trim() && !mediaUrl) {
      return res.status(400).json({ error: 'El post necesita texto o media' });
    }

    // Adult content goes to moderation queue before publishing
    const status = isAdult ? 'pending_review' : 'published';

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        caption: caption?.trim() || null,
        media_url: mediaUrl,
        media_type: mediaType,
        is_adult: isAdult,
        is_subscribers_only: subOnly,
        is_paid: isPaid,
        price: coinPrice,
        status,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ post });
  } catch (err) {
    console.error('createPost error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/posts/:id
export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: post } = await supabase.from('posts').select('user_id').eq('id', id).single();
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.user_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('posts').delete().eq('id', id);
    res.json({ message: 'Post eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/posts/:id/like — toggle like
export const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: existing } = await supabase
      .from('post_likes').select('id').eq('post_id', id).eq('user_id', userId).single();

    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      await supabase.rpc('update_post_likes', { p_post_id: id, p_delta: -1 });
      return res.json({ liked: false });
    }

    await supabase.from('post_likes').insert({ post_id: id, user_id: userId });
    await supabase.rpc('update_post_likes', { p_post_id: id, p_delta: 1 });

    const { data: post } = await supabase.from('posts').select('user_id').eq('id', id).single();
    if (post?.user_id && post.user_id !== userId) {
      createNotification(post.user_id, 'like', '¡Nuevo like!', 'A alguien le gustó tu post', { post_id: id });
    }

    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/posts/:id/comments
export const getComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: comments } = await supabase
      .from('post_comments')
      .select('id, content, created_at, user:profiles!user_id(id, full_name, avatar_url)')
      .eq('post_id', id)
      .order('created_at', { ascending: true })
      .limit(50);
    res.json({ comments: comments || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/posts/:id/purchase
export const purchasePost = async (req, res) => {
  try {
    const { id } = req.params;
    const buyerId = req.user.id;

    const { data: post } = await supabase
      .from('posts')
      .select('id, user_id, is_paid, price, caption')
      .eq('id', id)
      .single();

    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (!post.is_paid) return res.status(400).json({ error: 'Este post es gratuito' });
    if (post.user_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propio post' });

    const { data: existing } = await supabase
      .from('content_purchases')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('content_id', id)
      .eq('content_type', 'post')
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Ya compraste este post' });

    try {
      await spendCoins(buyerId, post.price, 'post_purchase');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: `Coins insuficientes (necesitas ${post.price})`, code: 'INSUFFICIENT_COINS' });
      }
      throw e;
    }

    await supabase.from('content_purchases').insert({
      buyer_id: buyerId,
      content_id: id,
      content_type: 'post',
      coins_paid: post.price,
    });

    const creatorShare = Math.floor(post.price * 0.8);
    if (creatorShare > 0) {
      await addCoins(post.user_id, creatorShare, 'post_sale').catch(() => {});
    }

    res.json({ success: true, message: 'Post desbloqueado' });
  } catch (err) {
    console.error('purchasePost error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/posts/:id/comments
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content?.trim()) return res.status(400).json({ error: 'Comentario vacío' });
    if (content.length > 500) return res.status(400).json({ error: 'Comentario demasiado largo' });

    const { data: comment, error } = await supabase
      .from('post_comments')
      .insert({ post_id: id, user_id: userId, content: content.trim() })
      .select('id, content, created_at, user:profiles!user_id(id, full_name, avatar_url)')
      .single();

    if (error) throw error;

    await supabase.rpc('update_post_comments', { p_post_id: id, p_delta: 1 });

    const { data: post } = await supabase.from('posts').select('user_id').eq('id', id).single();
    if (post?.user_id && post.user_id !== userId) {
      createNotification(post.user_id, 'comment', 'Nuevo comentario', content.trim().substring(0, 80), { post_id: id });
    }

    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
