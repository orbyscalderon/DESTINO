import { supabase } from '../lib/supabase.js';
import { sendBroadcastNotification } from './notificationController.js';

// POST /api/dmca — público, no requiere auth
// Recibe una notificación DMCA conforme al 17 U.S.C. § 512(c)(3).
export const submitDMCA = async (req, res) => {
  try {
    const {
      claimant_name, claimant_email, claimant_address, claimant_phone,
      copyright_owner, original_work_url,
      infringing_url, content_type, content_id,
      good_faith_statement, accuracy_statement, perjury_acknowledgment,
      signature,
    } = req.body;

    // Validación: campos requeridos por DMCA
    if (!claimant_name || !claimant_email || !copyright_owner ||
        !infringing_url || !signature) {
      return res.status(400).json({
        error: 'Faltan campos obligatorios: nombre, email, titular del copyright, URL del contenido infractor y firma.',
      });
    }

    if (!good_faith_statement || !accuracy_statement || !perjury_acknowledgment) {
      return res.status(400).json({
        error: 'Debes aceptar las tres declaraciones legales requeridas por DMCA.',
      });
    }

    // Email simple validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimant_email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Buscar al usuario propietario del contenido si nos dan content_id
    let reportedUserId = null;
    if (content_id && content_type) {
      const tableMap = {
        photo: 'profile_photos', video: 'profile_videos',
        post: 'posts', show: 'live_shows',
      };
      const userField = content_type === 'show' ? 'host_id' : 'user_id';
      const table = tableMap[content_type];
      if (table) {
        const { data } = await supabase.from(table).select(userField).eq('id', content_id).single();
        reportedUserId = data?.[userField] || null;
      }
    }

    const { data: dmca, error } = await supabase.from('dmca_requests').insert({
      claimant_name: claimant_name.trim(),
      claimant_email: claimant_email.trim().toLowerCase(),
      claimant_address: claimant_address?.trim() || null,
      claimant_phone: claimant_phone?.trim() || null,
      copyright_owner: copyright_owner.trim(),
      original_work_url: original_work_url?.trim() || null,
      infringing_url: infringing_url.trim(),
      content_type: content_type || 'other',
      content_id: content_id || null,
      reported_user_id: reportedUserId,
      good_faith_statement,
      accuracy_statement,
      perjury_acknowledgment,
      signature: signature.trim(),
    }).select('id, created_at').single();

    if (error) throw error;

    res.status(201).json({
      message: 'Tu notificación DMCA fue recibida. La procesaremos en un plazo máximo de 7 días hábiles.',
      reference_id: dmca.id,
      received_at: dmca.created_at,
    });
  } catch (err) {
    console.error('submitDMCA error:', err.message);
    res.status(500).json({ error: 'Error procesando la solicitud. Intenta más tarde.' });
  }
};

// GET /api/admin/dmca — listar solicitudes (admin)
export const listDMCA = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { data } = await supabase
      .from('dmca_requests')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100);
    res.json({ requests: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error listando DMCA' });
  }
};

// PATCH /api/admin/dmca/:id — procesar (admin)
// Body: { action: 'accept' | 'reject' | 'counter_notice', admin_notes?, remove_content? }
export const processDMCA = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, admin_notes, remove_content } = req.body;

    const { data: dmca } = await supabase
      .from('dmca_requests').select('*').eq('id', id).single();
    if (!dmca) return res.status(404).json({ error: 'DMCA no encontrado' });

    let status, resolution = null;
    if (action === 'accept') {
      status = 'accepted';
      resolution = remove_content ? 'content_removed' : 'no_action';

      // Quitar el contenido si se solicita
      if (remove_content && dmca.content_id && dmca.content_type) {
        if (dmca.content_type === 'video') {
          // Soft-delete: marca como takedown (preserva 2257 records)
          await supabase.from('profile_videos')
            .update({ dmca_taken_down: true, is_hidden: true })
            .eq('id', dmca.content_id).catch(() => {});
        } else {
          const tableMap = {
            photo: 'profile_photos', post: 'posts', show: 'live_shows',
          };
          const table = tableMap[dmca.content_type];
          if (table) {
            await supabase.from(table).delete().eq('id', dmca.content_id).catch(() => {});
          }
        }

        // Incrementar strike y posible auto-ban
        if (dmca.reported_user_id) {
          const { data: strikeResult } = await supabase.rpc('increment_dmca_strike', {
            p_user_id: dmca.reported_user_id,
            p_dmca_id: dmca.id,
          });
          const banned = strikeResult?.banned === true;
          const strikes = strikeResult?.strike_count || 0;

          await sendBroadcastNotification(
            [dmca.reported_user_id],
            'dmca',
            banned ? '🚫 Cuenta bloqueada (3 strikes DMCA)' : `⚠️ Strike DMCA ${strikes}/3`,
            banned
              ? 'Tu cuenta fue bloqueada permanentemente por acumular 3 strikes DMCA.'
              : `Recibiste un strike por DMCA. Al 3er strike tu cuenta será bloqueada permanentemente.`,
            { url: '/help#dmca' }
          ).catch(() => {});

          // v69: Statement of Reasons (DSA Art. 17)
          import('./moderationDecisionController.js').then(({ logModerationDecision }) =>
            logModerationDecision({
              content_type: dmca.content_type,
              content_id: dmca.content_id,
              affected_user_id: dmca.reported_user_id,
              decision: banned ? 'account_banned' : 'removed',
              decision_method: 'human',
              decided_by: req.user.id,
              reason_category: 'copyright',
              reason_detail: `Reclamo DMCA aceptado: ${dmca.copyright_owner} alegó copyright sobre tu contenido.`,
              legal_basis: '17 U.S.C. § 512(c) DMCA',
              tos_clause: 'Términos §12 (DMCA + propiedad intelectual)',
              source: 'dmca_notice',
              source_reference_id: dmca.id,
            }).catch(() => {})
          ).catch(() => {});

          import('../lib/emailNotifier.js').then(({ notifyUser }) =>
            notifyUser(dmca.reported_user_id, 'dmca', {
              strikeCount: strikes,
              banned,
            })
          ).catch(() => {});
        }
      }
    } else if (action === 'reject') {
      status = 'rejected';
      resolution = 'no_action';
    } else if (action === 'counter_notice') {
      status = 'counter_notice';
    } else {
      return res.status(400).json({ error: 'Acción inválida' });
    }

    await supabase.from('dmca_requests').update({
      status,
      resolution,
      admin_notes: admin_notes || null,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);

    res.json({ message: 'DMCA procesado', status });
  } catch (err) {
    console.error('processDMCA error:', err.message);
    res.status(500).json({ error: 'Error procesando DMCA' });
  }
};
