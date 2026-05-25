import { supabase } from '../lib/supabase.js';

// POST /api/translate
export const translate = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles').select('premium_tier').eq('id', userId).single();
      const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
      if (!isPremium) {
        return res.status(403).json({ error: 'La traducción automática requiere Plan Premium o VIP', code: 'PREMIUM_REQUIRED' });
      }
    }

    const { text, from, to } = req.body;
    if (!text || !to) return res.status(400).json({ error: 'text y to son requeridos' });
    if (text.length > 500) return res.status(400).json({ error: 'Texto demasiado largo (máx 500 chars)' });

    const langpair = from ? `${from}|${to}` : `autodetect|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Destino/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return res.status(502).json({ error: 'Servicio de traducción no disponible' });

    const data = await response.json();

    if (data.responseStatus !== 200) {
      return res.status(502).json({ error: 'Error en servicio de traducción' });
    }

    res.json({ translated: data.responseData.translatedText });
  } catch (err) {
    res.status(500).json({ error: 'Error al traducir' });
  }
};
