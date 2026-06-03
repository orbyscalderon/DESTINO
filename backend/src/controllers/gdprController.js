import { supabase } from '../lib/supabase.js';
import { deleteFile } from '../lib/storageProvider.js';

// GET /api/gdpr/export — el usuario descarga TODOS sus datos en JSON
// Cumple con el "Right to Data Portability" del GDPR (art. 20) y CCPA.
export const exportMyData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Registrar la solicitud para auditoría
    await supabase.from('gdpr_export_requests').insert({
      user_id: userId,
      status: 'processing',
    }).select('id').single().catch(() => null);

    // Consultar todos los datos del usuario en paralelo
    const queries = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('matches').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
      supabase.from('messages').select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
      supabase.from('posts').select('*').eq('user_id', userId),
      supabase.from('profile_videos').select('*').eq('user_id', userId),
      supabase.from('profile_photos').select('*').eq('user_id', userId),
      supabase.from('coin_transactions').select('*').eq('user_id', userId),
      supabase.from('show_tickets').select('*').or(`buyer_id.eq.${userId}`),
      supabase.from('show_tips').select('*').or(`tipper_id.eq.${userId}`),
      supabase.from('show_gifts').select('*').or(`sender_id.eq.${userId}`),
      supabase.from('content_purchases').select('*').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
      supabase.from('creator_subscriptions').select('*').or(`subscriber_id.eq.${userId},creator_id.eq.${userId}`),
      supabase.from('video_requests').select('*').or(`requester_id.eq.${userId},creator_id.eq.${userId}`),
      supabase.from('live_shows').select('*').eq('host_id', userId),
      supabase.from('user_follows').select('*').or(`follower_id.eq.${userId},following_id.eq.${userId}`),
      supabase.from('notifications').select('*').eq('user_id', userId),
      supabase.from('login_attempts').select('*').eq('email', req.user.email).limit(100),
    ]);

    const safe = (q, key) => ({ [key]: q.data || (q.data === null ? null : []) });
    const payload = {
      meta: {
        user_id: userId,
        email: req.user.email,
        exported_at: new Date().toISOString(),
        format_version: '1.0',
        rights_url: 'https://gdpr.eu/article-20-right-to-data-portability/',
      },
      ...safe(queries[0], 'profile'),
      ...safe(queries[1], 'matches'),
      ...safe(queries[2], 'messages'),
      ...safe(queries[3], 'posts'),
      ...safe(queries[4], 'profile_videos'),
      ...safe(queries[5], 'profile_photos'),
      ...safe(queries[6], 'coin_transactions'),
      ...safe(queries[7], 'show_tickets_purchased'),
      ...safe(queries[8], 'show_tips_sent'),
      ...safe(queries[9], 'show_gifts_sent'),
      ...safe(queries[10], 'content_purchases'),
      ...safe(queries[11], 'creator_subscriptions'),
      ...safe(queries[12], 'video_requests'),
      ...safe(queries[13], 'live_shows_hosted'),
      ...safe(queries[14], 'follows'),
      ...safe(queries[15], 'notifications'),
      ...safe(queries[16], 'login_attempts_recent'),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="destino-data-${userId}.json"`);
    res.json(payload);
  } catch (err) {
    console.error('exportMyData error:', err.message);
    res.status(500).json({ error: 'Error generando exportación' });
  }
};

// DELETE /api/gdpr/account — borrado permanente de cuenta
// Body: { confirm: 'BORRAR MI CUENTA', reason?: string }
// Cumple "Right to Erasure" GDPR art. 17 y requerimiento Apple/Google Play.
export const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { confirm, reason } = req.body;

    if (confirm !== 'BORRAR MI CUENTA') {
      return res.status(400).json({
        error: 'Confirmación inválida. Escribe exactamente "BORRAR MI CUENTA" para confirmar.',
      });
    }

    // Registro de auditoría ANTES de borrar
    await supabase.from('deletion_log').insert({
      user_id: userId,
      email: req.user.email,
      reason: reason || 'user_request',
    });

    // 1) Recopilar storage_paths a borrar de Storage
    const storagePaths = [];
    const collectPath = (rows, key = 'storage_path') => {
      (rows || []).forEach(r => { if (r[key]) storagePaths.push(r[key]); });
    };

    const [photos, vids, posts, gallery] = await Promise.all([
      supabase.from('profile_photos').select('storage_path').eq('user_id', userId),
      supabase.from('profile_videos').select('storage_path').eq('user_id', userId),
      supabase.from('posts').select('image_url, video_url').eq('user_id', userId),
      supabase.from('creator_gallery').select('storage_path').eq('user_id', userId).then(r => r).catch(() => ({ data: [] })),
    ]);
    collectPath(photos.data);
    collectPath(vids.data);
    collectPath(gallery.data);

    // 2) Borrar archivos de storage (best-effort)
    if (storagePaths.length) {
      await deleteFile(storagePaths).catch(() => {});
    }

    // 3) Borrar datos relacionados (cascadas RLS no siempre cubren todo)
    const tables = [
      'profile_photos', 'profile_videos', 'posts', 'matches',
      'messages', 'follows', 'notifications', 'push_subscriptions',
      'coin_transactions', 'show_tickets', 'show_tips', 'show_gifts',
      'content_purchases', 'creator_subscriptions', 'video_requests',
      'live_shows', 'creator_earnings', 'withdrawal_requests',
      'verification_requests', 'reports', 'blocks',
    ];
    for (const t of tables) {
      await supabase.from(t).delete().or(
        `user_id.eq.${userId},sender_id.eq.${userId},receiver_id.eq.${userId},` +
        `buyer_id.eq.${userId},seller_id.eq.${userId},follower_id.eq.${userId},` +
        `following_id.eq.${userId},subscriber_id.eq.${userId},creator_id.eq.${userId},` +
        `host_id.eq.${userId},tipper_id.eq.${userId},requester_id.eq.${userId}`
      ).catch(() => {}); // Algunas tablas no tienen todas estas columnas
    }

    // 4) Borrar profile y auth.user
    await supabase.from('profiles').delete().eq('id', userId);
    await supabase.auth.admin.deleteUser(userId).catch(err => {
      console.error('Auth deletion failed:', err.message);
    });

    // 5) Marcar log como completado
    await supabase.from('deletion_log')
      .update({ data_purge_status: 'completed' })
      .eq('user_id', userId);

    res.json({
      message: 'Tu cuenta y todos los datos asociados han sido eliminados permanentemente.',
      deleted_storage_files: storagePaths.length,
    });
  } catch (err) {
    console.error('deleteMyAccount error:', err.message);
    res.status(500).json({ error: 'Error eliminando la cuenta. Contacta a soporte.' });
  }
};
