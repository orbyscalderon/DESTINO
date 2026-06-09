// creatorAutomationWorker.js — cron de v70/v71:
//   1) Auto-reply: si fan envió mensaje al creator y el creator está offline +
//      tiene auto_reply activado, se manda away_message una sola vez por hilo.
//   2) AI persona: si después de N min el creator no respondió + tiene persona
//      activada + cumple disclosure, se genera una respuesta IA y se envía.
//
// Activación: feature_flag_autoreply_workers + feature_flag_ai_persona_workers
// en compliance_config (default ambos en false, prender cuando esté testeado).
//
// Llamado desde cleanup.js cada 5 min.

import { supabase } from '../lib/supabase.js';

const AUTO_REPLY_LOOKBACK_MIN  = 15;   // ventana para detectar mensajes sin respuesta
const AI_PERSONA_MIN_REPLIES_PER_DAY_PER_FAN = 10; // safety override
const STALE_PRESENCE_MIN = 5; // creator se considera offline si su last_heartbeat > 5 min

let cachedFlags = null;
let cachedExpires = 0;

async function getFlags() {
  if (Date.now() < cachedExpires && cachedFlags) return cachedFlags;
  const { data } = await supabase
    .from('compliance_config')
    .select('key, value')
    .in('key', ['feature_flag_autoreply_workers', 'feature_flag_ai_persona_workers']);
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value === 'true']));
  cachedFlags = map;
  cachedExpires = Date.now() + 60 * 1000;
  return map;
}

async function isCreatorOffline(creatorId) {
  const { data } = await supabase
    .from('profiles')
    .select('last_heartbeat')
    .eq('id', creatorId)
    .maybeSingle();
  if (!data?.last_heartbeat) return true;
  const ageMs = Date.now() - new Date(data.last_heartbeat).getTime();
  return ageMs > STALE_PRESENCE_MIN * 60 * 1000;
}

async function shouldTriggerAutoReply(creatorRule) {
  if (!creatorRule.enabled) return false;
  const mode = creatorRule.trigger_mode || 'offline';
  if (mode === 'always') return true;
  if (mode === 'offline') return await isCreatorOffline(creatorRule.creator_id);
  if (mode === 'after_hours') {
    if (!creatorRule.business_hours_start || !creatorRule.business_hours_end) return false;
    const now = new Date();
    const hh = now.getUTCHours();
    const mm = now.getUTCMinutes();
    const cur = hh * 60 + mm;
    const [sh, sm] = creatorRule.business_hours_start.split(':').map(Number);
    const [eh, em] = creatorRule.business_hours_end.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start <= end) return cur < start || cur > end;
    return cur > end && cur < start;
  }
  return false;
}

export async function runAutoReplyTick() {
  const flags = await getFlags();
  if (!flags.feature_flag_autoreply_workers) return;

  const since = new Date(Date.now() - AUTO_REPLY_LOOKBACK_MIN * 60 * 1000).toISOString();

  // 1) Listar creators con auto_reply activado
  const { data: rules } = await supabase
    .from('creator_auto_replies')
    .select('*')
    .eq('enabled', true)
    .limit(200);

  for (const rule of rules || []) {
    if (!rule.away_message) continue;
    if (!await shouldTriggerAutoReply(rule)) continue;

    // 2) Buscar mensajes recientes hacia el creator que no tengan respuesta
    const { data: incomingMsgs } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, receiver_id, created_at')
      .eq('receiver_id', rule.creator_id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(50);

    for (const msg of incomingMsgs || []) {
      // ¿Ya hubo respuesta posterior del creator?
      const { data: reply } = await supabase
        .from('messages')
        .select('id')
        .eq('match_id', msg.match_id)
        .eq('sender_id', rule.creator_id)
        .gt('created_at', msg.created_at)
        .limit(1)
        .maybeSingle();
      if (reply) continue;

      // ¿Ya se mandó auto-reply en este match en últimas 12h? Dedup por match_id + flag
      const dedupSince = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: existingAuto } = await supabase
        .from('messages')
        .select('id')
        .eq('match_id', msg.match_id)
        .eq('sender_id', rule.creator_id)
        .eq('is_welcome', true)  // reusamos esta col como flag de "mensaje automatizado"
        .gte('created_at', dedupSince)
        .limit(1)
        .maybeSingle();
      if (existingAuto) continue;

      // Enviar away_message
      await supabase.from('messages').insert({
        match_id: msg.match_id,
        sender_id: rule.creator_id,
        receiver_id: msg.sender_id,
        type: 'text',
        content: rule.away_message,
        is_welcome: true,
      });
    }
  }
}

