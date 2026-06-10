import { supabase } from '../lib/supabase.js';

// GET /api/adult-video/series/by/:creatorId — listado público
export const listByCreator = async (req, res) => {
  try {
    const { data } = await supabase.from('video_series')
      .select('id, title, description, cover_url, price_coins, is_paid, videos_count, purchases_count, is_adult, created_at')
      .eq('creator_id', req.params.creatorId).eq('is_published', true)
      .order('created_at', { ascending: false });
    res.json({ series: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/adult-video/series/s/:id — ver serie (gated por compra si is_paid)
export const getSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: series } = await supabase.from('video_series')
      .select('*').eq('id', id).maybeSingle();
    if (!series || !series.is_published) return res.status(404).json({ error: 'Serie no encontrada' });

    let hasAccess = !series.is_paid || userId === series.creator_id;
    if (!hasAccess && userId && series.is_paid) {
      const { data: p } = await supabase.from('video_series_purchases')
        .select('id').eq('series_id', id).eq('buyer_id', userId).maybeSingle();
      hasAccess = !!p;
    }

    const { data: items } = await supabase.from('video_series_items')
      .select(`
        position, episode_title,
        video:profile_videos(
          id, title, thumbnail_url, duration_seconds, is_paid, price,
          is_vr, vr_format
        )
      `)
      .eq('series_id', id).order('position', { ascending: true });

    res.json({ series, items: items || [], locked: !hasAccess });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/adult-video/series — crear (creator)
export const createSeries = async (req, res) => {
  try {
    const { title, description, cover_url, is_paid, price_coins, is_adult } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title requerido' });
    const price = parseInt(price_coins) || 0;
    if (is_paid && price <= 0) return res.status(400).json({ error: 'price_coins requerido para series pagas' });

    const { data, error } = await supabase.from('video_series').insert({
      creator_id: req.user.id,
      title: title.trim(),
      description: description?.trim() || null,
      cover_url: cover_url || null,
      is_paid: !!is_paid, price_coins: price,
      is_adult: !!is_adult,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ series: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/adult-video/series/:id/items — añadir video a serie
export const addVideoToSeries = async (req, res) => {
  try {
    const { video_id, position, episode_title } = req.body;
    if (!video_id) return res.status(400).json({ error: 'video_id requerido' });

    const { data: series } = await supabase.from('video_series')
      .select('creator_id').eq('id', req.params.id).maybeSingle();
    if (series?.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const { data: video } = await supabase.from('profile_videos')
      .select('user_id').eq('id', video_id).maybeSingle();
    if (video?.user_id !== req.user.id) {
      return res.status(403).json({ error: 'El video no es tuyo' });
    }

    const { error } = await supabase.from('video_series_items').insert({
      series_id: req.params.id,
      video_id,
      position: parseInt(position) || 0,
      episode_title: episode_title || null,
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Video ya está en la serie' });
      throw error;
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/adult-video/series/:id/items/:videoId
export const removeFromSeries = async (req, res) => {
  try {
    const { data: series } = await supabase.from('video_series')
      .select('creator_id').eq('id', req.params.id).maybeSingle();
    if (series?.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('video_series_items')
      .delete().eq('series_id', req.params.id).eq('video_id', req.params.videoId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/adult-video/series/:id — editar (publicar, precio, etc.)
export const updateSeries = async (req, res) => {
  try {
    const { data: series } = await supabase.from('video_series')
      .select('creator_id, is_published').eq('id', req.params.id).maybeSingle();
    if (series?.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const patch = { ...req.body };
    delete patch.creator_id; delete patch.id;
    if (patch.is_published === true && !series.is_published) {
      patch.published_at = new Date().toISOString();
    }
    const { error } = await supabase.from('video_series').update(patch).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/adult-video/series/:id/purchase
export const purchaseSeries = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { data: series } = await supabase.from('video_series')
      .select('id, creator_id, price_coins, is_paid, is_published').eq('id', req.params.id).maybeSingle();
    if (!series || !series.is_published) return res.status(404).json({ error: 'Serie no disponible' });
    if (!series.is_paid) return res.status(400).json({ error: 'Esta serie es gratis' });
    if (series.creator_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propia serie' });

    const { data: existing } = await supabase.from('video_series_purchases')
      .select('id').eq('series_id', req.params.id).eq('buyer_id', buyerId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ya compraste esta serie' });

    const { data: bal } = await supabase.from('profiles').select('coins_balance').eq('id', buyerId).single();
    if (!bal || bal.coins_balance < series.price_coins) {
      return res.status(402).json({ error: 'Coins insuficientes', price: series.price_coins });
    }

    await supabase.from('profiles').update({ coins_balance: bal.coins_balance - series.price_coins }).eq('id', buyerId);
    const { data: cb } = await supabase.from('profiles').select('coins_balance').eq('id', series.creator_id).single();
    await supabase.from('profiles').update({ coins_balance: (cb?.coins_balance || 0) + series.price_coins }).eq('id', series.creator_id);

    await supabase.from('video_series_purchases').insert({
      series_id: req.params.id, buyer_id: buyerId, price_paid: series.price_coins,
    });

    // v71: fan_stats
    import('./creatorAdvancedController.js').then(({ incrementFanStats }) =>
      incrementFanStats({ fanId: buyerId, creatorId: series.creator_id, coins: series.price_coins, kind: 'ppv' }).catch(() => {})
    ).catch(() => {});

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
