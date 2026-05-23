import mediasoup from 'mediasoup';

const MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

let worker = null;
const rooms = new Map(); // roomId → Room

// ── Peer ─────────────────────────────────────────────────────────────────────
class Peer {
  constructor(id, router) {
    this.id = id;
    this.router = router;
    this.transports = new Map();   // transportId → WebRtcTransport
    this.producers  = new Map();   // producerId  → Producer
    this.consumers  = new Map();   // consumerId  → Consumer
  }

  async createTransport() {
    const listenIps = [{
      ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
    }];

    const transport = await this.router.createWebRtcTransport({
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 800_000,
    });

    this.transports.set(transport.id, transport);
    return {
      id: transport.id,
      iceParameters:   transport.iceParameters,
      iceCandidates:   transport.iceCandidates,
      dtlsParameters:  transport.dtlsParameters,
      sctpParameters:  transport.sctpParameters,
    };
  }

  async connectTransport(transportId, dtlsParameters) {
    const t = this.transports.get(transportId);
    if (!t) throw new Error(`Transport ${transportId} not found`);
    await t.connect({ dtlsParameters });
  }

  async produce(transportId, kind, rtpParameters) {
    const t = this.transports.get(transportId);
    if (!t) throw new Error(`Transport ${transportId} not found`);
    const producer = await t.produce({ kind, rtpParameters });
    this.producers.set(producer.id, producer);
    producer.on('transportclose', () => this.producers.delete(producer.id));
    return producer;
  }

  async consume(transportId, producerId, rtpCapabilities) {
    const t = this.transports.get(transportId);
    if (!t) throw new Error(`Transport ${transportId} not found`);

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId}`);
    }

    const consumer = await t.consume({ producerId, rtpCapabilities, paused: false });
    this.consumers.set(consumer.id, consumer);
    consumer.on('transportclose', () => this.consumers.delete(consumer.id));
    return consumer;
  }

  close() {
    for (const t of this.transports.values()) t.close();
    for (const p of this.producers.values())  p.close();
    for (const c of this.consumers.values())  c.close();
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}

// ── Room ─────────────────────────────────────────────────────────────────────
class Room {
  constructor(router) {
    this.router = router;
    this.peers  = new Map(); // peerId → Peer
  }

  getOrCreatePeer(peerId) {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, new Peer(peerId, this.router));
    }
    return this.peers.get(peerId);
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
  }

  // All active producers except from excludePeerId
  getProducers(excludePeerId = null) {
    const list = [];
    for (const [peerId, peer] of this.peers) {
      if (peerId === excludePeerId) continue;
      for (const producer of peer.producers.values()) {
        if (!producer.closed) {
          list.push({ producerId: producer.id, peerId, kind: producer.kind });
        }
      }
    }
    return list;
  }

  get isEmpty() { return this.peers.size === 0; }
  get rtpCapabilities() { return this.router.rtpCapabilities; }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function initMediasoup() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '40000'),
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '49999'),
  });

  worker.on('died', (err) => {
    console.error('mediasoup worker died:', err.message);
    setTimeout(initMediasoup, 2000);
  });

  console.log('✅ mediasoup worker ready');
}

export async function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    if (!worker) throw new Error('mediasoup not initialized');
    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    rooms.set(roomId, new Room(router));
  }
  return rooms.get(roomId);
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    room.router.close();
    rooms.delete(roomId);
  }
}
