import { supabase } from '../lib/supabase.js';
import { SUPER_ADMIN_EMAIL } from '../lib/constants.js';

// POST /api/promo-codes (creator)
export const createPromo = async (req, res) => {
  try {
    const {
      code, type, discount_pct, discount_coins,
      applies_to_id, max_uses, expires_at,
    } = req.body;

    if (!code?.trim() || !type) return res.status(400).json({ error: 'code y type requeridos' });
    if (!['subscription', 'collection', 'tip', 'platform'].includes(type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    if (!discount_pct && !discount_coins) {
      return res.status(400).json({ error: 'discount_pct o discount_coins requerido' });
    }

    const pct = discount_pct ? parseInt(discount_pct) : null;
    if (pct && (pct < 1 || pct > 100)) return res.status(400).json({ error: 'discount_pct entre 1-100' });

    // Solo platform admin puede crear platform-wide codes
    if (type === 'platform') {
      const isAdmin = req.user?.email === SUPER_ADMIN_EMAIL;
      if (!isAdmin) return res.status(403).json({ error: 'Solo admin puede crear platform codes' });
    }

    const { data, error } = await supabase.from('promo_codes').insert({
      code: code.trim().toUpperCase(),
      creator_id: type === 'platform' ? null : req.user.id,
      type,
      discount_pct: pct,
      discount_coins: discount_coins ? parseInt(discount_coins) : null,
      applies_to_id: applies_to_id || null,
      max_uses: max_uses ? parseInt(max_uses) : null,
      expires_at: expires_at || null,
    }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Código ya existe' });
      throw error;
    }
    res.status(201).json({ promo: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/promo-codes — creator ve los suyos
export const listMyPromos = async (req, res) => {
  try {
    const { data } = await supabase.from('promo_codes')
      .select('*').eq('creator_id', req.user.id).order('created_at', { ascending: false });
    res.json({ promos: data || [] });
  } catch { res.status(500).json({ error: 'Error' }); }
};

// POST /api/promo-codes/redeem — fan canjea
export const redeemPromo = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'code requerido' });
    const normalized = code.trim().toUpperCase();

    const { data: promo } = await supabase.from('promo_codes')
      .select('*').eq('code', normalized).eq('active', true).maybeSingle();

    if (!promo) return res.status(404).json({ error: 'Código no encontrado o inactivo' });
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Código expirado' });
    }
    if (promo.max_uses && promo.uses_count >= promo.max_uses) {
      return res.status(410).json({ error: 'Código agotado' });
    }

    // Dedup por usuario
    const { data: existing } = await supabase.from('promo_redemptions')
      .select('id').eq('promo_id', promo.id).eq('user_id', req.user.id).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ya usaste este código' });

    await supabase.from('promo_redemptions').insert({ promo_id: promo.id, user_id: req.user.id });
    await supabase.from('promo_codes').update({ uses_count: (promo.uses_count || 0) + 1 }).eq('id', promo.id);

    res.json({
      type: promo.type,
      discount_pct: promo.discount_pct,
      discount_coins: promo.discount_coins,
      applies_to_id: promo.applies_to_id,
      creator_id: promo.creator_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/promo-codes/:id — toggle active
export const togglePromo = async (req, res) => {
  try {
    const { active } = req.body;
    const { data: promo } = await supabase.from('promo_codes')
      .select('creator_id').eq('id', req.params.id).single();
    if (!promo) return res.status(404).json({ error: 'No encontrado' });
    if (promo.creator_id && promo.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await supabase.from('promo_codes').update({ active: !!active }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
