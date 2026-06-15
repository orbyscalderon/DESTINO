// Log de acciones sensibles — fire-and-forget, no bloquea la response.
import { supabase } from './supabase.js';

export async function logAudit({ actor_type, actor_id, action, target_type, target_id,
                                  before_state, after_state, ip, ua }) {
  try {
    await supabase.from('encuentros_audit_log').insert({
      actor_type, actor_id, action, target_type, target_id,
      before_state, after_state, ip, ua,
    });
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}
