import { supabase } from '../lib/supabase.js';

const VALID_TYPES = ['post', 'reel', 'video', 'photo', 'show', 'collection', 'profile'];

// GET /api/content-geo/mine
export const listMyGeoBlocks = async (req, res) => {
  try {
    const { data } = await supabase
      .from('content_geo_blocks').select('*')
      .eq('creator_id', req.user.id).order('created_at', { ascending: false });
    res.json({ blocks: data || [] });
  } catch { res.status(500).json({ error: 'Error' }); }
};

// PUT /api/content-geo
// Body: { content_type, content_id, country_codes: [], reason? }
export const upsertGeoBlock = async (req, res) => {
  try {
    const { content_type, content_id, country_codes, reason } = req.body;
    if (!VALID_TYPES.includes(content_type)) return res.status(400).json({ error: 'content_type inválido' });
    if (!content_id) return res.status(400).json({ error: 'content_id requerido' });
    if (!Array.isArray(country_codes) || country_codes.length === 0) {
      return res.status(400).json({ error: 'country_codes array requerido' });
    }
    const codes = country_codes.map(c => String(c).toUpperCase().slice(0, 2));

    const { data, error } = await supabase.from('content_geo_blocks').upsert({
      content_type, content_id, creator_id: req.user.id,
      country_codes: codes, reason: reason || null,
    }, { onConflict: 'content_type,content_id' }).select().single();

    if (error) throw error;
    res.json({ block: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// DELETE /api/content-geo/:type/:id
export const removeGeoBlock = async (req, res) => {
  try {
    const { type, id } = req.params;
    const { error } = await supabase.from('content_geo_blocks').delete()
      .eq('content_type', type).eq('content_id', id).eq('creator_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Helper interno — verificar si un user puede ver un contenido por geo
export async function isContentBlockedForCountry(contentType, contentId, country) {
  try {
    if (!country) return false;
    const { data } = await supabase.from('content_geo_blocks')
      .select('country_codes').eq('content_type', contentType).eq('content_id', contentId).maybeSingle();
    if (!data?.country_codes) return false;
    return data.country_codes.includes(country.toUpperCase());
  } catch {
    return false;
  }
}