async function callOpenAIPersona({ persona, context }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const systemPrompt = `You are roleplaying as a content creator on a dating/creator platform. Stay in character.
Persona name: ${persona.persona_name || 'the creator'}
Tone: ${persona.tone || 'friendly, warm'}
Personality: ${persona.personality_prompt || 'casual, kind, uses emojis sparingly'}
NEVER discuss: ${(persona.banned_topics || []).join(', ') || 'sensitive topics'}
Keep reply under 200 chars. Respond ONLY in the language of the user's message.
DO NOT promise to do anything you can't deliver. DO NOT give personal info.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.85,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context.fan_message },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[ai persona OpenAI]', err.message);
    return null;
  }
}

export async function runAIPersonaTick() {
  const flags = await getFlags();
  if (!flags.feature_flag_ai_persona_workers) return;

  // 1) Listar personas activas
  const { data: personas } = await supabase
    .from('creator_ai_persona')
    .select('*')
    .eq('enabled', true)
    .limit(100);

  for (const persona of personas || []) {
    const triggerWindowMs = (persona.trigger_after_min || 30) * 60 * 1000;
    const windowStart = new Date(Date.now() - triggerWindowMs * 2).toISOString();
    const windowEnd = new Date(Date.now() - triggerWindowMs).toISOString();

    // Solo dispara si creator offline
    if (!await isCreatorOffline(persona.creator_id)) continue;

    // 2) Buscar mensajes en la ventana sin responder
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, content')
      .eq('receiver_id', persona.creator_id)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .eq('type', 'text')
      .limit(30);

    for (const msg of msgs || []) {
      // ¿Ya respondió el creator (humano o AI)?
      const { data: reply } = await supabase
        .from('messages')
        .select('id')
        .eq('match_id', msg.match_id)
        .eq('sender_id', persona.creator_id)
        .gt('created_at', windowEnd)
        .limit(1)
        .maybeSingle();
      if (reply) continue;

      // Rate limit por fan
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: aiRepliesToday } = await supabase
        .from('ai_persona_messages')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', persona.creator_id)
        .eq('fan_id', msg.sender_id)
        .gte('generated_at', dayAgo);
      const maxPerDay = Math.min(
        persona.max_replies_per_day_per_fan || 10,
        AI_PERSONA_MIN_REPLIES_PER_DAY_PER_FAN
      );
      if ((aiRepliesToday || 0) >= maxPerDay) continue;

      // Generar respuesta con OpenAI
      const reply_text = await callOpenAIPersona({
        persona,
        context: { fan_message: msg.content?.slice(0, 800) || '' },
      });
      if (!reply_text) continue;

      // EU AI Act: prefijo disclosure obligatorio
      const disclosure = persona.disclosure_text || '🤖 Asistente IA';
      const finalMessage = `${disclosure}\n\n${reply_text}`;

      const { data: newMsg } = await supabase.from('messages').insert({
        match_id: msg.match_id,
        sender_id: persona.creator_id,
        receiver_id: msg.sender_id,
        type: 'text',
        content: finalMessage,
        is_ai_persona: true,
      }).select('id').single();

      await supabase.from('ai_persona_messages').insert({
        creator_id: persona.creator_id,
        fan_id: msg.sender_id,
        message_id: newMsg?.id,
      });
    }
  }
}

export async function runCreatorAutomationTick() {
  await Promise.allSettled([
    runAutoReplyTick(),
    runAIPersonaTick(),
  ]);
}
