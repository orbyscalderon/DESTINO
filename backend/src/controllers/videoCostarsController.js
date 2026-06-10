import { supabase } from '../lib/supabase.js';

// POST /api/adult-video/costars  body: { video_id, costar_user_id, revenue_split_pct? }
// El owner del video tagea a otro creator
export const tagCostar = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { video_id, costar_user_id, revenue_split_pct } = req.body;
    if (!video_id || !costar_user_id) return res.status(400).json({ error: 'video_id y costar_user_id requeridos' });
    if (costar_user_id === ownerId) return res.status(400).json({ error: 'No puedes tagearte a ti mismo' });

    const { data: video } = await supabase.from('profile_videos')
      .select('user_id').eq('id', video_id).maybeSingle();
    if (video?.user_id !== ownerId) return res.status(403).json({ error: 'El video no es tuyo' });

    const split = Math.max(0, Math.min(100, parseInt(revenue_split_pct) || 0));

    const { error } = await supabase.from('video_costars').upsert({
      video_id, costar_user_id, revenue_split_pct: split,
      // Reset confirmation si cambia el split
      confirmed: false, confirmed_at: null,
    }, { onConflict: 'video_id,costar_user_id' });
    if (error) throw error;

    // Notificar al costar
    const { createNotification } = await import('./inAppNotifController.js');
    const { data: owner } = await supabase.from('profiles').select('full_name').eq('id', ownerId).single();
    createNotification(
      costar_user_id, 'costar_tag',
      `🎬 ${owner?.full_name} te tagueó en un video`,
      split > 0 ? `Te ofrece ${split}% de ingresos. Acepta o rechaza desde tu perfil.` : 'Solo crédito de aparición. Acepta o rechaza.',
      { video_id, owner_id: ownerId, revenue_split_pct: split }
    ).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/adult-video/costars/:videoId/confirm  — el costar acepta/rechaza
// body: { accept: bool }
export const respondToTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { videoId } = req.params;
    const { accept } = req.body;

    const { data: existing } = await supabase.from('video_costars')
      .select('costar_user_id, video_id').eq('video_id', videoId).eq('costar_user_id', userId).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'No tienes invitación a este video' });

    if (accept) {
      await supabase.from('video_costars')
        .update({ confirmed: true, confirmed_at: new Date().toISOString() })
        .eq('video_id', videoId).eq('costar_user_id', userId);
    } else {
      await supabase.from('video_costars')
        .delete().eq('video_id', videoId).eq('costar_user_id', userId);
    }
    res.json({ ok: true, accepted: !!accept });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/adult-video/costars/pending — invitaciones pending del user
export const listMyPendingTags = async (req, res) => {
  try {
    const { data } = await supabase.from('video_costars')
      .select(`
        video_id, revenue_split_pct, created_at,
        video:profile_videos(id, title, thumbnail_url, user_id, profiles:profiles!user_id(full_name, username, avatar_url))
      `)
      .eq('costar_user_id', req.user.id).eq('confirmed', false)
      .order('created_at', { ascending: false });
    res.json({ pending: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/adult-video/costars/by-video/:videoId — co-stars confirmados (público)
export const listCostarsForVideo = async (req, res) => {
  try {
    const { data } = await supabase.from('video_costars')
      .select(`
        revenue_split_pct,
        user:profiles!costar_user_id(id, full_name, username, avatar_url, is_verified)
      `)
      .eq('video_id', req.params.videoId).eq('confirmed', true);
    res.json({ costars: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// DELETE /api/adult-video/costars/:videoId/:costarId — owner saca tag
export const removeTag = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { videoId, costarId } = req.params;
    const { data: video } = await supabase.from('profile_videos')
      .select('user_id').eq('id', videoId).maybeSingle();
    if (video?.user_id !== ownerId) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('video_costars')
      .delete().eq('video_id', videoId).eq('costar_user_id', costarId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
