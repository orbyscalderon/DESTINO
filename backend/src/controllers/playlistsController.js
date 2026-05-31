import { supabase } from '../lib/supabase.js';

// GET /api/playlists — mis playlists
export const getMyPlaylists = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: lists } = await supabase
      .from('video_playlists').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    // Asegurar que "Favoritos" exista
    let favs = (lists || []).find(l => l.is_favorites);
    if (!favs) {
      const { data: created } = await supabase.from('video_playlists').insert({
        user_id: userId, name: 'Favoritos', is_favorites: true, is_public: false,
      }).select().single();
      favs = created;
    }

    const allLists = [favs, ...(lists || []).filter(l => !l.is_favorites)];
    // Conteos
    const ids = allLists.map(l => l.id);
    const counts = {};
    if (ids.length) {
      const { data: items } = await supabase.from('playlist_items').select('playlist_id').in('playlist_id', ids);
      (items || []).forEach(i => { counts[i.playlist_id] = (counts[i.playlist_id] || 0) + 1; });
    }
    res.json({ playlists: allLists.map(l => ({ ...l, items_count: counts[l.id] || 0 })) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/playlists — crear
export const createPlaylist = async (req, res) => {
  try {
    const { name, is_public } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const { data, error } = await supabase.from('video_playlists').insert({
      user_id: req.user.id,
      name: name.trim().substring(0, 60),
      is_public: !!is_public,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ playlist: data });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/playlists/:id
export const deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: list } = await supabase.from('video_playlists').select('user_id, is_favorites').eq('id', id).single();
    if (!list) return res.status(404).json({ error: 'No encontrado' });
    if (list.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    if (list.is_favorites) return res.status(400).json({ error: 'No puedes borrar tu lista de favoritos' });
    await supabase.from('video_playlists').delete().eq('id', id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/playlists/:id/items — body { video_id }
export const addToPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { video_id } = req.body;
    if (!video_id) return res.status(400).json({ error: 'video_id requerido' });

    const { data: list } = await supabase.from('video_playlists').select('user_id').eq('id', id).single();
    if (!list || list.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const { data: existing } = await supabase.from('playlist_items')
      .select('playlist_id').eq('playlist_id', id).eq('video_id', video_id).maybeSingle();
    if (existing) return res.json({ ok: true, already: true });

    await supabase.from('playlist_items').insert({ playlist_id: id, video_id });
    // Si no tiene cover, usar este video como cover
    await supabase.from('video_playlists')
      .update({ cover_video_id: video_id })
      .eq('id', id).is('cover_video_id', null);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/playlists/:id/items/:videoId
export const removeFromPlaylist = async (req, res) => {
  try {
    const { id, videoId } = req.params;
    const { data: list } = await supabase.from('video_playlists').select('user_id').eq('id', id).single();
    if (!list || list.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('playlist_items').delete().eq('playlist_id', id).eq('video_id', videoId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/playlists/:id — contenido (público o propio)
export const getPlaylistContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: list } = await supabase.from('video_playlists').select('*').eq('id', id).single();
    if (!list) return res.status(404).json({ error: 'No encontrada' });
    if (!list.is_public && list.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Privada' });
    }

    const { data: items } = await supabase.from('playlist_items')
      .select(`
        added_at, position,
        video:profile_videos(
          id, title, thumbnail_url, duration_seconds, views_count, rating_score,
          user:profiles!user_id(id, full_name, avatar_url)
        )
      `)
      .eq('playlist_id', id)
      .order('added_at', { ascending: false });

    res.json({ playlist: list, items: items || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
