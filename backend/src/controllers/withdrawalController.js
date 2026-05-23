import { supabase } from '../lib/supabase.js';

const MIN_WITHDRAWAL = 10; // USD mínimo

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
        payout_details: payout_details.trim(),
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ request });
  } catch {
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
    res.json({ withdrawals: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
