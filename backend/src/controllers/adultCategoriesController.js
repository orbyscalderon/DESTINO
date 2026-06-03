import { supabase } from '../lib/supabase.js';
import { safeErrorMessage } from '../lib/helpers.js';

const MAX_CATEGORIES_PER_CREATOR = 12;

// GET /api/adult-categories — catálogo completo (público, autenticado por router)
export const listCategories = async (req, res) => {
  try {
    const { data } = await supabase
      .from('adult_categories')
      .select('id, slug, name, group_name, emoji, sort_order')
      .eq('is_active', true)
      .order('group_name', { ascending: true })
      .order('sort_order', { ascending: true });

    // Agrupar por group_name para facilitar el render
    const groups = {};
    (data || []).forEach(c => {
      if (!groups[c.group_name]) groups[c.group_name] = [];
      groups[c.group_name].push(c);
    });
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/adult-categories/creator/:userId — categorías de un creador
export const getCreatorCategories = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data } = await supabase
      .from('creator_adult_categories')
      .select(`
        added_at,
        category:adult_categories!category_id (id, slug, name, group_name, emoji)
      `)
      .eq('creator_id', userId);
    const categories = (data || []).map(r => r.category).filter(Boolean);
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/adult-categories/mine — mis categorías (atajo para creators)
export const getMyCategories = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data } = await supabase
      .from('creator_adult_categories')
      .select(`category:adult_categories!category_id (id, slug, name, group_name, emoji)`)
      .eq('creator_id', userId);
    const categories = (data || []).map(r => r.category).filter(Boolean);
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// PUT /api/adult-categories/mine — replace mis categorías
// Body: { slugs: ['fitness', 'milf', 'cosplay'] }
export const updateMyCategories = async (req, res) => {
  try {
    const userId = req.user.id;
    const slugs = Array.isArray(req.body?.slugs) ? req.body.slugs.slice(0, MAX_CATEGORIES_PER_CREATOR) : [];

    // Validar que el user es creator adulto
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_adult_creator')
      .eq('id', userId)
      .single();
    if (!profile?.is_adult_creator) {
      return res.status(403).json({ error: 'Solo creadores adultos pueden setear categorías' });
    }

    // Resolver IDs de las categorías
    let categoryIds = [];
    if (slugs.length > 0) {
      const { data: cats } = await supabase
        .from('adult_categories')
        .select('id, slug')
        .in('slug', slugs)
        .eq('is_active', true);
      categoryIds = (cats || []).map(c => c.id);
    }

    // Replace: borrar las viejas + insertar las nuevas
    await supabase.from('creator_adult_categories').delete().eq('creator_id', userId);

    if (categoryIds.length > 0) {
      const rows = categoryIds.map(id => ({ creator_id: userId, category_id: id }));
      const { error } = await supabase.from('creator_adult_categories').insert(rows);
      if (error) throw error;
    }

    res.json({ success: true, count: categoryIds.length });
  } catch (err) {
    console.error('[updateMyCategories] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};
