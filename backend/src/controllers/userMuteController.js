// userMuteController.js — Soft-mute (snooze) de usuarios.
// Distinto de blocks: el muted puede seguir interactuando, pero el muter
// no ve sus posts/reels/stories. Reversible y temporal (1d/7d/30d/forever).

import { supabase } from '../lib/supabase.js';

const DURATIONS = {
  '1d':       24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'forever': null,
};

// POST /api/user-mutes — { muted_id, duration }
export const muteUser = async (req, res) => {
  try {
    const muterId = req.user.id;
    const { muted_id, duration = '7d' } = req.body;

    if (!muted_id) return res.status(400).json({ error: 'muted_id requerido' });
    if (muted_id === muterId) return res.status(400).json({ error: 'No puedes silenciarte' });
    if (!(duration in DURATIONS)) return res.status(400).json({ error: 'Duración inválida' });

    const ms = DURATIONS[duration];
    const expires_at = ms === null ? null : new Date(Date.now() + ms).toISOString();

    const { error } = await supabase.from('user_mutes').upsert(
      { muter_id: muterId, muted_id, expires_at },
      { onConflict: 'muter_id,muted_id' }
    );
    if (error) throw error;

    res.json({ success: true, expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// DELETE /api/user-mutes/:userId — unmute
export const unmuteUser = async (req, res) => {
  try {
    const muterId = req.user.id;
    const { userId } = req.params;

    await supabase.from('user_mutes')
      .delete()
      .eq('muter_id', muterId)
      .eq('muted_id', userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/user-mutes — lista de mutes activos del user
export const listMyMutes = async (req, res) => {
  try {
    const muterId = req.user.id;
    const { data } = await supabase
      .from('user_mutes')
      .select(`
        muted_id, expires_at, muted_at,
        user:profiles!muted_id(id, full_name, username, avatar_url)
      `)
      .eq('muter_id', muterId)
      .order('muted_at', { ascending: false });

    // Filtrar expirados (cron limpia eventualmente)
    const now = Date.now();
    const active = (data || []).filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now);

    res.json({ mutes: active });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/user-mutes/check/:userId — ¿está muteado? (para UI menu state)
export const checkMute = async (req, res) => {
  try {
    const muterId = req.user.id;
    const { userId } = req.params;
    const { data } = await supabase.from('user_mutes')
      .select('expires_at')
      .eq('muter_id', muterId)
      .eq('muted_id', userId)
      .maybeSingle();

    if (!data) return res.json({ muted: false });
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return res.json({ muted: false });
    }
    res.json({ muted: true, expires_at: data.expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// Helper exportado: getMutedIds(muterId) — usado por feed/discover para filtrar
export async function getMutedIds(muterId) {
  if (!muterId) return [];
  const { data } = await supabase
    .from('user_mutes')
    .select('muted_id, expires_at')
    .eq('muter_id', muterId);

  const now = Date.now();
  return (data || [])
    .filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now)
    .map(m => m.muted_id);
}
