import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Aceptar ambos nombres por compatibilidad: algunos deploys usan
// SUPABASE_SERVICE_KEY, otros SUPABASE_SERVICE_ROLE_KEY (el oficial).
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
                 || process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.SUPABASE_URL;

if (!URL || !SERVICE_KEY) {
  console.error('\n❌  SUPABASE_URL o SUPABASE_SERVICE_KEY no están configuradas.');
  console.error('    → En Railway: ve al servicio → Variables → añade las vars del .env.example');
  console.error('    → En local:   asegúrate de tener backend/.env con los valores correctos\n');
  // NO process.exit — antes mataba el proceso y Railway healthcheck fallaba.
  // El cliente se crea con strings vacíos y las queries fallarán explícitamente.
}

// Cliente con service key — bypassa RLS para operaciones del servidor
export const supabase = createClient(
  URL || 'https://invalid.supabase.co',
  SERVICE_KEY || 'invalid-key'
);

/**
 * Envía un evento broadcast a un canal de Supabase Realtime.
 * Útil para garantizar entrega cuando el cliente no puede hacerlo
 * confiablemente (regalos, tips, etc).
 */
export async function broadcastToChannel(channelName, event, payload) {
  try {
    const ch = supabase.channel(channelName);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 3000);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(status));
        }
      });
    });
    await ch.send({ type: 'broadcast', event, payload });
    await supabase.removeChannel(ch);
  } catch (err) {
    console.warn(`broadcastToChannel(${channelName}, ${event}) failed:`, err.message);
  }
}
