import { supabase, broadcastToChannel } from '../lib/supabase.js';
import { safeErrorMessage } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

// Helper para broadcast a viewers de un battle
function broadcastBattleEvent(battleId, event, payload) {
  broadcastToChannel(`battle:${battleId}`, event, payload).catch(() => {});
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/battles/invite — host1 invita a host2 a un battle
// Body: { opponent_id, duration_minutes? (1-30, default 5) }
// ════════════════════════════════════════════════════════════════════════════
export const inviteBattle = async (req, res) => {
  try {
    const hostId = req.user.id;
    const { opponent_id: opponentId, duration_minutes } = req.body || {};
    const duration = Math.min(30, Math.max(1, parseInt(duration_minutes) || 5));

    if (!opponentId) return res.status(400).json({ error: 'opponent_id requerido' });
    if (opponentId === hostId) return res.status(400).json({ error: 'No puedes hacer battle contigo mismo' });

    // El que invita debe estar en un show en vivo
    const { data: myShow } = await supabase
      .from('live_shows')
      .select('id, status')
      .eq('host_id', hostId)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!myShow) {
      return res.status(400).json({ error: 'Solo puedes invitar a un battle mientras estás en vivo' });
    }

    // Validar oponente: existe, es creator
    const { data: opponent } = await supabase
      .from('profiles')
      .select('id, full_name, is_creator')
      .eq('id', opponentId)
      .single();
    if (!opponent) return res.status(404).json({ error: 'Oponente no encontrado' });

    // ¿El oponente está en vivo también?
    const { data: oppShow } = await supabase
      .from('live_shows')
      .select('id')
      .eq('host_id', opponentId)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Comprobar invitación pendiente / activa entre los mismos
    const { data: existingBattle } = await supabase
      .from('stream_battles')
      .select('id, status')
      .or(`and(host1_id.eq.${hostId},host2_id.eq.${opponentId}),and(host1_id.eq.${opponentId},host2_id.eq.${hostId})`)
      .in('status', ['pending', 'accepted', 'live'])
      .maybeSingle();

    if (existingBattle) {
      return res.status(400).json({
        error: 'Ya existe un battle en curso o pendiente con este creador',
        code: 'BATTLE_EXISTS',
        battle_id: existingBattle.id,
      });
    }

    const { data: battle, error } = await supabase
      .from('stream_battles')
      .insert({
        host1_id: hostId,
        host2_id: opponentId,
        show1_id: myShow.id,
        show2_id: oppShow?.id || null,
        duration_minutes: duration,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) throw error;

    const { data: host } = await supabase.from('profiles').select('full_name').eq('id', hostId).single();
    createNotification(
      opponentId, 'battle_invite',
      `⚔️ ${host?.full_name || 'Alguien'} te invitó a un battle`,
      `${duration} minutos · ¡Acepta para empezar!`,
      { battle_id: battle.id, host_id: hostId, duration }
    ).catch(() => {});
    sendPushToUser(opponentId, {
      title: `⚔️ ${host?.full_name || 'Alguien'} quiere battle contigo`,
      body: `${duration} min — acepta para empezar`,
      url: `/show/${oppShow?.id || ''}?battle=${battle.id}`,
    }).catch(() => {});

    res.status(201).json({ battle });
  } catch (err) {
    console.error('[inviteBattle] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/battles/:id/accept — host2 acepta + arranca el battle
export const acceptBattle = async (req, res) => {
  try {
    const userId = req.user.id;
    const battleId = req.params.id;

    const { data: battle } = await supabase
      .from('stream_battles')
      .select('*')
      .eq('id', battleId)
      .single();

    if (!battle) return res.status(404).json({ error: 'Battle no encontrado' });
    if (battle.host2_id !== userId) return res.status(403).json({ error: 'No eres el invitado' });
    if (battle.status !== 'pending') return res.status(400).json({ error: 'Battle ya no está pendiente' });

    // host2 debe estar en vivo para arrancar
    const { data: myShow } = await supabase
      .from('live_shows')
      .select('id')
      .eq('host_id', userId)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!myShow) {
      return res.status(400).json({ error: 'Debes estar en vivo para aceptar el battle' });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('stream_battles')
      .update({
        status: 'live',
        show2_id: myShow.id,
        accepted_at: now,
        started_at: now,
      })
      .eq('id', battleId)
      .select('*')
      .single();
    if (error) throw error;

    // Notificar al host1 que arrancó
    createNotification(
      battle.host1_id, 'battle_started',
      `⚔️ ¡El battle empezó!`,
      `Tienes ${battle.duration_minutes} minutos`,
      { battle_id: battleId }
    ).catch(() => {});

    // Broadcast a los dos canales (host1 y host2) para que sus viewers se enteren
    broadcastBattleEvent(battleId, 'battle_started', { battle: updated });
    broadcastToChannel(`show:${battle.show1_id}`, 'battle_started', { battle_id: battleId }).catch(() => {});
    if (myShow.id) {
      broadcastToChannel(`show:${myShow.id}`, 'battle_started', { battle_id: battleId }).catch(() => {});
    }

    res.json({ battle: updated });
  } catch (err) {
    console.error('[acceptBattle] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/battles/:id/reject
export const rejectBattle = async (req, res) => {
  try {
    const userId = req.user.id;
    const battleId = req.params.id;

    const { data: battle } = await supabase
      .from('stream_battles').select('*').eq('id', battleId).single();
    if (!battle) return res.status(404).json({ error: 'Battle no encontrado' });
    if (battle.host2_id !== userId) return res.status(403).json({ error: 'No autorizado' });
    if (battle.status !== 'pending') return res.status(400).json({ error: 'Battle ya no está pendiente' });

    await supabase.from('stream_battles')
      .update({ status: 'rejected' })
      .eq('id', battleId);

    createNotification(
      battle.host1_id, 'battle_rejected',
      `⚔️ Battle rechazado`,
      'El oponente declinó la invitación',
      { battle_id: battleId }
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('[rejectBattle] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/battles/:id/cancel — host1 cancela antes de aceptar
export const cancelBattle = async (req, res) => {
  try {
    const userId = req.user.id;
    const battleId = req.params.id;

    const { data: battle } = await supabase
      .from('stream_battles').select('host1_id, status').eq('id', battleId).single();
    if (!battle) return res.status(404).json({ error: 'Battle no encontrado' });
    if (battle.host1_id !== userId) return res.status(403).json({ error: 'No autorizado' });
    if (battle.status !== 'pending') return res.status(400).json({ error: 'Battle ya no se puede cancelar' });

    await supabase.from('stream_battles')
      .update({ status: 'cancelled' }).eq('id', battleId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/battles/:id/tip — viewer envía coins para un team
// Body: { team: 1 | 2, coins: number }
export const tipBattle = async (req, res) => {
  try {
    const tipperId = req.user.id;
    const battleId = req.params.id;
    const team = parseInt(req.body.team);
    const coins = parseInt(req.body.coins);

    if (![1, 2].includes(team)) return res.status(400).json({ error: 'team debe ser 1 o 2' });
    if (!Number.isFinite(coins) || coins <= 0 || coins > 99999) {
      return res.status(400).json({ error: 'Coins inválidos' });
    }

    // B3: Usar RPC atómica tip_battle_atomic (v44) que hace TODO en una TX:
    //   - lock del battle + validaciones
    //   - spend coins del tipper
    //   - add coins al host (70%)
    //   - registrar tip + actualizar score
    // Si CUALQUIER paso falla, la TX se revierte → no más coins perdidos en
    // race conditions (antes eran 3 ops separadas con refund best-effort).
    const { CREATOR_CUT } = await import('../lib/constants.js');
    const creatorCoins = Math.round(coins * CREATOR_CUT);

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('tip_battle_atomic', {
      p_battle_id:     battleId,
      p_tipper_id:     tipperId,
      p_team:          team,
      p_coins:         coins,
      p_creator_coins: creatorCoins,
    });

    if (rpcErr) {
      console.error('[tipBattle] RPC error:', rpcErr.message);
      return res.status(500).json({ error: 'Error procesando tip' });
    }
    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!result?.success) {
      const code = result?.error_code;
      if (code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: 'Coins insuficientes', code });
      }
      if (code === 'BATTLE_NOT_LIVE') {
        return res.status(400).json({ error: 'El battle no está en vivo', code });
      }
      if (code === 'BATTLE_NOT_FOUND') {
        return res.status(404).json({ error: 'Battle no encontrado', code });
      }
      if (code === 'CANNOT_TIP_SELF') {
        return res.status(400).json({ error: 'No puedes tipear a ti mismo', code });
      }
      return res.status(400).json({ error: code || 'No se pudo procesar el tip' });
    }

    // Broadcast score actualizado
    broadcastBattleEvent(battleId, 'score_changed', {
      score1: result.new_score1,
      score2: result.new_score2,
      tipper_id: tipperId,
      team,
      coins,
    });

    res.json({
      success: true,
      score1: result.new_score1,
      score2: result.new_score2,
    });
  } catch (err) {
    console.error('[tipBattle] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/battles/:id/end — terminar el battle (lo llama el host1 o cualquiera de los hosts)
export const endBattle = async (req, res) => {
  try {
    const userId = req.user.id;
    const battleId = req.params.id;

    const { data: battle } = await supabase
      .from('stream_battles')
      .select('host1_id, host2_id, status, started_at, duration_minutes')
      .eq('id', battleId)
      .single();
    if (!battle) return res.status(404).json({ error: 'Battle no encontrado' });
    if (battle.status !== 'live') return res.status(400).json({ error: 'Battle no está live' });
    if (battle.host1_id !== userId && battle.host2_id !== userId) {
      return res.status(403).json({ error: 'Solo los hosts pueden terminar' });
    }

    // B2: validar que el tiempo del battle realmente terminó (con 5s de gracia).
    // Antes cualquier host podía terminar el battle prematuramente, robando
    // tiempo a los viewers que ya habían apostado en el otro lado.
    const elapsedMs = Date.now() - new Date(battle.started_at).getTime();
    const totalMs   = (battle.duration_minutes || 5) * 60 * 1000;
    if (elapsedMs < totalMs - 5000) {
      const remainingSec = Math.ceil((totalMs - elapsedMs) / 1000);
      return res.status(400).json({
        error: `El battle aún no termina (faltan ${remainingSec}s)`,
        code: 'BATTLE_STILL_LIVE',
        remaining_seconds: remainingSec,
      });
    }

    const { data: rpcResult, error } = await supabase.rpc('battle_end', { p_battle_id: battleId });
    if (error) throw error;
    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!result?.success) return res.status(400).json({ error: 'No se pudo terminar' });

    broadcastBattleEvent(battleId, 'battle_ended', {
      winner_id: result.winner_id,
      score1: result.score1,
      score2: result.score2,
    });

    // Notif a ambos hosts
    const winnerId = result.winner_id;
    const loserId = winnerId === battle.host1_id ? battle.host2_id
                  : winnerId === battle.host2_id ? battle.host1_id : null;
    if (winnerId) {
      createNotification(winnerId, 'battle_won', '🏆 ¡Ganaste el battle!',
        `Score: ${result.score1} vs ${result.score2}`, { battle_id: battleId }).catch(() => {});
    }
    if (loserId) {
      createNotification(loserId, 'battle_lost', '⚔️ Battle terminado',
        `Score: ${result.score1} vs ${result.score2}`, { battle_id: battleId }).catch(() => {});
    }
    if (!winnerId) {
      // Empate
      [battle.host1_id, battle.host2_id].forEach(id =>
        createNotification(id, 'battle_tied', '🤝 Empate',
          `Score: ${result.score1} vs ${result.score2}`, { battle_id: battleId }).catch(() => {}));
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[endBattle] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/battles/:id — info actual del battle
export const getBattle = async (req, res) => {
  try {
    const battleId = req.params.id;
    const { data: battle } = await supabase
      .from('stream_battles')
      .select(`
        id, status, duration_minutes, score1_coins, score2_coins,
        invited_at, accepted_at, started_at, ended_at, winner_id, show1_id, show2_id,
        host1:profiles!host1_id (id, full_name, avatar_url, is_verified),
        host2:profiles!host2_id (id, full_name, avatar_url, is_verified)
      `)
      .eq('id', battleId)
      .single();
    if (!battle) return res.status(404).json({ error: 'Battle no encontrado' });
    res.json({ battle });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/battles/active?show_id=:id — battle live asociado a un show
// (para que viewers que entran tarde vean el battle).
export const getActiveBattleForShow = async (req, res) => {
  try {
    const showId = req.query.show_id;
    if (!showId) return res.status(400).json({ error: 'show_id requerido' });

    const { data: battle } = await supabase
      .from('stream_battles')
      .select(`
        id, status, duration_minutes, score1_coins, score2_coins,
        invited_at, accepted_at, started_at, ended_at, winner_id,
        host1_id, host2_id, show1_id, show2_id,
        host1:profiles!host1_id (id, full_name, avatar_url, is_verified),
        host2:profiles!host2_id (id, full_name, avatar_url, is_verified)
      `)
      .eq('status', 'live')
      .or(`show1_id.eq.${showId},show2_id.eq.${showId}`)
      .maybeSingle();
    res.json({ battle: battle || null });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/battles/pending — invitaciones pendientes para mí (como host2)
export const getMyPendingBattles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: battles } = await supabase
      .from('stream_battles')
      .select(`
        id, duration_minutes, invited_at,
        host1:profiles!host1_id (id, full_name, avatar_url, is_verified)
      `)
      .eq('host2_id', userId)
      .eq('status', 'pending')
      .gt('invited_at', new Date(Date.now() - 60_000).toISOString())  // últimos 60 segundos
      .order('invited_at', { ascending: false });
    res.json({ battles: battles || [] });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};
