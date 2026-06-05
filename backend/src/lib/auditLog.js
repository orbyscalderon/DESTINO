import { supabase } from './supabase.js';

// Helper para registrar acciones administrativas.
//
// Uso desde un controller admin:
//   await logAdmin(req, 'user.ban', { type: 'user', id: targetUserId }, { reason: 'spam' });
//
// Fire-and-forget — el error se loggea pero no se propaga para no romper la
// acción admin original. El audit log es complementario, no bloqueante.

export async function logAdmin(req, action, target = null, metadata = {}) {
  try {
    if (!req?.user?.id) return; // sin admin context no hay nada que loggear

    const row = {
      admin_id: req.user.id,
      admin_email: req.user.email || 'unknown',
      action,
      target_type: target?.type || null,
      target_id: target?.id || null,
      metadata: metadata || {},
      ip: req.ip || null,
      user_agent: req.headers?.['user-agent']?.slice(0, 500) || null,
    };

    // setImmediate evita bloquear la response del controller que llama
    setImmediate(async () => {
      try {
        await supabase.from('admin_audit_log').insert(row);
      } catch (err) {
        console.error('[audit log]', err?.message);
      }
    });
  } catch (err) {
    console.error('[audit log catch]', err?.message);
  }
}
