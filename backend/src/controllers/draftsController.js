import { supabase } from '../lib/supabase.js';

const MAX_DRAFTS_PER_USER = 50;
const MAX_DRAFT_SIZE = 10000;

// GET /api/drafts?key=post — opcionalmente filtrar por key
export const listDrafts = async (req, res) => {
  try {
    const { key } = req.query;
    let q = supabase.from('user_drafts')
      .select('id, draft_key, content, metadata, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });
    if (key) q = q.eq('draft_key', key);
    const { data } = await q;
    res.json({ drafts: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/drafts — upsert (idempotente por draft_key)
// Body: { draft_key, content, metadata? }
export const upsertDraft = async (req, res) => {
  try {
    const { draft_key, content, metadata } = req.body;
    if (!draft_key?.trim()) return res.status(400).json({ error: 'draft_key requerido' });
    if (content && content.length > MAX_DRAFT_SIZE) {
      return res.status(400).json({ error: 'Draft demasiado largo' });
    }

    // Si content vacío, borrar
    if (!content?.trim() && !metadata) {
      await supabase.from('user_drafts').delete()
        .eq('user_id', req.user.id).eq('draft_key', draft_key);
      return res.json({ deleted: true });
    }

    // Cap de drafts: borrar el más viejo si excede el límite
    const { count } = await supabase.from('user_drafts')
      .select('id', { count: 'exact', head: true }).eq('user_id', req.user.id);
    if ((count || 0) >= MAX_DRAFTS_PER_USER) {
      const { data: oldest } = await supabase.from('user_drafts')
        .select('id').eq('user_id', req.user.id)
        .order('updated_at', { ascending: true }).limit(1).maybeSingle();
      if (oldest) await supabase.from('user_drafts').delete().eq('id', oldest.id);
    }

    const { data, error } = await supabase.from('user_drafts').upsert({
      user_id: req.user.id,
      draft_key,
      content: content || null,
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,draft_key' }).select().single();
    if (error) throw error;

    res.json({ draft: data });
  } catch (err) {
    console.error('upsertDraft error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/drafts/:key
export const deleteDraft = async (req, res) => {
  try {
    const { key } = req.params;
    await supabase.from('user_drafts').delete()
      .eq('user_id', req.user.id).eq('draft_key', key);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
