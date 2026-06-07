// rtmpController.js — Generación de stream key + ingress URL para que
// creators usen OBS Studio en lugar de la cámara del navegador.
//
// Implementación: usa LiveKit Ingress API. Cuando el creator activa RTMP,
// llamamos a livekit.ingress.createIngress(RTMP_INPUT) y obtenemos
// streamKey + url. OBS publica al url+streamKey, LiveKit forwards al room
// del show como participant. Los viewers ven el stream sin cambio en el
// frontend del LiveShow.
//
// Env vars requeridas:
//   LIVEKIT_API_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
//
// Si no están, devuelve 503 (función no disponible).

import { supabase } from '../lib/supabase.js';

let _ingressClient = null;

async function getIngressClient() {
  if (_ingressClient) return _ingressClient;
  if (!process.env.LIVEKIT_API_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return null;
  }
  try {
    const sdk = await import('livekit-server-sdk');
    // El export específico de IngressClient (varía por versión)
    const IngressClient = sdk.IngressClient || sdk.default?.IngressClient;
    if (!IngressClient) {
      console.warn('[rtmp] IngressClient no disponible en livekit-server-sdk');
      return null;
    }
    _ingressClient = new IngressClient(
      process.env.LIVEKIT_API_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    return _ingressClient;
  } catch (err) {
    console.warn('[rtmp] no se pudo cargar IngressClient:', err.message);
    return null;
  }
}

// POST /api/shows/:id/rtmp/enable — el creator activa RTMP
// Genera stream key + ingress url únicos para este show.
export const enableRtmp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: showId } = req.params;

    const { data: show } = await supabase
      .from('live_shows').select('host_id, status, livekit_room_name').eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== userId) return res.status(403).json({ error: 'Solo el host puede activar RTMP' });
    if (show.status === 'ended') return res.status(400).json({ error: 'Show ya terminó' });

    const ingress = await getIngressClient();
    if (!ingress) {
      return res.status(503).json({
        error: 'RTMP no configurado en este servidor',
        code: 'RTMP_UNAVAILABLE',
      });
    }

    // Crear ingress en LiveKit (input type 0 = RTMP_INPUT)
    let info;
    try {
      info = await ingress.createIngress(
        0, // RTMP_INPUT — usa constant si existe
        {
          name: `show-${showId}`,
          roomName: show.livekit_room_name || `show-${showId}`,
          participantIdentity: `host-${userId}-rtmp`,
          participantName: `RTMP Host`,
        },
      );
    } catch (err) {
      console.error('[rtmp] createIngress error:', err.message);
      return res.status(502).json({ error: 'No se pudo crear el ingress en LiveKit' });
    }

    const streamKey = info.streamKey || info.stream_key;
    const ingressUrl = info.url || info.ingress_url || process.env.RTMP_INGRESS_URL;

    await supabase.from('live_shows').update({
      rtmp_enabled: true,
      rtmp_stream_key: streamKey,
      rtmp_ingress_url: ingressUrl,
    }).eq('id', showId);

    res.json({
      success: true,
      stream_key: streamKey,
      ingress_url: ingressUrl,
      instructions: {
        obs: {
          service: 'Custom...',
          server: ingressUrl,
          stream_key: streamKey,
        },
      },
    });
  } catch (err) {
    console.error('[rtmp] enable error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/shows/:id/rtmp/disable
export const disableRtmp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: showId } = req.params;

    const { data: show } = await supabase
      .from('live_shows').select('host_id, rtmp_stream_key').eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    // Best-effort revoke en LiveKit
    const ingress = await getIngressClient();
    if (ingress && show.rtmp_stream_key) {
      try {
        // Find ingress by streamKey, delete
        const list = await ingress.listIngress({});
        const found = (list || []).find(i => (i.streamKey || i.stream_key) === show.rtmp_stream_key);
        if (found?.ingressId) await ingress.deleteIngress(found.ingressId);
      } catch (err) {
        console.warn('[rtmp] no se pudo borrar ingress:', err.message);
      }
    }

    await supabase.from('live_shows').update({
      rtmp_enabled: false,
      rtmp_stream_key: null,
      rtmp_ingress_url: null,
    }).eq('id', showId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/shows/:id/rtmp — leer credenciales (solo host)
export const getRtmpInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: showId } = req.params;

    const { data: show } = await supabase.from('live_shows')
      .select('host_id, rtmp_enabled, rtmp_stream_key, rtmp_ingress_url')
      .eq('id', showId).single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    res.json({
      enabled: !!show.rtmp_enabled,
      stream_key: show.rtmp_stream_key,
      ingress_url: show.rtmp_ingress_url,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
};
