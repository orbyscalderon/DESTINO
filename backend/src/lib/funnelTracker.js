import { supabase } from './supabase.js';

// Tracker de eventos de funnel — fire-and-forget.
// Idempotente: si ya existe la fila para (user_id, event), no la duplica
// (insert con ON CONFLICT DO NOTHING).
//
// Uso desde un controller:
//   trackFunnel(userId, 'first_match', { match_id });
//
// No bloquea la response. Ignora errores silenciosamente porque el funnel
// nunca debe romper la acción principal.

const VALID_EVENTS = new Set([
  'signup_started',
  'signup_completed',
  'onboarding_started',
  'onboarding_step',
  'onboarding_completed',
  'first_like',
  'first_match',
  'first_message',
  'first_purchase',
  'first_tip',
  'first_subscription',
  'became_creator',
  'first_live_show',
]);

export function trackFunnel(userId, event, metadata = {}) {
  if (!userId || !VALID_EVENTS.has(event)) return;

  setImmediate(async () => {
    try {
      // Upsert con ignoreDuplicates — la primera ocurrencia gana
      await supabase
        .from('funnel_events')
        .upsert(
          { user_id: userId, event, metadata },
          { onConflict: 'user_id,event', ignoreDuplicates: true }
        );
    } catch (err) {
      console.error('[funnel]', event, err?.message);
    }
  });
}
