import { supabase } from '../lib/supabase.js';

// ═══════ AUTO-REPLY + QUICK REPLIES ═══════════════════════════════════════════
export const getMyAutoReply = async (req, res) => {
  try {
    const { data } = await supabase.from('creator_auto_replies')
      .select('*').eq('creator_id', req.user.id).maybeSingle();
    res.json({ autoReply: data || null });
  } catch { res.status(500).json({ error: 'Error' }); }
};

export const upsertMyAutoReply = async (req, res) => {
  try {
    const { enabled, away_message, trigger_mode, business_hours_start, business_hours_end, business_hours_tz } = req.body;
    const { data, error } = await supabase.from('creator_auto_replies').upsert({
      creator_id: req.user.id,
      enabled: !!enabled,
      away_message: away_message?.slice(0, 1000) || null,
      trigger_mode: trigger_mode || 'offline',
      business_hours_start: business_hours_start || null,
      business_hours_end: business_hours_end || null,
      business_hours_tz: business_hours_tz || 'America/Santo_Domingo',
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    res.json({ autoReply: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const listQuickReplies = async (req, res) => {
  try {
    const { data } = await supabase.from('creator_quick_replies')
      .select('*').eq('creator_id', req.user.id).order('uses_count', { ascending: false });
    res.json({ replies: data || [] });
  } catch { res.status(500).json({ error: 'Error' }); }
};

export const createQuickReply = async (req, res) => {
  try {
    const { shortcut, message } = req.body;
    if (!shortcut?.trim() || !message?.trim()) return res.status(400).json({ error: 'shortcut y message requeridos' });
    const { data, error } = await supabase.from('creator_quick_replies').insert({
      creator_id: req.user.id,
      shortcut: shortcut.trim().slice(0, 50),
      message: message.trim().slice(0, 2000),
    }).select().single();
    if (error) throw error;
    res.status(201).json({ reply: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteQuickReply = async (req, res) => {
  try {
    await supabase.from('creator_quick_replies').delete()
      .eq('id', req.params.id).eq('creator_id', req.user.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══════ AI PERSONA ══════════════════════════════════════════════════════════
export const getMyPersona = async (req, res) => {
  try {
    const { data } = await supabase.from('creator_ai_persona')
      .select('*').eq('creator_id', req.user.id).maybeSingle();
    res.json({ persona: data || null });
  } catch { res.status(500).json({ error: 'Error' }); }
};

export const upsertMyPersona = async (req, res) => {
  try {
    const {
      enabled, persona_name, tone, personality_prompt,
      banned_topics, trigger_after_min, max_replies_per_day_per_fan, disclosure_text,
    } = req.body;

    const { data, error } = await supabase.from('creator_ai_persona').upsert({
      creator_id: req.user.id,
      enabled: !!enabled,
      persona_name: persona_name?.slice(0, 100) || null,
      tone: tone?.slice(0, 100) || null,
      personality_prompt: personality_prompt?.slice(0, 4000) || null,
      banned_topics: Array.isArray(banned_topics) ? banned_topics : [],
      trigger_after_min: parseInt(trigger_after_min) || 30,
      max_replies_per_day_per_fan: parseInt(max_replies_per_day_per_fan) || 10,
      disclosure_text: disclosure_text?.slice(0, 500) || undefined,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    res.json({ persona: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ═══════ FAN STATS / LOYALTY ═════════════════════════════════════════════════
export const getMyTopFans = async (req, res) => {
  try {
    const { data } = await supabase
      .from('fan_stats')
      .select('fan_id, total_spent_coins, tips_count, ppv_purchases, subscription_months, badges, profiles!fan_id(full_name, username, avatar_url)')
      .eq('creator_id', req.user.id)
      .order('total_spent_coins', { ascending: false })
      .limit(50);
    res.json({ fans: data || [] });
  } catch { res.status(500).json({ error: 'Error' }); }
};

export const getMyFanStatsWith = async (req, res) => {
  try {
    const { data } = await supabase
      .from('fan_stats').select('*')
      .eq('fan_id', req.user.id).eq('creator_id', req.params.creatorId).maybeSingle();
    res.json({ stats: data || null });
  } catch { res.status(500).json({ error: 'Error' }); }
};

// Helper interno — actualizar fan_stats al gastar coins. Llamar desde tip/PPV/sub.
// Usa RPC atómica increment_fan_stats (v71). Si la RPC no existe, fallback al
// upsert no-atómico que tenía antes.
export async function incrementFanStats({ fanId, creatorId, coins, kind }) {
  if (!fanId || !creatorId || fanId === creatorId) return;
  try {
    const { error } = await supabase.rpc('increment_fan_stats', {
      p_fan_id: fanId, p_creator_id: creatorId,
      p_coins: parseInt(coins) || 0, p_kind: kind,
    });
    if (error) throw error;
  } catch (err) {
    // Fallback no-atómico si la RPC todavía no se aplicó
    console.warn('[incrementFanStats] RPC failed, falling back:', err.message);
    try {
      const { data: existing } = await supabase.from('fan_stats')
        .select('*').eq('fan_id', fanId).eq('creator_id', creatorId).maybeSingle();
      const patch = {
        fan_id: fanId, creator_id: creatorId,
        total_spent_coins: (existing?.total_spent_coins || 0) + coins,
        tips_count: (existing?.tips_count || 0) + (kind === 'tip' ? 1 : 0),
        ppv_purchases: (existing?.ppv_purchases || 0) + (kind === 'ppv' ? 1 : 0),
        subscription_months: (existing?.subscription_months || 0) + (kind === 'sub' ? 1 : 0),
        last_interaction_at: new Date().toISOString(),
      };
      const newBadges = new Set(existing?.badges || []);
      if (patch.total_spent_coins >= 100)   newBadges.add('bronze_supporter');
      if (patch.total_spent_coins >= 1000)  newBadges.add('silver_supporter');
      if (patch.total_spent_coins >= 10000) newBadges.add('gold_supporter');
      if (patch.total_spent_coins >= 50000) newBadges.add('diamond_supporter');
      if (patch.subscription_months >= 6)   newBadges.add('loyal_6m');
      if (patch.subscription_months >= 12)  newBadges.add('anniversary_1y');
      patch.badges = Array.from(newBadges);
      await supabase.from('fan_stats').upsert(patch, { onConflict: 'fan_id,creator_id' });
    } catch (err2) {
      console.error('[incrementFanStats fallback]', err2.message);
    }
  }
}

// ═══════ SPY MODE / SKIP QUEUE ═══════════════════════════════════════════════
export const enableSpyMode = async (req, res) => {
  try {
    const { showId } = req.params;
    const { enabled, price_coins } = req.body;
    const { data: show } = await supabase.from('live_shows')
      .select('host_id').eq('id', showId).single();
    if (show?.host_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('live_shows').update({
      spy_mode_enabled: !!enabled,
      spy_mode_price_coins: parseInt(price_coins) || null,
    }).eq('id', showId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const startSpySession = async (req, res) => {
  try {
    const { showId } = req.params;
    const viewerId = req.user.id;

    const { data: show } = await supabase.from('live_shows')
      .select('spy_mode_enabled, spy_mode_price_coins, private_session').eq('id', showId).maybeSingle();
    if (!show?.spy_mode_enabled) return res.status(400).json({ error: 'Spy mode no activo' });
    if (!show.private_session) return res.status(400).json({ error: 'No hay private session activa' });

    const price = show.spy_mode_price_coins || 0;
    const { data: bal } = await supabase.from('profiles').select('coins_balance').eq('id', viewerId).single();
    if (!bal || bal.coins_balance < price) return res.status(402).json({ error: 'Coins insuficientes' });

    await supabase.from('profiles').update({ coins_balance: bal.coins_balance - price }).eq('id', viewerId);
    const { data: ses } = await supabase.from('show_spy_sessions').insert({
      show_id: showId, viewer_id: viewerId, price_paid: price,
    }).select('id').single();

    res.status(201).json({ session_id: ses?.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const payToSkipQueue = async (req, res) => {
  try {
    const { showId } = req.params;
    const { skip_price } = req.body;
    const viewerId = req.user.id;
    const price = parseInt(skip_price) || 0;
    if (price <= 0) return res.status(400).json({ error: 'skip_price inválido' });

    const { data: bal } = await supabase.from('profiles').select('coins_balance').eq('id', viewerId).single();
    if (!bal || bal.coins_balance < price) return res.status(402).json({ error: 'Coins insuficientes' });

    await supabase.from('profiles').update({ coins_balance: bal.coins_balance - price }).eq('id', viewerId);
    const { data: skip } = await supabase.from('show_queue_skips').insert({
      show_id: showId, viewer_id: viewerId, skip_price: price,
    }).select('id').single();

    res.status(201).json({ skip_id: skip?.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
