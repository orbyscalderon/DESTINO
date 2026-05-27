/**
 * videoProvider — abstracción de LiveKit
 *
 * HOY:    LiveKit Cloud (un solo nodo)
 *           LIVEKIT_URL=wss://Destino TV-e7a9u6cp.livekit.cloud
 *           LIVEKIT_API_KEY=...
 *           LIVEKIT_API_SECRET=...
 *
 * MIGRAR: LiveKit self-hosted en Vultr (múltiples nodos)
 *         Solo agrega estas variables — las anteriores se convierten en fallback:
 *           LIVEKIT_URL_LATAM=wss://livekit-sp.destino.app
 *           LIVEKIT_KEY_LATAM=...
 *           LIVEKIT_SECRET_LATAM=...
 *
 *           LIVEKIT_URL_US=wss://livekit-la.destino.app
 *           LIVEKIT_KEY_US=...
 *           LIVEKIT_SECRET_US=...
 *
 *           LIVEKIT_URL_EUROPA=wss://livekit-mad.destino.app
 *           LIVEKIT_KEY_EUROPA=...
 *           LIVEKIT_SECRET_EUROPA=...
 *
 *           LIVEKIT_URL_ASIA=wss://livekit-sg.destino.app   (opcional fase 2)
 *           LIVEKIT_URL_OCEANIA=wss://livekit-syd.destino.app (opcional fase 3)
 */

import { AccessToken } from 'livekit-server-sdk';

// País → nodo
const COUNTRY_NODE = {
  // USA + Centro América → US
  US: 'us', CA: 'us', MX: 'us', GT: 'us', BZ: 'us', SV: 'us',
  HN: 'us', NI: 'us', CR: 'us', PA: 'us', CU: 'us', DO: 'us',
  PR: 'us', JM: 'us', HT: 'us', TT: 'us',

  // Europa + España → europa
  ES: 'europa', PT: 'europa', FR: 'europa', DE: 'europa', IT: 'europa',
  GB: 'europa', NL: 'europa', BE: 'europa', CH: 'europa', AT: 'europa',
  PL: 'europa', SE: 'europa', NO: 'europa', DK: 'europa', FI: 'europa',
  RU: 'europa', UA: 'europa', RO: 'europa', CZ: 'europa', GR: 'europa',

  // Asia → asia (fase 2)
  JP: 'asia', KR: 'asia', CN: 'asia', TW: 'asia', HK: 'asia',
  SG: 'asia', MY: 'asia', TH: 'asia', PH: 'asia', ID: 'asia',
  VN: 'asia', IN: 'asia', PK: 'asia', BD: 'asia',

  // Oceanía → oceania (fase 3)
  AU: 'oceania', NZ: 'oceania',

  // Todo lo demás (LATAM, África, Medio Oriente) → latam
};

function getNode(country) {
  const nodes = {
    latam:   { url: process.env.LIVEKIT_URL_LATAM,   key: process.env.LIVEKIT_KEY_LATAM,   secret: process.env.LIVEKIT_SECRET_LATAM },
    us:      { url: process.env.LIVEKIT_URL_US,       key: process.env.LIVEKIT_KEY_US,       secret: process.env.LIVEKIT_SECRET_US },
    europa:  { url: process.env.LIVEKIT_URL_EUROPA,   key: process.env.LIVEKIT_KEY_EUROPA,   secret: process.env.LIVEKIT_SECRET_EUROPA },
    asia:    { url: process.env.LIVEKIT_URL_ASIA,     key: process.env.LIVEKIT_KEY_ASIA,     secret: process.env.LIVEKIT_SECRET_ASIA },
    oceania: { url: process.env.LIVEKIT_URL_OCEANIA,  key: process.env.LIVEKIT_KEY_OCEANIA,  secret: process.env.LIVEKIT_SECRET_OCEANIA },
  };

  const nodeKey = COUNTRY_NODE[country] || 'latam';
  const node = nodes[nodeKey];

  // Si el nodo regional no está configurado, cae al nodo único (LiveKit Cloud)
  if (!node?.url) {
    return {
      url:    process.env.LIVEKIT_URL,
      key:    process.env.LIVEKIT_API_KEY,
      secret: process.env.LIVEKIT_API_SECRET,
    };
  }

  return node;
}

/**
 * Genera un token JWT de LiveKit para unirse a una sala.
 * @param {string} userId      ID del usuario (identity)
 * @param {string} roomName    Nombre de la sala
 * @param {object} opts
 * @param {boolean} opts.canPublish  Puede publicar video/audio (default true)
 * @param {string}  opts.country     País del usuario para elegir nodo (default latam)
 * @param {string}  opts.ttl         Tiempo de vida del token (default '2h')
 * @returns {Promise<{ token: string, wsUrl: string }>}
 */
export async function createToken(userId, roomName, { canPublish = true, country = null, ttl = '2h' } = {}) {
  const node = getNode(country);

  if (!node.key || !node.secret) {
    throw new Error('LiveKit no configurado — verifica LIVEKIT_API_KEY y LIVEKIT_API_SECRET');
  }

  const at = new AccessToken(node.key, node.secret, { identity: userId, ttl });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: !!canPublish, canSubscribe: true });

  const token = await at.toJwt();
  return { token, wsUrl: node.url };
}
