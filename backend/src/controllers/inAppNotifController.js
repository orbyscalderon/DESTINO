import { supabase } from '../lib/supabase.js';

// Función utilitaria — usada desde otros controllers
export async function createNotification(userId, type, title, body = null, data = {}) {
  try {
    await supabase.from('in_app_notifications').insert({ user_id: userId, type, title, body, data });
  } catch (err) {
    // No romper el flujo principal por un error de notificación
    console.error('createNotification error:', err.message);
  }
}

// GET /api/notifications/in-app
export const listNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const { data: notifications, error } = await supabase
      .from('in_app_notifications')
      .select('id, type, title, body, data, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const { count: unreadCount } = await supabase
      .from('in_app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    res.json({ notifications: notifications || [], unread_count: unreadCount || 0 });
  } catch (err) {
    console.error('listNotifications error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/notifications/in-app/read-all
export const markAllRead = async (req, res) => {
  try {
    await supabase
      .from('in_app_notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/notifications/in-app/:id/read
export const markOneRead = async (req, res) => {
  try {
    await supabase
      .from('in_app_notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
