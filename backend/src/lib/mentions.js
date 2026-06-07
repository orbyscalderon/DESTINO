// mentions.js — Parser de @username y mapeo a user IDs.
// Extrae todos los @username del texto, valida que existen, devuelve
// pares { username, user_id } para insertar en message_mentions o
// reel_comment_mentions.

import { supabase } from './supabase.js';

const MENTION_RE = /@([a-z0-9_]{3,20})/gi;

// Extrae usernames únicos del texto
export function extractMentionUsernames(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) {
    seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

// Resuelve usernames → user_ids (filtra los que no existen)
export async function resolveMentions(usernames) {
  if (!usernames?.length) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames);
  return (data || []).map(p => ({ user_id: p.id, username: p.username }));
}

// Helper combinado para mensajes de chat
export async function insertMessageMentions(messageId, text, byUserId) {
  const usernames = extractMentionUsernames(text);
  if (!usernames.length) return [];
  const resolved = await resolveMentions(usernames);
  if (!resolved.length) return [];

  const rows = resolved
    .filter(r => r.user_id !== byUserId) // no self-mentions
    .map(r => ({
      message_id: messageId,
      mentioned_id: r.user_id,
      mentioned_by: byUserId,
    }));

  if (!rows.length) return [];

  // ignore conflict — el mismo user mencionado 2 veces en el mismo msg no duplica
  await supabase.from('message_mentions').upsert(rows, { onConflict: 'message_id,mentioned_id' });
  return resolved;
}

// Para reel_comment_mentions
export async function insertReelCommentMentions(commentId, text, byUserId) {
  const usernames = extractMentionUsernames(text);
  if (!usernames.length) return [];
  const resolved = await resolveMentions(usernames);
  if (!resolved.length) return [];

  const rows = resolved
    .filter(r => r.user_id !== byUserId)
    .map(r => ({
      comment_id: commentId,
      mentioned_id: r.user_id,
      mentioned_by: byUserId,
    }));

  if (!rows.length) return [];
  await supabase.from('reel_comment_mentions').upsert(rows, { onConflict: 'comment_id,mentioned_id' });
  return resolved;
}
