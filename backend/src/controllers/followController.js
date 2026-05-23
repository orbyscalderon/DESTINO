import { supabase } from '../lib/supabase.js';

// POST /api/follows/:userId — seguir a un usuario
export const followUser = async (req, res) => {
  try {
    const followerId  = req.user.id;
    const followingId = req.params.userId;
    if (followerId === followingId) return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });

    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: followerId, following_id: followingId });

    if (error?.code === '23505') return res.json({ following: true }); // ya seguía
    if (error) throw error;
    res.json({ following: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/follows/:userId — dejar de seguir
export const unfollowUser = async (req, res) => {
  try {
    const followerId  = req.user.id;
    const followingId = req.params.userId;

    await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);

    res.json({ following: false });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/follows/:userId/status — ¿estoy siguiendo a este usuario?
export const getFollowStatus = async (req, res) => {
  try {
    const followerId  = req.user.id;
    const followingId = req.params.userId;

    const [{ data: row }, { count: followers }, { count: following }] = await Promise.all([
      supabase.from('user_follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle(),
      supabase.from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', followingId),
      supabase.from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', followingId),
    ]);

    res.json({ following: !!row, followers_count: followers || 0, following_count: following || 0 });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/follows/:userId/followers — lista de seguidores
export const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('user_follows')
      .select('follower:profiles!follower_id(id, full_name, username, avatar_url, is_verified)')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ followers: (data || []).map(r => r.follower) });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
