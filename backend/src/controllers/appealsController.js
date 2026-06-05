import { supabase } from '../lib/supabase.js';
import { safeErrorMessage } from '../lib/helpers.js';

// POST /api/appeals — usuario envía apelación
export const submitAppeal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content_type, content_id, reason } = req.body;

    if (!content_type || !content_id || !reason?.trim()) {
      return res.status(400).json({ error: 'content_type, content_id y reason son requeridos' });
    }
    if (reason.trim().length < 10) {
      return res.status(400).json({ error: 'La razón debe tener al menos 10 caracteres' });
    }

    // Verificar que no tenga ya una apelación pendiente para este contenido
    const { data: existing } = await supabase
      .from('content_appeals')
      .select('id, status')
      .eq('user_id', userId)
      .eq('content_id', content_id)
      .eq('content_type', content_type)
      .in('status', ['pending'])
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Ya tienes una apelación pendiente para este contenido' });
    }

    const { data: appeal, error } = await supabase
      .from('content_appeals')
      .insert({ user_id: userId, content_type, content_id, reason: reason.trim() })
      .select('id, status, created_at')
      .single();

    if (error) throw error;
    res.status(201).json({ appeal });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/appeals — usuario ve sus apelaciones
export const getUserAppeals = async (req, res) => {
  try {
    const { data: appeals } = await supabase
      .from('content_appeals')
      .select('id, content_type, content_id, reason, status, admin_note, created_at, reviewed_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ appeals: appeals || [] });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/admin/appeals — admin lista apelaciones
export const adminListAppeals = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { data: appeals } = await supabase
      .from('content_appeals')
      .select(`
        id, content_type, content_id, reason, status, admin_note, created_at, reviewed_at,
        user:profiles!user_id(id, full_name, username, avatar_url)
      `)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(100);

    res.json({ appeals: appeals || [] });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// PATCH /api/admin/appeals/:id — admin aprueba o rechaza
export const adminReviewAppeal = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { action, admin_note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "action debe ser 'approve' o 'reject'" });
    }

    const { data: appeal } = await supabase
      .from('content_appeals')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!appeal) return res.status(404).json({ error: 'Apelación no encontrada' });
    if (appeal.status !== 'pending') return res.status(409).json({ error: 'Esta apelación ya fue revisada' });

    await supabase.from('content_appeals').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      admin_note: admin_note?.trim() || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);

    // Notificar al user que presentó la apelación. Fetch user_id por separado
    // porque el select inicial es lean para no exponer datos.
    const { data: full } = await supabase
      .from('content_appeals')
      .select('user_id')
      .eq('id', id)
      .single();
    if (full?.user_id) {
      import('../lib/emailNotifier.js').then(({ notifyUser }) =>
        notifyUser(full.user_id, 'appeal', {
          status: action === 'approve' ? 'accepted' : 'rejected',
          adminMessage: admin_note?.trim() || null,
        }).catch(() => {})
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};
