import { supabase } from '../lib/supabase.js';

const CATEGORIES = [
  'illegal_content', 'csam', 'terrorism', 'hate_speech', 'harassment',
  'copyright', 'trademark', 'privacy_violation', 'non_consensual',
  'minor_protection', 'consumer_protection', 'other',
];

// Categorías de máxima prioridad — DSA exige respuesta inmediata
const URGENT_CATEGORIES = new Set(['csam', 'terrorism', 'minor_protection']);

// POST /api/dsa-notice — público (DSA Art. 16)
// Body: {
//   notifier_name, notifier_email, notifier_country?,
//   content_type, content_id?, content_url?,
//   reason_category, reason_text, alleged_illegality_basis?,
//   good_faith_statement: true
// }
export const submitNotice = async (req, res) => {
  try {
    const {
      notifier_name, notifier_email, notifier_country,
      content_type, content_id, content_url,
      reason_category, reason_text, alleged_illegality_basis,
      good_faith_statement,
    } = req.body;

    if (!notifier_name || !notifier_email) {
      return res.status(400).json({ error: 'notifier_name y notifier_email son requeridos' });
    }
    if (!CATEGORIES.includes(reason_category)) {
      return res.status(400).json({ error: 'reason_category inválido', valid: CATEGORIES });
    }
    if (!reason_text || reason_text.length < 20) {
      return res.status(400).json({ error: 'reason_text debe tener al menos 20 caracteres explicando la presunta ilegalidad' });
    }
    if (!good_faith_statement) {
      return res.status(400).json({ error: 'Debes confirmar la good_faith_statement requerida por DSA Art. 16(2)(d)' });
    }
    if (!content_type) {
      return res.status(400).json({ error: 'content_type requerido' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifier_email)) {
      return res.status(400).json({ error: 'notifier_email inválido' });
    }

    const isUrgent = URGENT_CATEGORIES.has(reason_category);

    const { data, error } = await supabase.from('dsa_notices').insert({
      notifier_name: notifier_name.trim().slice(0, 200),
      notifier_email: notifier_email.toLowerCase().trim(),
      notifier_country: notifier_country?.toUpperCase().slice(0, 2) || null,
      content_type,
      content_id: content_id || null,
      content_url: content_url?.slice(0, 1000) || null,
      reason_category,
      reason_text: reason_text.trim().slice(0, 5000),
      alleged_illegality_basis: alleged_illegality_basis?.slice(0, 2000) || null,
      good_faith_statement: !!good_faith_statement,
      status: 'acknowledged',  // DSA exige acknowledgment automático
      acknowledged_at: new Date().toISOString(),
      ip: req.ip || null,
      user_agent: req.headers['user-agent']?.slice(0, 500) || null,
    }).select('id, acknowledged_at, status').single();

    if (error) throw error;

    res.status(201).json({
      message: isUrgent
        ? 'Notice received and marked urgent. We will action this within 24 hours per DSA Art. 16(6).'
        : 'Notice received and acknowledged. We will action this within 7 business days per DSA Art. 16(6).',
      reference_id: data.id,
      acknowledged_at: data.acknowledged_at,
      urgent: isUrgent,
    });
  } catch (err) {
    console.error('submitNotice error:', err.message);
    res.status(500).json({ error: 'Error procesando la notificación' });
  }
};

// GET /api/admin/dsa-notices?status=acknowledged
export const listNotices = async (req, res) => {
  try {
    const status = req.query.status || 'acknowledged';
    const { data } = await supabase
      .from('dsa_notices')
      .select('*')
      .eq('status', status)
      .order('submitted_at', { ascending: false })
      .limit(200);
    res.json({ notices: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PATCH /api/admin/dsa-notices/:id
// Body: { action: 'review'|'action'|'dismiss', resolution?, notes?, remove_content? }
export const processNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, resolution, notes, remove_content } = req.body;

    const { data: notice } = await supabase.from('dsa_notices').select('*').eq('id', id).single();
    if (!notice) return res.status(404).json({ error: 'Notice no encontrado' });

    const statusMap = { review: 'reviewed', action: 'actioned', dismiss: 'dismissed' };
    const status = statusMap[action];
    if (!status) return res.status(400).json({ error: 'Acción inválida' });

    if (action === 'action' && remove_content && notice.content_id && notice.content_type) {
      const tableMap = {
        photo: 'profile_photos', video: 'profile_videos',
        post: 'posts', show: 'live_shows', reel: 'reels',
      };
      const table = tableMap[notice.content_type];
      let affectedUserId = null;
      if (table) {
        const { data: row } = await supabase.from(table)
          .select(notice.content_type === 'show' ? 'host_id' : 'user_id')
          .eq('id', notice.content_id).maybeSingle();
        affectedUserId = notice.content_type === 'show' ? row?.host_id : row?.user_id;
      }
      if (table === 'profile_videos') {
        await supabase.from(table).update({ is_hidden: true }).eq('id', notice.content_id);
      } else if (table) {
        await supabase.from(table).delete().eq('id', notice.content_id);
      }

      // v69: Statement of Reasons (DSA Art. 17)
      if (affectedUserId) {
        const { logModerationDecision } = await import('./moderationDecisionController.js');
        logModerationDecision({
          content_type: notice.content_type,
          content_id: notice.content_id,
          affected_user_id: affectedUserId,
          decision: table === 'profile_videos' ? 'hidden' : 'removed',
          decision_method: 'human',
          decided_by: req.user.id,
          reason_category: notice.reason_category,
          reason_detail: resolution || notice.reason_text,
          legal_basis: notice.alleged_illegality_basis || 'DSA Art. 16 Notice and Action',
          tos_clause: 'Términos §3 (Conducta prohibida)',
          source: 'dsa_notice',
          source_reference_id: notice.id,
        }).catch(() => {});
      }
    }

    await supabase.from('dsa_notices').update({
      status,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      resolution: resolution || null,
      resolution_notes: notes || null,
    }).eq('id', id);

    res.json({ ok: true, status });
  } catch (err) {
    console.error('processNotice error:', err.message);
    res.status(500).json({ error: 'Error procesando notice' });
  }
};
