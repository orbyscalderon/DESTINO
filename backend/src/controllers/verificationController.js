import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';

// GET /api/verification/status
export const getStatus = async (req, res) => {
  try {
    const { data } = await supabase
      .from('identity_verifications')
      .select('status, notes, submitted_at, reviewed_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    res.json({ verification: data || null });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/verification/start — crea sesión de Stripe Identity (solo Premium)
export const startVerification = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier, is_verified')
      .eq('id', userId)
      .single();

    if (!profile?.premium_tier || profile.premium_tier === 'basic') {
      return res.status(403).json({ error: 'La verificación de identidad es exclusiva para usuarios Premium', code: 'PREMIUM_REQUIRED' });
    }

    const { data: existing } = await supabase
      .from('identity_verifications')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.status === 'approved') {
      return res.status(400).json({ error: 'Tu identidad ya está verificada' });
    }

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: { document: { allowed_types: ['driving_license', 'id_card', 'passport'], require_id_number: false } },
      metadata: { user_id: userId },
      return_url: `${process.env.FRONTEND_URL}/#/profile?verification=complete`,
    });

    await supabase
      .from('identity_verifications')
      .upsert(
        { user_id: userId, stripe_session_id: session.id, status: 'pending', submitted_at: new Date().toISOString(), reviewed_at: null, notes: null },
        { onConflict: 'user_id' }
      );

    res.json({ url: session.url });
  } catch (err) {
    console.error('startVerification error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/verification/check — consulta el resultado de la sesión de Stripe
export const checkVerification = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const userId = req.user.id;

    const { data: record } = await supabase
      .from('identity_verifications')
      .select('stripe_session_id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (!record?.stripe_session_id) return res.json({ status: 'none' });
    if (record.status === 'approved') return res.json({ status: 'approved' });

    const session = await stripe.identity.verificationSessions.retrieve(record.stripe_session_id);

    let newStatus = record.status;

    if (session.status === 'verified') {
      newStatus = 'approved';
      await supabase.from('profiles').update({ is_verified: true }).eq('id', userId);
    } else if (session.status === 'requires_input' && session.last_error?.code) {
      newStatus = 'rejected';
    }

    if (newStatus !== record.status) {
      await supabase
        .from('identity_verifications')
        .update({ status: newStatus, reviewed_at: new Date().toISOString() })
        .eq('user_id', userId);

      // Email cuando el estado cambia (approved / rejected). Pasa al notifier
      // que ya valida prefs y obtiene email. Fire-and-forget.
      if (newStatus === 'approved' || newStatus === 'rejected') {
        import('../lib/emailNotifier.js').then(({ notifyUser }) =>
          notifyUser(userId, 'identity', {
            approved: newStatus === 'approved',
            reason: session.last_error?.reason || session.last_error?.code || null,
          }).catch(() => {})
        );
      }
    }

    res.json({ status: newStatus, stripe_status: session.status });
  } catch (err) {
    console.error('checkVerification error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
