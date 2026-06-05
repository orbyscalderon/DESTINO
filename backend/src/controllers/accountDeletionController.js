import { supabase } from '../lib/supabase.js';

const GRACE_DAYS = 30;

// POST /api/account-deletion  body: { reason? }
// El user solicita borrar su cuenta. Se programa la deletion para NOW()+30d.
// Si ya tiene una pendiente, devuelve esa.
export const requestDeletion = async (req, res) => {
  try {
    const userId = req.user.id;

    // Si ya hay una pendiente, devolverla
    const { data: existing } = await supabase
      .from('account_deletion_requests')
      .select('id, scheduled_for, requested_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return res.json({ request: existing, already_pending: true });
    }

    const scheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000).toISOString();

    const { data: newReq, error } = await supabase
      .from('account_deletion_requests')
      .insert({
        user_id: userId,
        status: 'pending',
        reason: req.body?.reason?.slice(0, 500) || null,
        scheduled_for: scheduledFor,
        ip: req.ip || null,
        user_agent: req.headers?.['user-agent']?.slice(0, 500) || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ request: newReq, already_pending: false });
  } catch (err) {
    console.error('[requestDeletion]', err);
    res.status(500).json({ error: 'Error solicitando eliminación' });
  }
};

// GET /api/account-deletion  → estado actual de la petición del user
export const getDeletionStatus = async (req, res) => {
  try {
    const { data } = await supabase
      .from('account_deletion_requests')
      .select('id, status, requested_at, scheduled_for, cancelled_at, completed_at')
      .eq('user_id', req.user.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    res.json({ request: data || null });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// DELETE /api/account-deletion  → cancelar el request pendiente
export const cancelDeletion = async (req, res) => {
  try {
    const { error } = await supabase
      .from('account_deletion_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .eq('status', 'pending');
    if (error) throw error;
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error cancelando' });
  }
};

// GET /api/account-deletion/export  → JSON con todos los datos del user
// Cumple "right to data portability" GDPR.
export const exportUserData = async (req, res) => {
  try {
    const userId = req.user.id;

    const [profile, matches, msgs, posts, reels, stories, tx, subs, withdrawals] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('matches').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
      supabase.from('messages').select('*').eq('sender_id', userId).limit(1000),
      supabase.from('posts').select('*').eq('user_id', userId).limit(1000),
      supabase.from('reels').select('*').eq('user_id', userId).limit(1000),
      supabase.from('stories').select('*').eq('user_id', userId).limit(1000),
      supabase.from('coin_transactions').select('*').eq('user_id', userId).limit(2000),
      supabase.from('user_subscriptions').select('*').eq('subscriber_id', userId).limit(1000),
      supabase.from('withdrawal_requests').select('*').eq('creator_id', userId).limit(1000),
    ]);

    const out = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      profile: profile.data || null,
      matches: matches.data || [],
      messages_sent: msgs.data || [],
      posts: posts.data || [],
      reels: reels.data || [],
      stories: stories.data || [],
      coin_transactions: tx.data || [],
      subscriptions: subs.data || [],
      withdrawals: withdrawals.data || [],
    };

    const filename = `destino_data_${userId}_${new Date().toISOString().slice(0, 10)}.json`;
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('[exportUserData]', err);
    res.status(500).json({ error: 'Error exportando datos' });
  }
};

// ── Cron job: ejecutar deletions vencidas ──────────────────────────────
// Llamado desde lib/cleanup.js. NO es un endpoint HTTP.
export async function processDueDeletions() {
  try {
    const { data: due } = await supabase
      .from('account_deletion_requests')
      .select('id, user_id')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (!due?.length) return { processed: 0 };

    let ok = 0, failed = 0;
    for (const req of due) {
      try {
        await supabase.auth.admin.deleteUser(req.user_id);
        await supabase
          .from('account_deletion_requests')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', req.id);
        ok++;
      } catch (err) {
        await supabase
          .from('account_deletion_requests')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            failure_reason: err?.message?.slice(0, 500),
          })
          .eq('id', req.id);
        failed++;
      }
    }
    console.log(`[deletion cron] processed ok=${ok} failed=${failed}`);
    return { processed: ok, failed };
  } catch (err) {
    console.error('[processDueDeletions]', err);
    return { processed: 0, failed: 0 };
  }
}
