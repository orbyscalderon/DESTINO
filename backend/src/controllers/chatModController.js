import { supabase } from '../lib/supabase.js';

// ── Helpers internos ───────────────────────────────────────────────────
async function isModOrHost(creatorId, userId) {
  if (creatorId === userId) return true;
  const { data } = await supabase
    .from('show_moderators')
    .select('id')
    .eq('creator_id', creatorId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

// ── Mods CRUD ──────────────────────────────────────────────────────────
// GET /api/shows/mods  → mods del creator logueado
export const listMyMods = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('show_moderators')
      .select('id, added_at, user:profiles!user_id(id, full_name, username, avatar_url)')
      .eq('creator_id', req.user.id)
      .order('added_at', { ascending: false });
    if (error) throw error;
    res.json({ moderators: data || [] });
  } catch {
    res.status(500).json({ error: 'Error cargando mods' });
  }
};

// POST /api/shows/mods  body: { username }  → añadir mod
export const addMod = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username?.trim()) return res.status(400).json({ error: 'username requerido' });

    const { data: target } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim().replace(/^@/, ''))
      .maybeSingle();

    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'No puedes nombrarte a ti mismo' });

    const { error } = await supabase
      .from('show_moderators')
      .insert({
        creator_id: req.user.id,
        user_id: target.id,
        added_by: req.user.id,
      });
    if (error?.code === '23505') return res.status(409).json({ error: 'Ya es moderador' });
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[addMod]', err);
    res.status(500).json({ error: 'Error añadiendo mod' });
  }
};

// DELETE /api/shows/mods/:userId
export const removeMod = async (req, res) => {
  try {
    await supabase
      .from('show_moderators')
      .delete()
      .eq('creator_id', req.user.id)
      .eq('user_id', req.params.userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error eliminando mod' });
  }
};

// ── Ban/mute en chat (mods o creator pueden hacer esto) ────────────────
// POST /api/shows/chat/ban  body: { creator_id, viewer_id, reason? }
export const banChatViewer = async (req, res) => {
  try {
    const { creator_id, viewer_id, reason } = req.body;
    if (!creator_id || !viewer_id) return res.status(400).json({ error: 'creator_id y viewer_id requeridos' });
    if (creator_id === viewer_id) return res.status(400).json({ error: 'Inválido' });

    // Solo el creator o un mod de ese creator puede banear
    const allowed = await isModOrHost(creator_id, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'No autorizado' });

    const { error } = await supabase
      .from('show_chat_bans')
      .upsert({
        creator_id,
        viewer_id,
        banned_by: req.user.id,
        reason: reason?.slice(0, 200) || null,
      }, { onConflict: 'creator_id,viewer_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[banChatViewer]', err);
    res.status(500).json({ error: 'Error baneando' });
  }
};

// DELETE /api/shows/chat/ban/:creatorId/:viewerId
export const unbanChatViewer = async (req, res) => {
  try {
    const { creatorId, viewerId } = req.params;
    const allowed = await isModOrHost(creatorId, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'No autorizado' });
    await supabase
      .from('show_chat_bans')
      .delete()
      .eq('creator_id', creatorId)
      .eq('viewer_id', viewerId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/shows/chat/mute  body: { creator_id, viewer_id, minutes }
export const muteChatViewer = async (req, res) => {
  try {
    const { creator_id, viewer_id, minutes } = req.body;
    if (!creator_id || !viewer_id) return res.status(400).json({ error: 'Inválido' });
    const mins = Math.max(1, Math.min(1440, parseInt(minutes) || 15));

    const allowed = await isModOrHost(creator_id, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'No autorizado' });

    const expires_at = new Date(Date.now() + mins * 60 * 1000).toISOString();
    await supabase
      .from('show_chat_mutes')
      .upsert({
        creator_id,
        viewer_id,
        muted_by: req.user.id,
        expires_at,
      }, { onConflict: 'creator_id,viewer_id' });
    res.json({ ok: true, expires_at });
  } catch {
    res.status(500).json({ error: 'Error muteando' });
  }
};

// GET /api/shows/chat/restrictions/:creatorId  → lista de baneados/muteados
// Para mostrar al creator/mod la lista actual y poder unbanear
export const listChatRestrictions = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const allowed = await isModOrHost(creatorId, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'No autorizado' });

    const [bans, mutes] = await Promise.all([
      supabase.from('show_chat_bans')
        .select('id, viewer_id, reason, created_at, viewer:profiles!viewer_id(id, full_name, username, avatar_url)')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('show_chat_mutes')
        .select('id, viewer_id, expires_at, viewer:profiles!viewer_id(id, full_name, username, avatar_url)')
        .eq('creator_id', creatorId)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false }),
    ]);

    res.json({ bans: bans.data || [], mutes: mutes.data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// Helper exportado para usar en showController al recibir mensaje de chat
export async function isChatBlocked(creatorId, viewerId) {
  if (creatorId === viewerId) return { blocked: false };

  const [{ data: ban }, { data: mute }] = await Promise.all([
    supabase.from('show_chat_bans')
      .select('id')
      .eq('creator_id', creatorId)
      .eq('viewer_id', viewerId)
      .maybeSingle(),
    supabase.from('show_chat_mutes')
      .select('expires_at')
      .eq('creator_id', creatorId)
      .eq('viewer_id', viewerId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ]);

  if (ban) return { blocked: true, reason: 'banned' };
  if (mute) return { blocked: true, reason: 'muted', until: mute.expires_at };
  return { blocked: false };
}
