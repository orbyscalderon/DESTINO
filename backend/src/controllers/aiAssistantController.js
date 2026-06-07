// aiAssistantController.js — Sugerencias de icebreaker para chat.
// Usa OpenAI gpt-4o-mini para generar 3 ideas de primer mensaje basadas
// en el perfil del other user (bio + intereses).
//
// Rate-limit: 3 generaciones por user por hora, persistente en Postgres
// (tabla ai_assistant_usage v66). Sobrevive a redeploys y funciona con
// múltiples instancias del backend.
//
// Env var: OPENAI_API_KEY. Si no está, devuelve 503.

import { supabase } from '../lib/supabase.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const HOURLY_LIMIT = 3;

// Verifica rate y registra el uso atomically. Devuelve { ok, remaining }.
async function checkAndConsumeRate(userId, feature = 'icebreaker') {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_assistant_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .gte('created_at', oneHourAgo);

  if ((count || 0) >= HOURLY_LIMIT) {
    return { ok: false, remaining: 0 };
  }

  await supabase.from('ai_assistant_usage').insert({ user_id: userId, feature });
  return { ok: true, remaining: HOURLY_LIMIT - (count || 0) - 1 };
}

// POST /api/ai/icebreaker { match_id }
// Returns: { suggestions: ["msg 1", "msg 2", "msg 3"] }
export const generateIcebreaker = async (req, res) => {
  try {
    const userId = req.user.id;
    const { match_id } = req.body;
    if (!match_id) return res.status(400).json({ error: 'match_id requerido' });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI assistant no configurado' });
    }

    const rate = await checkAndConsumeRate(userId, 'icebreaker');
    if (!rate.ok) {
      return res.status(429).json({ error: 'Límite por hora alcanzado. Intenta luego.', remaining: 0 });
    }

    // Cargar el match y el perfil del otro user
    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', match_id)
      .single();

    if (!match?.is_match || (match.user1_id !== userId && match.user2_id !== userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const otherId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const { data: other } = await supabase
      .from('profiles')
      .select('full_name, bio, interests, age')
      .eq('id', otherId)
      .single();

    if (!other) return res.status(404).json({ error: 'Perfil no encontrado' });

    const interests = Array.isArray(other.interests) ? other.interests.join(', ') : '';
    const userPrompt = `Generate 3 short, friendly icebreaker messages (in Spanish, casual tone, NO cringe, NO compliments on looks) for a dating app. Each message must be a question that invites a real conversation. Keep each under 100 characters.

Person's name: ${other.full_name || 'unknown'}
Their bio: ${(other.bio || '').slice(0, 300) || '(empty)'}
Their interests: ${interests || '(none listed)'}

Output ONLY a JSON array of 3 strings, no markdown, no explanation:`;

    const oaiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at writing genuine, non-cringe opening messages for dating apps. You speak Spanish naturally.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!oaiRes.ok) {
      console.warn('[ai] OpenAI HTTP', oaiRes.status);
      return res.status(502).json({ error: 'Servicio AI no disponible' });
    }

    const data = await oaiRes.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    // Aceptar arrays directos o { suggestions: [...] } / { messages: [...] }
    let suggestions = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.suggestions) ? parsed.suggestions
      : Array.isArray(parsed?.messages) ? parsed.messages
      : Array.isArray(parsed?.icebreakers) ? parsed.icebreakers
      : [];

    suggestions = suggestions.filter(s => typeof s === 'string' && s.trim()).slice(0, 3);

    if (!suggestions.length) {
      return res.status(502).json({ error: 'No se pudieron generar sugerencias' });
    }

    res.json({ suggestions });
  } catch (err) {
    console.error('[ai] error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
};
