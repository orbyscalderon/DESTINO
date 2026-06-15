import { createClient } from '@supabase/supabase-js';

if (!process.env.ENCUENTROS_SUPABASE_URL || !process.env.ENCUENTROS_SUPABASE_SERVICE_KEY) {
  console.warn('⚠  ENCUENTROS_SUPABASE_URL/SERVICE_KEY no seteados — corriendo en modo degradado.');
}

export const supabase = createClient(
  process.env.ENCUENTROS_SUPABASE_URL || 'http://localhost:54321',
  process.env.ENCUENTROS_SUPABASE_SERVICE_KEY || 'invalid',
  { auth: { persistSession: false, autoRefreshToken: false } },
);
