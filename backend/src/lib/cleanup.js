import { supabase } from './supabase.js';

const STALE_SESSION_MINUTES = 5;
const CLEANUP_INTERVAL_MS = 30 * 1000;

async function cleanStaleVideoSessions() {
  const cutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('video_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('status', 'waiting')
    .lt('started_at', cutoff);

  if (error) console.error('Cleanup video sessions error:', error.message);
}

export function startCleanupJob() {
  cleanStaleVideoSessions();
  setInterval(cleanStaleVideoSessions, CLEANUP_INTERVAL_MS);
  console.log('🧹 Cleanup job iniciado (sesiones de video cada 30s)');
}
