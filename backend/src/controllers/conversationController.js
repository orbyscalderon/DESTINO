// conversationController.js — Group chats entre matches.
// Restricciones:
//   · Max 8 miembros (trigger DB)
//   · Solo puedes invitar a usuarios con los que tengas match activo
//   · El creador (admin) puede agregar/remover miembros; cualquiera puede salirse

import { supabase } from '../lib/supabase.js';
import { sendPushToUser } from './notificationController.js';
import { sanitizeImageUrl } from '../lib/urlValidation.js';

// GET /api/conversations — mis grupos
export const listMyConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select(`
        conversation_id, last_read_at, role,
        conversation:conversations!conversation_id(id, name, avatar_url, created_at, is_archived)
      `)
      .eq('user_id', userId);

    const convs = (memberships || [])
      .filter(m => m.conversation && !m.conversation.is_archived)
      .map(m => ({ ...m.conversation, role: m.role, last_read_at: m.last_read_at }));

    // Para cada conversation, traer último mensaje + count unread
    const enriched = await Promise.all(convs.map(async (c) => {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, type, created_at, sender_id')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let unread = 0;
      if (c.last_read_at) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .gt('created_at', c.last_read_at);
        unread = count || 0;
      }

      const { data: members } = await supabase
        .from('conversation_members')
        .select('user:profiles!user_id(id, full_name, avatar_url)')
        .eq('conversation_id', c.id);

      return {
        ...c,
        last_message: lastMsg,
        unread_count: unread,
        members: (members || []).map(m => m.user),
        member_count: (members || []).length,
      };
    }));

    res.json({ conversations: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/conversations — { name, member_ids: [uuid] }
export const createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, member_ids = [], avatar_url } = req.body;

    if (!name?.trim() || name.length > 60) {
      return res.status(400).json({ error: 'Nombre inválido (1-60 chars)' });
    }
    if (!Array.isArray(member_ids) || member_ids.length === 0) {
      return res.status(400).json({ error: 'Al menos 1 miembro requerido' });
    }
    if (member_ids.length > 7) {
      return res.status(400).json({ error: 'Max 7 miembros adicionales (8 con el creador)' });
    }
    if (member_ids.includes(userId)) {
      return res.status(400).json({ error: 'No te incluyas en member_ids' });
    }

    // Verificar match activo con cada candidato
    const { data: matches } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('is_match', true);

    const matchedSet = new Set();
    (matches || []).forEach(m => {
      const other = m.user1_id === userId ? m.user2_id : m.user1_id;
      matchedSet.add(other);
    });

    const notMatched = member_ids.filter(id => !matchedSet.has(id));
    if (notMatched.length > 0) {
      return res.status(403).json({ error: 'Solo puedes agregar a tus matches' });
    }

    // Create conversation + members en transacción simulada
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({ name: name.trim(), avatar_url: sanitizeImageUrl(avatar_url), created_by: userId })
      .select().single();
    if (convErr) throw convErr;

    const memberRows = [
      { conversation_id: conv.id, user_id: userId, role: 'admin' },
      ...member_ids.map(id => ({ conversation_id: conv.id, user_id: id, role: 'member' })),
    ];
    const { error: memErr } = await supabase.from('conversation_members').insert(memberRows);
    if (memErr) {
      // Rollback
      await supabase.from('conversations').delete().eq('id', conv.id);
      throw memErr;
    }

    // Push a los invitados
    member_ids.forEach(id => {
      sendPushToUser(id, {
        title: 'Te agregaron a un grupo',
        body: `Estás en "${conv.name}"`,
        url: `/conversations/${conv.id}`,
      }).catch(() => {});
    });

    res.json({ conversation: conv });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/conversations/:id
export const getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verificar membership
    const { data: membership } = await supabase
      .from('conversation_members')
      .select('role, last_read_at').eq('conversation_id', id).eq('user_id', userId).maybeSingle();
    if (!membership) return res.status(403).json({ error: 'No eres miembro' });

    const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).single();
    const { data: members } = await supabase
      .from('conversation_members')
      .select('role, joined_at, user:profiles!user_id(id, full_name, username, avatar_url)')
      .eq('conversation_id', id);

    res.json({ conversation: conv, members: members || [], my_role: membership.role });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/conversations/:id/members — admin agrega un match
export const addMember = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { user_id: newId } = req.body;

    const { data: my } = await supabase.from('conversation_members')
      .select('role').eq('conversation_id', id).eq('user_id', userId).maybeSingle();
    if (my?.role !== 'admin') return res.status(403).json({ error: 'Solo admins' });

    // Verificar match
    const { data: match } = await supabase.from('matches')
      .select('id').eq('is_match', true)
      .or(`and(user1_id.eq.${userId},user2_id.eq.${newId}),and(user1_id.eq.${newId},user2_id.eq.${userId})`)
      .maybeSingle();
    if (!match) return res.status(403).json({ error: 'No tienes match con ese user' });

    const { error } = await supabase.from('conversation_members')
      .insert({ conversation_id: id, user_id: newId, role: 'member' });
    if (error) {
      if (error.code === '23514') return res.status(400).json({ error: 'Grupo lleno (max 8)' });
      if (error.code === '23505') return res.status(409).json({ error: 'Ya es miembro' });
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// DELETE /api/conversations/:id/members/:userId — admin remueve / o user se sale
export const removeMember = async (req, res) => {
  try {
    const callerId = req.user.id;
    const { id, userId: targetId } = req.params;

    const { data: my } = await supabase.from('conversation_members')
      .select('role').eq('conversation_id', id).eq('user_id', callerId).maybeSingle();
    if (!my) return res.status(403).json({ error: 'No autorizado' });

    // El user se puede sacar a sí mismo. Si es admin, puede sacar a otros.
    if (targetId !== callerId && my.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admins pueden expulsar' });
    }

    await supabase.from('conversation_members').delete()
      .eq('conversation_id', id).eq('user_id', targetId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/conversations/:id/read — marca como leído
export const markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await supabase.from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', id).eq('user_id', userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};
