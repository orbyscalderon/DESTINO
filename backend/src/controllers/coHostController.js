import { supabase } from '../lib/supabase.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

const MAX_CO_HOSTS = 3; // host + hasta 3 co-hosts = 4 publishers

// Helper: el usuario tiene rol de publisher en este show (host o co-host accepted)?
export async function isAuthorizedPublisher(showId, userId) {
  const { data: show } = await supabase
    .from('live_shows').select('host_id').eq('id', showId).single();
  if (!show) return false;
  if (show.host_id === userId) return true;

  const { data: co } = await supabase
    .from('show_co_hosts')
    .select('status')
    .eq('show_id', showId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle();
  return !!co;
}

// POST /api/shows/:id/co-hosts/invite — host invita
// Body: { user_id }
export const inviteCoHost = async (req, res) => {
  try {
    const { id: showId } = req.params;
    const { user_id: inviteeId } = req.body;
    const hostId = req.user.id;

    if (!inviteeId) return res.status(400).json({ error: 'user_id requerido' });
    if (inviteeId === hostId) return res.status(400).json({ error: 'No puedes invitarte a ti mismo' });

    const { data: show } = await supabase
      .from('live_shows')
      .select('id, host_id, title, status, category')
      .eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'Solo el host puede invitar co-hosts' });
    if (show.status === 'ended') return res.status(400).json({ error: 'Show terminado' });

    // Verificar que el invitado es creator (no cualquier usuario)
    const { data: invitee } = await supabase
      .from('profiles')
      .select('id, full_name, is_creator, is_adult_creator')
      .eq('id', inviteeId).single();
    if (!invitee) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!invitee.is_creator) {
      return res.status(400).json({ error: 'Solo puedes invitar a otros creadores' });
    }
    if (show.category === 'adult' && !invitee.is_adult_creator) {
      return res.status(400).json({ error: 'El co-host debe ser creador adulto para shows adultos' });
    }

    // Verificar límite
    const { count: activeCount } = await supabase
      .from('show_co_hosts')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', showId)
      .in('status', ['invited', 'accepted']);
    if ((activeCount || 0) >= MAX_CO_HOSTS) {
      return res.status(400).json({ error: `Máximo ${MAX_CO_HOSTS} co-hosts por show` });
    }

    const { error } = await supabase.from('show_co_hosts').upsert({
      show_id: showId,
      user_id: inviteeId,
      invited_by: hostId,
      status: 'invited',
      invited_at: new Date().toISOString(),
      accepted_at: null,
      ended_at: null,
    }, { onConflict: 'show_id,user_id' });
    if (error) throw error;

    const { data: host } = await supabase
      .from('profiles').select('full_name').eq('id', hostId).single();

    createNotification(
      inviteeId,
      'co_host_invite',
      '🎬 Te invitaron a co-presentar',
      `${host?.full_name || 'Un creador'} te invitó a co-presentar "${show.title}"`,
      { show_id: showId, action: 'cohost_invite' }
    ).catch(() => {});
    sendPushToUser(inviteeId, {
      title: '🎬 Invitación a co-presentar',
      body: `${host?.full_name || 'Un creador'} te invitó a "${show.title}"`,
      url: `/shows/${showId}`,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('inviteCoHost error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/co-hosts/accept — el invitado acepta
export const acceptCoHostInvite = async (req, res) => {
  try {
    const { id: showId } = req.params;
    const userId = req.user.id;

    const { data: invite } = await supabase
      .from('show_co_hosts')
      .select('status')
      .eq('show_id', showId)
      .eq('user_id', userId)
      .single();
    if (!invite) return res.status(404).json({ error: 'No tienes una invitación a este show' });
    if (invite.status !== 'invited') return res.status(400).json({ error: `Invitación ya está en estado: ${invite.status}` });

    await supabase.from('show_co_hosts').update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    }).eq('show_id', showId).eq('user_id', userId);

    // Notificar al host
    const { data: show } = await supabase
      .from('live_shows').select('host_id, title').eq('id', showId).single();
    const { data: cohost } = await supabase
      .from('profiles').select('full_name').eq('id', userId).single();
    if (show?.host_id) {
      createNotification(
        show.host_id,
        'co_host_accepted',
        '✅ Co-host aceptó',
        `${cohost?.full_name || 'Un creador'} se unirá a tu show`,
        { show_id: showId }
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/co-hosts/decline — el invitado rechaza
export const declineCoHostInvite = async (req, res) => {
  try {
    const { id: showId } = req.params;
    await supabase.from('show_co_hosts').update({
      status: 'declined',
    }).eq('show_id', showId).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/shows/:id/co-hosts/:userId — host quita un co-host
export const removeCoHost = async (req, res) => {
  try {
    const { id: showId, userId: targetId } = req.params;
    const hostId = req.user.id;

    const { data: show } = await supabase
      .from('live_shows').select('host_id').eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'Solo el host puede quitar co-hosts' });

    await supabase.from('show_co_hosts').update({
      status: 'kicked',
      ended_at: new Date().toISOString(),
    }).eq('show_id', showId).eq('user_id', targetId);

    // Broadcast al canal del show para que el co-host se desconecte
    try {
      await supabase.channel(`show_${showId}`).send({
        type: 'broadcast',
        event: 'co_host_kicked',
        payload: { user_id: targetId },
      });
    } catch {}

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/co-hosts — listar invitados/aceptados
export const listCoHosts = async (req, res) => {
  try {
    const { id: showId } = req.params;
    const { data } = await supabase
      .from('show_co_hosts')
      .select(`
        status, invited_at, accepted_at,
        user:profiles!user_id(id, full_name, avatar_url, is_verified)
      `)
      .eq('show_id', showId)
      .in('status', ['invited', 'accepted'])
      .order('invited_at', { ascending: true });
    res.json({ co_hosts: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
