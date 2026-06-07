// rtmpController.js — Generación de stream key + ingress URL para que
// creators usen OBS Studio en lugar de la cámara del navegador.
//
// HOY (LiveKit Cloud):
//   · LIVEKIT_URL=wss://destino-xyz.livekit.cloud
//   · LIVEKIT_API_KEY=APIxxxx
//   · LIVEKIT_API_SECRET=secretxxxx
//   · Ingress incluido — solo activar en cloud.livekit.io → Settings → Ingress
//
// MAÑANA (self-hosted Vultr — plan de migración):
//   · LIVEKIT_URL_LATAM=wss://livekit-sp.destino.app
//   · LIVEKIT_URL_US=wss://livekit-la.destino.app
//   · etc por región
//   · Necesita servicio livekit-ingress paralelo al livekit-server (docs/RTMP_SETUP.md)
//   · El código se autoadapta — usa videoProvider.getNode(country) para elegir nodo
//
// Si no hay env vars de LiveKit, devuelve 503 (función no disponible).

import { supabase } from '../lib/supabase.js';

// Cache de clients por nodo (cloud o región)
const _ingressClients = new Map();

// Carga credenciales para un show: si el host tiene country setteado y hay
// nodo regional configurado, usa ese; si no, cae a LIVEKIT_URL global (Cloud).
async function getCredentialsForShow(showId) {
  // Resolver país del host
  const { data: show } = await supabase
    .from('live_shows')
    .select('host_id, host:profiles!host_id(country)')
    .eq('id', showId).single();

  const country = show?.host?.country || null;

  // Misma abstracción que videoProvider.js — reusa el patrón
  const COUNTRY_NODE = {
    US: 'us', CA: 'us', MX: 'us', GT: 'us', BZ: 'us', SV: 'us', HN: 'us',
    NI: 'us', CR: 'us', PA: 'us', CU: 'us', DO: 'us', PR: 'us', JM: 'us', HT: 'us', TT: 'us',
    ES: 'europa', PT: 'europa', FR: 'europa', DE: 'europa', IT: 'europa',
    GB: 'europa', NL: 'europa', BE: 'europa', CH: 'europa', AT: 'europa',
    PL: 'europa', SE: 'europa', NO: 'europa', DK: 'europa', FI: 'europa',
    RU: 'europa', UA: 'europa', RO: 'europa', CZ: 'europa', GR: 'europa',
    JP: 'asia', KR: 'asia', CN: 'asia', TW: 'asia', HK: 'asia',
    SG: 'asia', MY: 'asia', TH: 'asia', PH: 'asia', ID: 'asia',
    VN: 'asia', IN: 'asia', PK: 'asia', BD: 'asia',
    AU: 'oceania', NZ: 'oceania',
  };
  const nodeKey = COUNTRY_NODE[country] || 'latam';

  const regional = {
    url: process.env[`LIVEKIT_URL_${nodeKey.toUpperCase()}`],
    key: process.env[`LIVEKIT_KEY_${nodeKey.toUpperCase()}`],
    secret: process.env[`LIVEKIT_SECRET_${nodeKey.toUpperCase()}`],
  };

  if (regional.url && regional.key && regional.secret) {
    return { ...regional, nodeKey };
  }

  // Fallback: LiveKit Cloud (single-node, env vars LIVEKIT_URL/API_KEY/API_SECRET)
  return {
    url:    process.env.LIVEKIT_URL,
    key:    process.env.LIVEKIT_API_KEY,
    secret: process.env.LIVEKIT_API_SECRET,
    nodeKey: 'cloud',
  };
}

async function getIngressClient(creds) {
  if (!creds.url || !creds.key || !creds.secret) return null;

  const cacheKey = `${creds.url}|${creds.key}`;
  if (_ingressClients.has(cacheKey)) return _ingressClients.get(cacheKey);

  try {
    const sdk = await import('livekit-server-sdk');
    const IngressClient = sdk.IngressClient || sdk.default?.IngressClient;
    if (!IngressClient) {
      console.warn('[rtmp] IngressClient no disponible en livekit-server-sdk');
      return null;
    }
    const client = new IngressClient(creds.url, creds.key, creds.secret);
    _ingressClients.set(cacheKey, client);
    return client;
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

    const creds = await getCredentialsForShow(showId);
    const ingress = await getIngressClient(creds);
    if (!ingress) {
      return res.status(503).json({
        error: 'RTMP no configurado en este servidor. Revisa LIVEKIT_URL/API_KEY/API_SECRET.',
        code: 'RTMP_UNAVAILABLE',
      });
    }

    // Crear ingress en LiveKit (input type 0 = RTMP_INPUT)
    let info;
    try {
      info = await ingress.createIngress(
        0, // RTMP_INPUT
        {
          name: `show-${showId}`,
          roomName: show.livekit_room_name || `show-${showId}`,
          participantIdentity: `host-${userId}-rtmp`,
          participantName: `RTMP Host`,
        },
      );
    } catch (err) {
      console.error('[rtmp] createIngress error:', err.message);
      return res.status(502).json({ error: 'No se pudo crear el ingress en LiveKit. ¿Ingress habilitado en tu plan/instance?' });
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
      node: creds.nodeKey,  // 'cloud' o 'latam'/'us'/etc cuando self-hosted
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

    // Best-effort revoke en LiveKit (mismo nodo donde se creó)
    const creds = await getCredentialsForShow(showId);
    const ingress = await getIngressClient(creds);
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
