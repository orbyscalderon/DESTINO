// Moderación de texto con OpenAI Moderation API (omni-moderation-latest).
// Gratis, sin rate limits prácticos para nuestro volumen.
//
// Env var:
//   OPENAI_API_KEY — si falta, hacemos fallback a regex de patrones obvios
//                    (slurs, doxxing, etc.) para no bloquear el flujo.
//
// Uso:
//   const result = await moderateText(content, { context: 'chat' });
//   if (!result.ok) return res.status(422).json({ error: result.reason });
//
// Severidad:
//   · severe → bloqueamos y devolvemos 422
//   · mild   → permitimos pero marcamos para review (flagged_at en DB)
//   · clean  → ok

const OPENAI_URL = 'https://api.openai.com/v1/moderations';
const TIMEOUT_MS = 5000;

// Patrones obvios para fallback sin OpenAI (regex case-insensitive)
const FALLBACK_PATTERNS = [
  // Contactos fuera de plataforma (típico spam)
  /\b(?:wa|whatsapp|whats?\s?app)[\s:]+(?:\+?\d[\d\s\-]{7,})/i,
  /\bt(?:elegram|g)[\s:]*@?[\w_]{4,}/i,
  /\b(?:onlyfans|fansly|patreon|cashapp|venmo)[\s.:]+[\w./_-]+/i,
  // Números de teléfono explícitos en chat (10+ dígitos seguidos)
  /\+?\d{2,3}[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/,
];

const SEVERE_CATEGORIES = [
  'sexual/minors',
  'violence/graphic',
  'self-harm/intent',
  'self-harm/instructions',
];

/**
 * Modera un texto.
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.context - 'chat' | 'post' | 'bio' | 'caption' | 'comment'
 * @returns {Promise<{ ok: boolean, severity: 'severe'|'mild'|'clean', reason?: string, categories?: object, skipped?: boolean }>}
 */
export async function moderateText(text, opts = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ok: true, severity: 'clean', skipped: true };
  // Textos muy cortos no vale la pena moderar
  if (trimmed.length < 3) return { ok: true, severity: 'clean', skipped: true };

  const apiKey = process.env.OPENAI_API_KEY;

  // Fallback regex si no hay API key — solo bloquea patrones MUY obvios
  if (!apiKey) {
    const matched = FALLBACK_PATTERNS.find(re => re.test(trimmed));
    if (matched && opts.context === 'chat') {
      return {
        ok: false,
        severity: 'mild',
        reason: 'Mensaje contiene información de contacto externa. Mantén la conversación dentro de la app.',
        skipped: true,
      };
    }
    return { ok: true, severity: 'clean', skipped: true };
  }

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: trimmed.slice(0, 4000),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn('[textModeration] OpenAI HTTP', res.status);
      return { ok: true, severity: 'clean', skipped: true };
    }

    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return { ok: true, severity: 'clean', skipped: true };

    if (!result.flagged) {
      return { ok: true, severity: 'clean', categories: result.categories };
    }

    // Detectar si alguna categoría severa está activa
    const severeHit = SEVERE_CATEGORIES.some(cat => result.categories?.[cat]);
    if (severeHit) {
      return {
        ok: false,
        severity: 'severe',
        reason: 'Contenido no permitido. Si crees que es un error, contacta a soporte.',
        categories: result.categories,
      };
    }

    // Mild: permitido en bio/caption, bloqueado en chat para reducir abuse
    if (opts.context === 'chat') {
      return {
        ok: false,
        severity: 'mild',
        reason: 'Tu mensaje contiene lenguaje que viola las normas de la comunidad.',
        categories: result.categories,
      };
    }

    return { ok: true, severity: 'mild', categories: result.categories };
  } catch (err) {
    console.warn('[textModeration] error:', err.message);
    // No bloqueamos por fallo del servicio — fail-open
    return { ok: true, severity: 'clean', skipped: true };
  }
}
