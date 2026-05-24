import { Device } from 'mediasoup-client';
import api from './api.js';

const MAX_RETRIES     = 4;
const RETRY_BASE_MS   = 1500;

export class RtcSession {
  constructor(roomId) {
    this.roomId              = roomId;
    this.device              = new Device();
    this.sendTransport       = null;
    this.recvTransport       = null;
    this.producers           = { audio: null, video: null };
    this.consumers           = new Map();
    this.consumedProducerIds = new Set();
    this._retries            = 0;
    this._localStream        = null;
    this.onReconnecting      = null;
    this.onReconnected       = null;
    this.onFailed            = null;
  }

  async init() {
    const { data } = await api.get(`/api/rtc/rooms/${this.roomId}/capabilities`);
    if (!this.device.loaded) {
      await this.device.load({ routerRtpCapabilities: data.rtpCapabilities });
    }
  }

  _watchTransport(transport) {
    transport.on('connectionstatechange', (state) => {
      if (state === 'failed' || state === 'disconnected') {
        this._scheduleReconnect();
      }
    });
  }

  _scheduleReconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true;
    this.onReconnecting?.();
    const delay = Math.min(RETRY_BASE_MS * 2 ** this._retries, 16000);
    setTimeout(() => this._doReconnect(), delay);
  }

  async _doReconnect() {
    this._reconnecting = false;
    if (this._retries >= MAX_RETRIES) { this.onFailed?.(); return; }
    this._retries++;
    try {
      // Close stale transports without calling leave (server room still exists)
      this.producers.audio?.close();
      this.producers.video?.close();
      for (const c of this.consumers.values()) c.close();
      this.sendTransport?.close();
      this.recvTransport?.close();
      this.sendTransport       = null;
      this.recvTransport       = null;
      this.producers           = { audio: null, video: null };
      this.consumers           = new Map();
      this.consumedProducerIds = new Set();

      await this.init();
      if (this._localStream) await this.publishStream(this._localStream);
      await this.consumeAll();
      this._retries = 0;
      this.onReconnected?.();
    } catch {
      this._scheduleReconnect();
    }
  }

  async _ensureSendTransport() {
    if (this.sendTransport) return;

    const { data } = await api.post(`/api/rtc/rooms/${this.roomId}/transport`);
    const { iceServers, ...transportParams } = data;

    this.sendTransport = this.device.createSendTransport({
      ...transportParams,
      iceServers: iceServers || [],
    });
    this._watchTransport(this.sendTransport);

    this.sendTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
      api.post(`/api/rtc/rooms/${this.roomId}/transport/${this.sendTransport.id}/connect`, { dtlsParameters })
        .then(cb).catch(eb);
    });

    this.sendTransport.on('produce', ({ kind, rtpParameters }, cb, eb) => {
      api.post(`/api/rtc/rooms/${this.roomId}/transport/${this.sendTransport.id}/produce`, { kind, rtpParameters })
        .then(({ data }) => cb({ id: data.id }))
        .catch(eb);
    });
  }

  async _ensureRecvTransport() {
    if (this.recvTransport) return;

    const { data } = await api.post(`/api/rtc/rooms/${this.roomId}/transport`);
    const { iceServers, ...transportParams } = data;

    this.recvTransport = this.device.createRecvTransport({
      ...transportParams,
      iceServers: iceServers || [],
    });
    this._watchTransport(this.recvTransport);

    this.recvTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
      api.post(`/api/rtc/rooms/${this.roomId}/transport/${this.recvTransport.id}/connect`, { dtlsParameters })
        .then(cb).catch(eb);
    });
  }

  async publishStream(stream) {
    this._localStream = stream;
    await this._ensureSendTransport();

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack) {
      this.producers.audio = await this.sendTransport.produce({ track: audioTrack });
    }
    if (videoTrack) {
      this.producers.video = await this.sendTransport.produce({
        track: videoTrack,
        encodings: [
          { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
          { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
          { maxBitrate: 900_000, scaleResolutionDownBy: 1 },
        ],
        codecOptions: { videoGoogleStartBitrate: 1000 },
      });
    }
  }

  // ── Consume a single producer ───────────────────────────────────────────────
  async consumeProducer(producerId) {
    if (this.consumedProducerIds.has(producerId)) return null;
    this.consumedProducerIds.add(producerId);

    await this._ensureRecvTransport();

    const { data } = await api.post(`/api/rtc/rooms/${this.roomId}/consume`, {
      transportId:    this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume({
      id:            data.id,
      producerId:    data.producerId,
      kind:          data.kind,
      rtpParameters: data.rtpParameters,
    });

    this.consumers.set(consumer.id, consumer);
    return { track: consumer.track, kind: data.kind, consumerId: consumer.id };
  }

  // ── Consume all existing producers in the room ──────────────────────────────
  async consumeAll() {
    const { data } = await api.get(`/api/rtc/rooms/${this.roomId}/producers`);
    const tracks = { audio: null, video: null };
    for (const { producerId, kind } of data.producers) {
      const result = await this.consumeProducer(producerId);
      if (result) tracks[kind] = result.track; // null = already consumed, skip
    }
    return tracks; // { audio: MediaStreamTrack|null, video: MediaStreamTrack|null }
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  setMic(enabled) {
    if (this.producers.audio?.track) {
      this.producers.audio.track.enabled = enabled;
    }
  }

  setCam(enabled) {
    if (this.producers.video?.track) {
      this.producers.video.track.enabled = enabled;
    }
  }

  async replaceVideoTrack(track) {
    if (this.producers.video) {
      await this.producers.video.replaceTrack({ track });
    }
  }

  async replaceAudioTrack(track) {
    if (this.producers.audio) {
      await this.producers.audio.replaceTrack({ track });
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  async leave() {
    this.producers.audio?.close();
    this.producers.video?.close();
    for (const c of this.consumers.values()) c.close();
    this.sendTransport?.close();
    this.recvTransport?.close();
    await api.delete(`/api/rtc/rooms/${this.roomId}/leave`).catch(() => {});
  }
}
