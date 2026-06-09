import { supabase } from '../lib/supabase.js';

// POST /api/admin/breaches — registrar un breach detectado
export const reportBreach = async (req, res) => {
  try {
    const {
      category, severity, affected_users_count, affected_data_categories,
      description, root_cause, containment_actions,
    } = req.body;

    if (!category || !severity || !description || !affected_data_categories) {
      return res.status(400).json({ error: 'category, severity, description y affected_data_categories son requeridos' });
    }

    const { data, error } = await supabase.from('data_breaches').insert({
      category, severity,
      affected_users_count: parseInt(affected_users_count) || 0,
      affected_data_categories,
      description, root_cause: root_cause || null,
      containment_actions: containment_actions || null,
      reported_by: req.user.id,
    }).select('id, detected_at, severity').single();

    if (error) throw error;

    // Auto-alert a Sentry de breach severity high/critical
    if (['high', 'critical'].includes(severity)) {
      console.error(`🚨 BREACH DETECTED [${severity}] id=${data.id}`);
      try {
        const Sentry = await import('@sentry/node');
        Sentry.captureMessage(`Data breach detected: ${description}`, {
          level: 'fatal',
          tags: { breach_id: data.id, severity },
        });
      } catch {}
    }

    res.status(201).json({
      breach: data,
      reminder: 'GDPR Art. 33: notificar a autoridad en 72h. Art. 34: notificar a usuarios si riesgo alto.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/breaches
export const listBreaches = async (req, res) => {
  try {
    const status = req.query.status;
    let query = supabase
      .from('data_breaches')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(100);
    if (status) query = query.eq('status', status);
    const { data } = await query;
    res.json({ breaches: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PATCH /api/admin/breaches/:id
export const updateBreach = async (req, res) => {
  try {
    const patch = { ...req.body };
    if (patch.status === 'notified' && !patch.users_notified_at) {
      patch.users_notified_at = new Date().toISOString();
    }
    if (patch.status === 'resolved' && !patch.resolved_at) {
      patch.resolved_at = new Date().toISOString();
    }
    if (patch.authority_reference && !patch.authority_notified_at) {
      patch.authority_notified_at = new Date().toISOString();
    }

    const { error } = await supabase.from('data_breaches').update(patch).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/admin/breaches/:id/notify-users — fan-out a usuarios afectados
// Body: { user_ids: [], message }
export const notifyAffectedUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_ids, message } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array requerido' });
    }
    if (!message || message.length < 50) {
      return res.status(400).json({ error: 'message debe ser detallado (min 50 caracteres)' });
    }

    const { createNotification } = await import('./inAppNotifController.js');
    let sent = 0;
    for (const uid of user_ids) {
      await createNotification(
        uid,
        'data_breach',
        '⚠️ Notificación importante de seguridad',
        message,
        { breach_id: id }
      ).catch(() => {});
      sent++;
    }

    await supabase.from('data_breaches').update({
      status: 'notified',
      users_notified_at: new Date().toISOString(),
      users_notification_text: message,
    }).eq('id', id);

    res.json({ notified: sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
