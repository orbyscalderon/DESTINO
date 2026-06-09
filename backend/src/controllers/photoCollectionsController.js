import { supabase } from '../lib/supabase.js';

// GET /api/photo-collections/:creatorId — público (listado)
export const listByCreator = async (req, res) => {
  try {
    const { data } = await supabase
      .from('photo_collections')
      .select('id, title, description, cover_url, price_coins, is_adult, items_count, purchases_count, created_at')
      .eq('creator_id', req.params.creatorId)
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    res.json({ collections: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/photo-collections/c/:id — ver una collection (gated por compra)
export const getCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: collection } = await supabase
      .from('photo_collections').select('*').eq('id', id).maybeSingle();
    if (!collection || !collection.is_published) return res.status(404).json({ error: 'Collection no encontrada' });

    let hasAccess = userId === collection.creator_id;
    if (!hasAccess && userId) {
      const { data: purchase } = await supabase
        .from('photo_collection_purchases')
        .select('id').eq('collection_id', id).eq('buyer_id', userId).maybeSingle();
      hasAccess = !!purchase;
    }

    if (!hasAccess) {
      return res.json({
        collection: {
          id: collection.id, title: collection.title, description: collection.description,
          cover_url: collection.cover_url, price_coins: collection.price_coins,
          items_count: collection.items_count, is_adult: collection.is_adult,
        },
        locked: true,
      });
    }

    const { data: items } = await supabase
      .from('photo_collection_items').select('id, url, thumbnail_url, position')
      .eq('collection_id', id).order('position', { ascending: true });

    res.json({ collection, items: items || [], locked: false });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/photo-collections — crear (creator)
export const createCollection = async (req, res) => {
  try {
    const { title, description, cover_url, price_coins, is_adult } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title requerido' });
    const price = parseInt(price_coins);
    if (isNaN(price) || price < 0) return res.status(400).json({ error: 'price_coins inválido' });

    const { data, error } = await supabase.from('photo_collections').insert({
      creator_id: req.user.id,
      title: title.trim(), description: description?.trim() || null,
      cover_url: cover_url || null, price_coins: price, is_adult: !!is_adult,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ collection: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/photo-collections/:id/items — añadir items desde vault
export const addItem = async (req, res) => {
  try {
    const { vault_item_id, url, thumbnail_url, position } = req.body;
    const { data: col } = await supabase.from('photo_collections')
      .select('creator_id').eq('id', req.params.id).maybeSingle();
    if (col?.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    let finalUrl = url;
    let finalThumb = thumbnail_url;
    if (vault_item_id) {
      const { data: vi } = await supabase.from('creator_vault_items')
        .select('url, thumbnail_url').eq('id', vault_item_id).eq('creator_id', req.user.id).single();
      if (vi) { finalUrl = vi.url; finalThumb = vi.thumbnail_url || finalThumb; }
    }
    if (!finalUrl) return res.status(400).json({ error: 'url o vault_item_id requeridos' });

    const { error } = await supabase.from('photo_collection_items').insert({
      collection_id: req.params.id, vault_item_id: vault_item_id || null,
      url: finalUrl, thumbnail_url: finalThumb || null,
      position: parseInt(position) || 0,
    });
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/photo-collections/:id — publicar o editar
export const updateCollection = async (req, res) => {
  try {
    const patch = { ...req.body };
    if (patch.is_published === true && !patch.published_at) patch.published_at = new Date().toISOString();
    const { data: col } = await supabase.from('photo_collections')
      .select('creator_id').eq('id', req.params.id).single();
    if (col?.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const { error } = await supabase.from('photo_collections').update(patch).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/photo-collections/:id/purchase
export const purchaseCollection = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { id } = req.params;

    const { data: col } = await supabase.from('photo_collections')
      .select('id, creator_id, price_coins, is_published').eq('id', id).maybeSingle();
    if (!col || !col.is_published) return res.status(404).json({ error: 'Collection no disponible' });
    if (col.creator_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propia collection' });

    // Dedup
    const { data: existing } = await supabase.from('photo_collection_purchases')
      .select('id').eq('collection_id', id).eq('buyer_id', buyerId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ya compraste esta collection' });

    // Verificar balance
    const { data: bal } = await supabase.from('profiles').select('coins_balance').eq('id', buyerId).single();
    if (!bal || bal.coins_balance < col.price_coins) {
      return res.status(402).json({ error: 'Coins insuficientes', price: col.price_coins });
    }

    // Cobrar
    await supabase.from('profiles').update({ coins_balance: bal.coins_balance - col.price_coins }).eq('id', buyerId);
    const { data: cb } = await supabase.from('profiles').select('coins_balance').eq('id', col.creator_id).single();
    await supabase.from('profiles').update({ coins_balance: (cb?.coins_balance || 0) + col.price_coins }).eq('id', col.creator_id);

    await supabase.from('photo_collection_purchases').insert({
      collection_id: id, buyer_id: buyerId, price_paid: col.price_coins,
    });
    await supabase.from('photo_collections').update({ purchases_count: (col.purchases_count || 0) + 1 }).eq('id', id);

    // v71: fan_stats
    import('./creatorAdvancedController.js').then(({ incrementFanStats }) =>
      incrementFanStats({ fanId: buyerId, creatorId: col.creator_id, coins: col.price_coins, kind: 'ppv' }).catch(() => {})
    ).catch(() => {});

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
