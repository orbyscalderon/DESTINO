import { supabase } from '../lib/supabase.js';
import crypto from 'crypto';

const PAGE_SIZE = 24;

// GET /api/explore/videos?sort=trending|new|top|views&tag=slug&category=name&page=0
export const listVideos = async (req, res) => {
  try {
    const sort     = (req.query.sort || 'trending').toString();
    const tag      = req.query.tag?.toString().toLowerCase();
    const category = req.query.category?.toString().toLowerCase();
    const search   = req.query.q?.toString().trim();
    const page     = Math.max(0, parseInt(req.query.page) || 0);
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let videoIds = null;
    if (tag) {
      const { data: tagRow } = await supabase
        .from('video_tags').select('id').eq('slug', tag).single();
      if (!tagRow) return res.json({ videos: [], page, has_more: false });

      const { data: assignments } = await supabase
        .from('video_tag_assignments').select('video_id').eq('tag_id', tagRow.id);
      videoIds = (assignments || []).map(a => a.video_id);
      if (videoIds.length === 0) return res.json({ videos: [], page, has_more: false });
    }

    let q = supabase
      .from('profile_videos')
      .select(`
        id, title, description, url, thumbnail_url, duration_seconds,
        views_count, rating_up, rating_down, rating_score, adult_category,
        published_at, is_paid, price,
        user:profiles!user_id(id, full_name, avatar_url, is_verified)
      `)
      .eq('is_adult', true)
      .eq('is_hidden', false)
      .eq('dmca_taken_down', false)
      .eq('has_2257_records', true);

    if (videoIds) q = q.in('id', videoIds);
    if (category) q = q.eq('adult_category', category);
    if (search) {
      // Postgres full text en title + description
      q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (sort === 'new')        q = q.order('published_at', { ascending: false });
    else if (sort === 'top')   q = q.order('rating_score', { ascending: false }).order('views_count', { ascending: false });
    else if (sort === 'views') q = q.order('views_count',  { ascending: false });
    else {
      // trending: views recientes (proxy: order by published_at desc weighted with views)
      // Simplificación: views_count en últimos 7d. Aquí usamos un proxy menos costoso.
      q = q.order('views_count', { ascending: false }).order('published_at', { ascending: false });
    }

    q = q.range(from, to);

    const { data: videos, error } = await q;
    if (error) throw error;

    // Tags por video (en una sola query)
    const ids = (videos || []).map(v => v.id);
    let tagsByVideo = {};
    if (ids.length > 0) {
      const { data: tagRows } = await supabase
        .from('video_tag_assignments')
        .select('video_id, tag:video_tags(slug, name, category)')
        .in('video_id', ids);
      tagRows?.forEach(t => {
        if (!tagsByVideo[t.video_id]) tagsByVideo[t.video_id] = [];
        if (t.tag) tagsByVideo[t.video_id].push(t.tag);
      });
    }

    // Mi voto en cada video (si autenticado)
    let myVotes = {};
    if (ids.length > 0 && req.user?.id) {
      const { data: votes } = await supabase
        .from('video_ratings').select('video_id, value')
        .eq('user_id', req.user.id).in('video_id', ids);
      (votes || []).forEach(v => { myVotes[v.video_id] = v.value; });
    }

    const result = (videos || []).map(v => ({
      ...v,
      tags: tagsByVideo[v.id] || [],
      my_vote: myVotes[v.id] || null,
    }));

    res.json({ videos: result, page, has_more: result.length === PAGE_SIZE });
  } catch (err) {
    console.error('listVideos error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/explore/videos/:id — detalle + tags + "up next"
export const getVideoDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video, error } = await supabase
      .from('profile_videos')
      .select(`
        id, title, description, url, thumbnail_url, duration_seconds,
        views_count, rating_up, rating_down, rating_score, adult_category,
        published_at, embed_enabled, is_paid, price, user_id,
        user:profiles!user_id(id, full_name, avatar_url, is_verified, is_adult_creator)
      `)
      .eq('id', id)
      .eq('is_adult', true)
      .eq('is_hidden', false)
      .eq('dmca_taken_down', false)
      .single();

    if (error || !video) return res.status(404).json({ error: 'Video no encontrado' });

    // Tags
    const { data: tagRows } = await supabase
      .from('video_tag_assignments')
      .select('tag:video_tags(slug, name, category)')
      .eq('video_id', id);
    const tags = (tagRows || []).map(t => t.tag).filter(Boolean);

    // Mi voto
    let myVote = null;
    if (req.user?.id) {
      const { data: vote } = await supabase
        .from('video_ratings').select('value')
        .eq('video_id', id).eq('user_id', req.user.id).maybeSingle();
      myVote = vote?.value || null;
    }

    // Up next: top-rated del mismo creador + algunos populares con tags similares
    const tagSlugs = tags.map(t => t.slug);
    let upNext = [];
    if (tagSlugs.length > 0) {
      const { data: tagIds } = await supabase
        .from('video_tags').select('id').in('slug', tagSlugs);
      const { data: relAssign } = await supabase
        .from('video_tag_assignments').select('video_id')
        .in('tag_id', (tagIds || []).map(t => t.id))
        .limit(80);
      const relIds = [...new Set((relAssign || []).map(a => a.video_id))].filter(vid => vid !== id);

      const { data: relVideos } = await supabase
        .from('profile_videos')
        .select('id, title, thumbnail_url, duration_seconds, views_count, rating_score, user:profiles!user_id(full_name)')
        .in('id', relIds.slice(0, 30))
        .eq('is_adult', true).eq('is_hidden', false).eq('dmca_taken_down', false)
        .order('rating_score', { ascending: false })
        .limit(10);
      upNext = relVideos || [];
    }

    res.json({ video: { ...video, tags, my_vote: myVote }, up_next: upNext });
  } catch (err) {
    console.error('getVideoDetail error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/explore/tags?category=ethnicity&limit=20
export const listTags = async (req, res) => {
  try {
    const cat   = req.query.category?.toString();
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    let q = supabase.from('video_tags').select('*').order('videos_count', { ascending: false }).limit(limit);
    if (cat) q = q.eq('category', cat);
    const { data } = await q;
    res.json({ tags: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/explore/videos/:id/rate — body { value: 1 | -1 }
export const rateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const value = parseInt(req.body.value);
    if (![1, -1].includes(value)) return res.status(400).json({ error: 'value debe ser 1 o -1' });

    const { data, error } = await supabase.rpc('upsert_video_rating', {
      p_video_id: id, p_user_id: req.user.id, p_value: value,
    });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('rateVideo error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/explore/videos/:id/view — registra una vista
// Dedup por (user_id || ip_hash) durante 30 min para evitar inflar views.
export const recordView = async (req, res) => {
  try {
    const { id } = req.params;
    const duration = Math.max(0, Math.min(60 * 60 * 8, parseInt(req.body.duration) || 0));
    const isEmbed = !!req.body.embed;
    const userId  = req.user?.id || null;
    const ip      = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const ipHash  = ip ? crypto.createHash('sha256').update(ip + (process.env.SUPABASE_ANON_KEY || '')).digest('hex').substring(0, 32) : null;

    // Dedup: misma sesión en 30 min no cuenta como nueva vista
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let dedupQuery = supabase
      .from('video_views').select('id', { count: 'exact', head: true })
      .eq('video_id', id).gte('created_at', since);
    if (userId) dedupQuery = dedupQuery.eq('user_id', userId);
    else if (ipHash) dedupQuery = dedupQuery.eq('ip_hash', ipHash);
    const { count: alreadyViewed } = await dedupQuery;

    if (alreadyViewed === 0) {
      await supabase.from('video_views').insert({
        video_id: id, user_id: userId, ip_hash: ipHash,
        duration_watched: duration, is_embed: isEmbed,
      });
      // increment counter (best-effort)
      await supabase.rpc('increment_video_views', { p_video_id: id }).catch(async () => {
        const { data: v } = await supabase.from('profile_videos').select('views_count').eq('id', id).single();
        await supabase.from('profile_videos').update({ views_count: (v?.views_count || 0) + 1 }).eq('id', id);
      });
    } else if (duration > 0) {
      // Actualizar duration_watched al record más reciente
      const { data: last } = await supabase
        .from('video_views').select('id')
        .eq('video_id', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (last?.id) await supabase.from('video_views').update({ duration_watched: duration }).eq('id', last.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('recordView error:', err.message);
    res.json({ ok: false }); // no romper la UI
  }
};

// GET /embed/v/:id — devuelve HTML del player standalone para iframe externo
export const embedVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video } = await supabase
      .from('profile_videos')
      .select('id, title, url, thumbnail_url, embed_enabled, is_adult, is_hidden, dmca_taken_down')
      .eq('id', id).single();

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!video || video.is_hidden || video.dmca_taken_down || !video.embed_enabled) {
      return res.send(`<!DOCTYPE html><html><body style="margin:0;background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">Video no disponible</body></html>`);
    }

    const esc = (s) => String(s || '').replace(/[<>"]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const fe = process.env.FRONTEND_URL || '';
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${esc(video.title)} · Destino TV</title>
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;}
  .wrap{position:relative;width:100%;height:100%;}
  video{width:100%;height:100%;background:#000;display:block;}
  .ov{position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font-family:sans-serif;font-size:13px;display:flex;justify-content:space-between;align-items:center;pointer-events:none;}
  .ov a{color:#fff;text-decoration:none;background:#f43f5e;padding:4px 10px;border-radius:6px;font-weight:bold;font-size:11px;pointer-events:auto;}
</style></head>
<body>
<div class="wrap">
  <video controls playsinline preload="metadata" poster="${esc(video.thumbnail_url)}">
    <source src="${esc(video.url)}" type="video/mp4">
  </video>
  <div class="ov">
    <span>${esc(video.title)}</span>
    <a href="${esc(fe)}/#/explore/v/${esc(video.id)}" target="_blank" rel="noopener">Ver en Destino TV →</a>
  </div>
</div>
<script>
  // Reportar vista al backend del padre (best-effort)
  try {
    fetch('${esc(process.env.BACKEND_URL || fe)}/api/explore/videos/${esc(video.id)}/view', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ embed: true, duration: 0 })
    }).catch(()=>{});
  } catch(e){}
</script>
</body></html>`;
    res.send(html);
  } catch (err) {
    console.error('embedVideo error:', err.message);
    res.status(500).send('Error');
  }
};

// GET /api/explore/categories — devuelve grupos de tags por categoría
export const listCategories = async (req, res) => {
  try {
    const { data } = await supabase
      .from('video_tags').select('*').order('videos_count', { ascending: false });
    const byCat = {};
    (data || []).forEach(t => {
      const c = t.category || 'other';
      (byCat[c] ||= []).push(t);
    });
    res.json({ categories: byCat });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
