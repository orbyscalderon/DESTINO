import { supabase } from '../lib/supabase.js';
import crypto from 'crypto';

const COMMISSION_DURATION_MONTHS = 6;

function generateAffiliateCode() {
  // 8 chars alfanuméricos en mayúsculas — ej. "INFLU3R7"
  return crypto.randomBytes(6).toString('base64')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8) || crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ── User-facing ────────────────────────────────────────────────────────
// POST /api/affiliate/enroll — inscribirse en el programa
export const enrollAffiliate = async (req, res) => {
  try {
    const userId = req.user.id;

    // Si ya está inscrito devolver el existente
    const { data: existing } = await supabase
      .from('affiliate_programs')
      .select('*')
      .eq('affiliate_user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.json({ program: existing, already_enrolled: true });
    }

    // Generar code único — retry hasta 5 veces si hay colisión
    let code = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateAffiliateCode();
      const { data: dup } = await supabase
        .from('affiliate_programs')
        .select('id')
        .eq('affiliate_code', candidate)
        .maybeSingle();
      if (!dup) { code = candidate; break; }
    }
    if (!code) return res.status(500).json({ error: 'No se pudo generar código' });

    const { data, error } = await supabase
      .from('affiliate_programs')
      .insert({
        affiliate_user_id: userId,
        affiliate_code: code,
        status: 'active',
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ program: data, already_enrolled: false });
  } catch (err) {
    console.error('[enrollAffiliate]', err);
    res.status(500).json({ error: 'Error inscribiendo' });
  }
};

// GET /api/affiliate/my-program — datos del programa + stats
export const getMyAffiliate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: program } = await supabase
      .from('affiliate_programs')
      .select('*')
      .eq('affiliate_user_id', userId)
      .maybeSingle();
    if (!program) return res.json({ program: null });

    const [{ data: refs, count: refsCount }, { data: recent }] = await Promise.all([
      supabase
        .from('affiliate_referrals')
        .select('id, creator_user_id, signed_up_at, commission_expires_at, total_commission_usd, creator:profiles!creator_user_id(id, full_name, username, avatar_url, is_creator)', { count: 'estimated' })
        .eq('affiliate_id', program.id)
        .order('signed_up_at', { ascending: false })
        .limit(50),
      supabase
        .from('affiliate_commission_log')
        .select('source, gross_usd, commission_usd, created_at')
        .eq('affiliate_id', program.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    res.json({
      program,
      referrals: refs || [],
      referrals_count: refsCount || 0,
      recent_commissions: recent || [],
    });
  } catch (err) {
    console.error('[getMyAffiliate]', err);
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/affiliate/attribute  body: { code }
// Llamado durante el flujo "become creator" para atribuir el creator
// al affiliate. Solo se acepta UNA vez por creator.
export const attributeCreator = async (req, res) => {
  try {
    const userId = req.user.id;
    const code = (req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'code requerido' });

    // Check no doble-atribución
    const { data: existing } = await supabase
      .from('affiliate_referrals')
      .select('id')
      .eq('creator_user_id', userId)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ya atribuido a un affiliate' });

    const { data: program } = await supabase
      .from('affiliate_programs')
      .select('id, affiliate_user_id, status, commission_duration_months')
      .eq('affiliate_code', code)
      .eq('status', 'active')
      .maybeSingle();
    if (!program) return res.status(404).json({ error: 'Código no válido' });
    if (program.affiliate_user_id === userId) return res.status(400).json({ error: 'No puedes usar tu propio código' });

    const expires = new Date();
    expires.setMonth(expires.getMonth() + (program.commission_duration_months || COMMISSION_DURATION_MONTHS));

    const { error } = await supabase
      .from('affiliate_referrals')
      .insert({
        affiliate_id: program.id,
        creator_user_id: userId,
        commission_expires_at: expires.toISOString(),
      });
    if (error) throw error;

    res.json({ ok: true, expires_at: expires.toISOString() });
  } catch (err) {
    console.error('[attributeCreator]', err);
    res.status(500).json({ error: 'Error' });
  }
};

// ── Server-side: registrar comisión por una transacción ────────────────
// Llamado desde tip/gift/show/subscription/coin_purchase handlers cuando
// un creator gana algo. Si el creator está atribuido a un affiliate Y la
// comisión no expiró, se registra.
export async function recordAffiliateCommission(creatorUserId, source, sourceId, grossUsd) {
  try {
    if (!creatorUserId || !grossUsd || grossUsd <= 0) return;

    // Buscar referral activa
    const { data: ref } = await supabase
      .from('affiliate_referrals')
      .select('id, affiliate_id, commission_expires_at')
      .eq('creator_user_id', creatorUserId)
      .gt('commission_expires_at', new Date().toISOString())
      .maybeSingle();
    if (!ref) return;

    // Obtener commission_pct del programa
    const { data: program } = await supabase
      .from('affiliate_programs')
      .select('commission_pct, status')
      .eq('id', ref.affiliate_id)
      .single();
    if (!program || program.status !== 'active') return;

    const commission = +(grossUsd * (program.commission_pct / 100)).toFixed(2);
    if (commission <= 0) return;

    await supabase.from('affiliate_commission_log').insert({
      affiliate_id: ref.affiliate_id,
      referral_id: ref.id,
      creator_user_id: creatorUserId,
      source,
      source_id: sourceId,
      gross_usd: grossUsd,
      commission_usd: commission,
    });

    // Bumps totales (no atomic — para alta concurrencia usar RPC)
    await supabase.rpc('increment_affiliate_earnings', {
      p_affiliate_id: ref.affiliate_id,
      p_referral_id: ref.id,
      p_amount_usd: commission,
    }).then(() => {}, () => {
      // Fallback si la RPC no existe: update manual
      supabase.from('affiliate_programs')
        .update({ total_earned_usd: program.total_earned_usd + commission })
        .eq('id', ref.affiliate_id);
    });
  } catch (err) {
    console.error('[recordAffiliateCommission]', err?.message);
  }
}
