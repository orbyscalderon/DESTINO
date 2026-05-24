import { supabase } from '../lib/supabase.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// POST /api/blocks — bloquear usuario
export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { blockedId } = req.body;

    if (!blockedId) return res.status(400).json({ error: 'blockedId requerido' });
    if (!isValidUUID(blockedId)) return res.status(400).json({ error: 'blockedId inválido' });
    if (blockedId === blockerId) return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });

    const { error } = await supabase
      .from('blocked_users')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });

    if (error) throw error;

    // Eliminar match entre ambos si existe
    await supabase
      .from('matches')
      .delete()
      .or(`and(user1_id.eq.${blockerId},user2_id.eq.${blockedId}),and(user1_id.eq.${blockedId},user2_id.eq.${blockerId})`);

    res.json({ message: 'Usuario bloqueado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/blocks/:userId — desbloquear usuario
export const unblockUser = async (req, res) => {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', req.user.id)
      .eq('blocked_id', req.params.userId);

    if (error) throw error;
    res.json({ message: 'Usuario desbloqueado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/blocks — lista de usuarios bloqueados
export const getBlockedUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id, created_at, profile:profiles!blocked_id(id, full_name, avatar_url)')
      .eq('blocker_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ blocked: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/blocks/report — reportar usuario
export const reportUser = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { reportedId, reason } = req.body;

    if (!reportedId) return res.status(400).json({ error: 'reportedId requerido' });
    if (!isValidUUID(reportedId)) return res.status(400).json({ error: 'reportedId inválido' });
    if (!reason?.trim()) return res.status(400).json({ error: 'reason requerido' });
    if (reportedId === reporterId) return res.status(400).json({ error: 'No puedes reportarte a ti mismo' });

    const validReasons = ['spam', 'inappropriate', 'harassment', 'fake', 'other', 'fake_profile', 'hate_speech', 'underage'];
    if (!validReasons.includes(reason)) return res.status(400).json({ error: 'Motivo inválido' });

    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: reporterId, reported_id: reportedId, reason });

    if (error) throw error;
    res.json({ message: 'Reporte enviado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
