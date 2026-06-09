import { supabase } from '../lib/supabase.js';

// Helper interno — registra un Statement of Reasons (DSA Art. 17)
// Llamado desde adminController, dmcaController, dsaController, etc.
export async function logModerationDecision({
  content_type, content_id, affected_user_id,
  decision, decision_method, decided_by, automated_system,
  reason_category, reason_detail, legal_basis, tos_clause,
  geographic_scope, source, source_reference_id, appealable = true,
}) {
  try {
    if (!affected_user_id || !decision || !reason_detail) {
      console.warn('[logModerationDecision] datos insuficientes');
      return null;
    }

    const appeal_deadline = appealable
      ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 meses DSA Art. 20
      : null;

    const { data } = await supabase.from('moderation_decisions').insert({
      content_type, content_id: content_id || null, affected_user_id,
      decision, decision_method,
      decided_by: decided_by || null,
      automated_system: automated_system || null,
      reason_category, reason_detail,
      legal_basis: legal_basis || null,
      tos_clause: tos_clause || null,
      geographic_scope: geographic_scope || 'global',
      source, source_reference_id: source_reference_id || null,
      appealable, appeal_deadline,
    }).select('id').single();

    // Notificar al usuario con Statement of Reasons completo
    const { createNotification } = await import('./inAppNotifController.js');
    const title = decision === 'restored' ? '✅ Tu contenido fue restaurado'
                : decision === 'removed' ? '🚫 Contenido removido'
                : decision === 'hidden'  ? '👁️ Contenido oculto'
                : decision === 'account_banned' ? '⛔ Cuenta suspendida permanentemente'
                : decision === 'account_suspended' ? '⏸️ Cuenta suspendida temporalmente'
                : '📋 Decisión de moderación';

    const methodLabel = decision_method === 'automated' ? 'sistema automatizado de moderación'
                      : decision_method === 'mixed'    ? 'sistema automatizado + revisión humana'
                      : 'revisor humano';

    const body = `Motivo: ${reason_detail}${tos_clause ? ` (${tos_clause})` : ''}. Decidido por ${methodLabel}.${appealable ? ' Tienes derecho a apelar esta decisión desde Configuración.' : ''}`;

    await createNotification(
      affected_user_id, 'moderation_decision', title, body,
      { decision_id: data?.id, appealable, content_type, content_id }
    ).catch(() => {});

    if (data?.id) {
      await supabase.from('moderation_decisions').update({
        user_notified_at: new Date().toISOString(),
        notification_method: 'in_app',
      }).eq('id', data.id);
    }

    return data?.id;
  } catch (err) {
    console.error('[logModerationDecision]', err.message);
    return null;
  }
}

// GET /api/moderation-decisions/mine — el usuario ve sus decisiones
export const listMyDecisions = async (req, res) => {
  try {
    const { data } = await supabase
      .from('moderation_decisions')
      .select('id, content_type, content_id, decision, decision_method, automated_system, reason_category, reason_detail, tos_clause, source, appealable, appeal_deadline, created_at')
      .eq('affected_user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    res.json({ decisions: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/admin/moderation-decisions
export const adminListDecisions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data } = await supabase
      .from('moderation_decisions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    res.json({ decisions: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
