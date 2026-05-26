import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('\n❌  SUPABASE_URL o SUPABASE_SERVICE_KEY no están configuradas.');
  console.error('    → En Railway: ve al servicio → Variables → añade las vars del .env.example');
  console.error('    → En local:   asegúrate de tener backend/.env con los valores correctos\n');
  process.exit(1);
}

// Cliente con service key — bypassa RLS para operaciones del servidor
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
