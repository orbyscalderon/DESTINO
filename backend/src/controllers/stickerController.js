// stickerController.js — Marketplace de sticker packs.
// Packs son del admin (creator_id = NULL) o de creators verificados.
// User compra el pack con coins (RPC purchase_sticker_pack atomic),
// luego puede usar los stickers en chats.

import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import multer from 'multer';

const ALLOWED_MIME = ['image/png', 'image/webp', 'image/gif'];
const stickerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB por sticker
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo PNG/WEBP/GIF'), false);
  },
});

export const stickerUploadMiddleware = (req, res, next) => {
  stickerUpload.array('stickers', 20)(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Cada sticker max 2MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// GET /api/stickers/packs — packs activos, ordenados por featured + ventas
export const listPacks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: packs } = await supabase
      .from('sticker_packs')
      .select(`
        id, name, description, cover_url, price_coins, is_featured, total_sold,
        creator:profiles!creator_id(id, full_name, avatar_url, is_verified)
      `)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('total_sold', { ascending: false })
      .limit(50);

    // Marcar los que ya posee el user
    const { data: owned } = await supabase
      .from('user_sticker_packs')
      .select('pack_id')
      .eq('user_id', userId);

    const ownedIds = new Set((owned || []).map(o => o.pack_id));
    const list = (packs || []).map(p => ({ ...p, owned: ownedIds.has(p.id) }));
    res.json({ packs: list });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/stickers/packs/:packId — pack + items (si owned o preview)
export const getPack = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packId } = req.params;

    const { data: pack } = await supabase
      .from('sticker_packs')
      .select('*, creator:profiles!creator_id(id, full_name, avatar_url, is_verified)')
      .eq('id', packId)
      .eq('is_active', true)
      .single();

    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const { data: items } = await supabase
      .from('sticker_items')
      .select('id, image_url, label, sort_order')
      .eq('pack_id', packId)
      .order('sort_order');

    const { data: ownership } = await supabase
      .from('user_sticker_packs')
      .select('user_id').eq('user_id', userId).eq('pack_id', packId).maybeSingle();

    res.json({ pack, items: items || [], owned: !!ownership });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/stickers/packs/:packId/purchase — compra atómica con coins
export const purchasePack = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packId } = req.params;

    const { data, error } = await supabase.rpc('purchase_sticker_pack', { p_pack_id: packId });

    if (error) {
      if (error.code === '23514') return res.status(402).json({ error: 'Coins insuficientes', code: 'INSUFFICIENT_COINS' });
      if (error.code === 'P0002') return res.status(404).json({ error: 'Pack no encontrado' });
      throw error;
    }

    res.json({ success: true, remaining_coins: data?.[0]?.remaining_coins ?? null });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/stickers/my — packs que poseo (para mostrar en panel del chat)
export const listMyPacks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data } = await supabase
      .from('user_sticker_packs')
      .select(`
        acquired_at,
        pack:sticker_packs!pack_id(id, name, cover_url,
          items:sticker_items(id, image_url, label, sort_order))
      `)
      .eq('user_id', userId)
      .order('acquired_at', { ascending: false });

    // Filtrar items por sort_order dentro del pack
    const packs = (data || []).map(d => ({
      ...d.pack,
      items: (d.pack?.items || []).sort((a, b) => a.sort_order - b.sort_order),
      acquired_at: d.acquired_at,
    }));

    res.json({ packs });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/stickers/packs (creator only) — crear pack vacío para luego subir items
export const createPack = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, price_coins } = req.body;

    const { data: profile } = await supabase
      .from('profiles').select('is_verified, is_creator').eq('id', userId).single();

    if (!profile?.is_verified || !profile?.is_creator) {
      return res.status(403).json({ error: 'Solo creators verificados pueden crear packs' });
    }

    if (!name?.trim() || name.length > 80) return res.status(400).json({ error: 'Nombre inválido' });
    const price = Math.max(0, Math.min(99999, parseInt(price_coins) || 0));

    const { data: pack, error } = await supabase
      .from('sticker_packs')
      .insert({ creator_id: userId, name: name.trim(), description: description?.slice(0, 500) || null, price_coins: price })
      .select().single();

    if (error) throw error;
    res.json({ pack });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/stickers/packs/:packId/items — sube imágenes (max 20)
export const uploadStickerItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packId } = req.params;

    const { data: pack } = await supabase.from('sticker_packs')
      .select('creator_id').eq('id', packId).single();

    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    if (pack.creator_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Sin archivos' });

    const inserts = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const url = await uploadFile({
        bucket: 'stickers',
        path: `${packId}/${Date.now()}-${i}.${f.mimetype.split('/')[1]}`,
        buffer: f.buffer,
        contentType: f.mimetype,
      });
      inserts.push({ pack_id: packId, image_url: url, sort_order: i, label: req.body[`label_${i}`]?.slice(0, 40) || null });
    }

    const { data, error } = await supabase.from('sticker_items').insert(inserts).select();
    if (error) throw error;
    res.json({ items: data });
  } catch (err) {
    console.error('[stickers] upload error:', err.message);
    res.status(500).json({ error: 'Error subiendo stickers' });
  }
};
