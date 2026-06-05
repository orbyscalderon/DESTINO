import { supabase } from '../lib/supabase.js';
import { encryptField, decryptField } from '../lib/encrypt.js';

const MIN_WITHDRAWAL = 10; // USD mínimo

// Umbral IRS para 1099/W-9/W-8BEN. Por encima de este total acumulado anual
// (incluyendo el retiro pendiente) requerimos un tax form firmado.
// $600 es el threshold actual para 1099-NEC; 1099-K subió a $5000 pero
// mantenemos el menor para ser conservador.
const TAX_FORM_THRESHOLD_USD = 600;

// GET /api/withdrawals/earnings — balance disponible del creador
export const getEarnings = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_earnings')
      .select('total_earned, available_balance, updated_at')
      .eq('creator_id', req.user.id)
      .maybeSingle();

    res.json({
      total_earned:       parseFloat(data?.total_earned || 0),
      available_balance:  parseFloat(data?.available_balance || 0),
      last_updated:       data?.updated_at || null,
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/withdrawals — solicitar retiro
export const requestWithdrawal = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { amount: rawAmount, payout_method = 'bank', payout_details } = req.body;

    const amount = parseFloat(rawAmount);
    if (!amount || amount < MIN_WITHDRAWAL) {
      return res.status(400).json({ error: `El mínimo de retiro es $${MIN_WITHDRAWAL}` });
    }

    const normalizedMethod = payout_method === 'bank_transfer' ? 'bank' : payout_method;
    if (!['bank', 'paypal', 'crypto'].includes(normalizedMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    if (!payout_details?.trim()) {
      return res.status(400).json({ error: 'Los datos de pago son obligatorios' });
    }

    // Verificar que no haya una solicitud pendiente
    const { data: pending } = await supabase
      .from('withdrawal_requests')
      .select('id')
      .eq('creator_id', creatorId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pending) {
      return res.status(400).json({ error: 'Ya tienes una solicitud de retiro pendiente' });
    }

    // ── Verificación de tax form si supera el umbral IRS ─────────────
    // Suma de payouts del año + el retiro actual. Si pasa el threshold,
    // requiere W-9 (US) o W-8BEN (foreign) firmado y no expirado.
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data: yearPayouts } = await supabase
      .from('withdrawal_requests')
      .select('amount_usd')
      .eq('creator_id', creatorId)
      .in('status', ['paid', 'pending'])
      .gte('created_at', yearStart);

    const yearTotal = (yearPayouts || []).reduce(
      (sum, r) => sum + parseFloat(r.amount_usd || 0), 0
    );

    if (yearTotal + amount >= TAX_FORM_THRESHOLD_USD) {
      const { data: hasForm } = await supabase.rpc('has_valid_tax_form', { p_user_id: creatorId });
      if (!hasForm) {
        return res.status(400).json({
          error: `Para retirar superando $${TAX_FORM_THRESHOLD_USD} acumulados al año necesitas firmar W-9 (US) o W-8BEN (otro país). Ve a Pagos → Tax forms.`,
          code: 'TAX_FORM_REQUIRED',
          year_total: yearTotal,
          threshold: TAX_FORM_THRESHOLD_USD,
        });
      }
    }

    // Descontar del balance disponible de forma atómica (previene race condition)
    const { data: deducted, error: deductError } = await supabase
      .rpc('deduct_creator_balance', { p_creator_id: creatorId, p_amount: amount });

    if (deductError) throw deductError;
    if (!deducted) {
      const { data: earnings } = await supabase
        .from('creator_earnings').select('available_balance').eq('creator_id', creatorId).maybeSingle();
      const balance = parseFloat(earnings?.available_balance || 0);
      return res.status(400).json({ error: `Saldo insuficiente. Disponible: $${balance.toFixed(2)}` });
    }

    const { data: request, error } = await supabase
      .from('withdrawal_requests')
      .insert({
        creator_id: creatorId,
        amount_usd: amount,
        payout_method: normalizedMethod,
        payout_details: encryptField(payout_details.trim()),
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Devolver con datos descifrados para la respuesta inmediata
    res.status(201).json({
      request: { ...request, payout_details: decryptField(request.payout_details) },
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/withdrawals/auto-payout — estado del auto-payout del creador
export const getAutoPayoutSettings = async (req, res) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('auto_payout_enabled, auto_payout_min_usd, stripe_account_id, stripe_account_status, last_auto_payout_at')
      .eq('id', req.user.id)
      .single();

    res.json({
      enabled:           !!data?.auto_payout_enabled,
      min_usd:           parseFloat(data?.auto_payout_min_usd || 50),
      stripe_connected:  !!data?.stripe_account_id && data?.stripe_account_status === 'active',
      last_payout_at:    data?.last_auto_payout_at || null,
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/withdrawals/auto-payout
// Body: { enabled: boolean, min_usd?: number }
export const updateAutoPayoutSettings = async (req, res) => {
  try {
    const { enabled, min_usd } = req.body;

    if (enabled) {
      // Verificar Stripe Connect activo antes de permitir
      const { data: prof } = await supabase
        .from('profiles')
        .select('stripe_account_id, stripe_account_status')
        .eq('id', req.user.id)
        .single();

      if (!prof?.stripe_account_id || prof.stripe_account_status !== 'active') {
        return res.status(400).json({
          error: 'Necesitas tener Stripe Connect activo para usar pagos automáticos.',
          code: 'STRIPE_CONNECT_REQUIRED',
        });
      }
    }

    const minUsd = parseFloat(min_usd);
    const update = { auto_payout_enabled: !!enabled };
    if (!isNaN(minUsd) && minUsd >= 10 && minUsd <= 10000) {
      update.auto_payout_min_usd = minUsd;
    }

    await supabase.from('profiles').update(update).eq('id', req.user.id);
    res.json({ success: true, ...update });
  } catch (err) {
    console.error('updateAutoPayoutSettings error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/withdrawals — historial de solicitudes del creador
export const getMyWithdrawals = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withdrawals = (data || []).map(w => ({
      ...w,
      payout_details: decryptField(w.payout_details),
    }));

    res.json({ withdrawals });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
