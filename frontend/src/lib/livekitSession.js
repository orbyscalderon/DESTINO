import {
  Room, RoomEvent, Track, ConnectionState, VideoQuality,
  VideoPresets, AudioPresets,
} from 'livekit-client';
import api from './api.js';

// ── Defaults de captura y publish ──────────────────────────────────────────
//
// Objetivo: la mejor calidad posible compatible con dispositivos típicos +
// degradación automática para conexiones malas (dynacast + adaptiveStream
// + simulcast).
//
// Por qué cada cosa:
// · videoCaptureDefaults 1080p@30 — la mayoría de cámaras de laptop y celular
//   modernos capturan 1080p sin problema. Si el dispositivo no soporta, el
//   browser cae automáticamente al máximo disponible.
// · simulcast=true + 3 layers (h180/h540/h1080) — el SFU envía la layer que
//   cada viewer pide según su tile size. Un viewer en battle (tile pequeño)
//   recibe h180, un viewer full-screen recibe h1080. Esencial para no quemar
//   bandwidth.
// · videoCodec='vp9' con backupCodec vp8 — VP9 da ~30% mejor calidad al
//   mismo bitrate que VP8. Safari iOS soporta VP8 pero no VP9; el backupCodec
//   automatiza el fallback.
// · videoEncoding maxBitrate 5 Mbps — estándar Twitch/YouTube para 1080p30.
//   El default LiveKit es 1.7 Mbps que se ve como YouTube de 2012.
// · audioPreset musicHighQuality (64 kbps stereo) — el default es 24 kbps mono.
//   Para shows con música/conversaciones suena mucho mejor.
// · dtx: discontinuous transmission del audio — ahorra ~50% bitrate cuando
//   nadie habla sin afectar calidad.
// · red: redundancia de audio — mantiene calidad aunque se pierdan paquetes
//   (típico en redes móviles).

const VIDEO_CAPTURE_DEFAULTS = {
  resolution: VideoPresets.h1080.resolution, // 1920x1080 @ 30fps
};

// Simulcast layers — el host publica 3 streams en paralelo (low/med/high).
// Cada viewer subscribe a la layer adecuada según su DOM size.
const SIMULCAST_LAYERS = [VideoPresets.h180, VideoPresets.h540];

// Encoding del publish — 5 Mbps @ 1080p30, equivalente a la calidad recomendada
// de Twitch para streaming HD.
const HIGH_QUALITY_ENCODING = {
  maxBitrate: 5_000_000, // 5 Mbps
  maxFramerate: 30,
  priority: 'high',
};

function buildPublishDefaults() {
  return {
    simulcast: true,
    videoSimulcastLayers: SIMULCAST_LAYERS,
    videoCodec: 'vp9',           // mejor compresión que VP8
    backupCodec: { codec: 'vp8', encoding: VideoPresets.h720.encoding },
    videoEncoding: HIGH_QUALITY_ENCODING,
    audioPreset: AudioPresets.musicHighQuality, // 64 kbps stereo
    dtx: true,
    red: true,
    stopMicTrackOnMute: false, // mantiene el track vivo al mutear (reconexión instantánea)
  };
}

export class LiveKitSession {
  constructor(roomName) {
    this.roomName          = roomName;
    this.room              = new Room({
      videoCaptureDefaults: VIDEO_CAPTURE_DEFAULTS,
      publishDefaults: buildPublishDefaults(),
      // Mejora el flujo de reconexión y reduce el "freezing" en conexiones
      // intermitentes
      reconnectPolicy: { nextRetryDelayInMs: () => 2000 },
    });
    this._leaving          = false;
    this.onReconnecting    = null;
    this.onReconnected     = null;
    this.onFailed          = null;
    this.onRemoteTrack     = null;
    this.onRemoteTrackEnded = null;
    this.onParticipantLeft = null;
    this.onLocalVideo      = null;
    this.onRemoteMuteChange = null;
  }

  async join(canPublish = true, { skipAutoMedia = false } = {}) {
    const { data } = await api.post('/api/livekit/token', {
      roomName:   this.roomName,
      canPublish,
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Reconnecting) this.onReconnecting?.();
      if (state === ConnectionState.Connected)    this.onReconnected?.();
      if (state === ConnectionState.Disconnected && !this._leaving) this.onFailed?.();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      // Por defecto subscribe a HIGH para video. Con adaptiveStream activo,
      // si el elemento DOM es pequeño LiveKit baja a MEDIUM/LOW automáticamente,
      // pero pedir HIGH explícito garantiza la mejor calidad cuando el viewer
      // mira full-screen.
      if (track.kind === Track.Kind.Video && pub?.setVideoQuality) {
        pub.setVideoQuality(VideoQuality.HIGH);
      }
      this.onRemoteTrack?.(track, participant);
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      this.onRemoteTrackEnded?.(track, participant);
    });

    this.room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (!participant?.isLocal) {
        this.onRemoteMuteChange?.(pub.kind, true, participant);
      }
    });
    this.room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (!participant?.isLocal) {
        this.onRemoteMuteChange?.(pub.kind, false, participant);
      }
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.onParticipantLeft?.(participant);
    });

    this.room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
        this.onLocalVideo?.(pub.track.mediaStreamTrack);
      }
    });

    await this.room.connect(data.wsUrl, data.token, {
      // dynacast: SFU baja la layer enviada a viewers según su tile size.
      // adaptiveStream: el cliente local sube/baja qué layer pide según su DOM.
      // Ambos combinados ahorran ~70% bandwidth sin afectar calidad percibida.
      dynacast: true,
      adaptiveStream: true,
    });

    if (canPublish && !skipAutoMedia) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        console.warn('No se pudo activar el micrófono:', e);
      }
      try {
        // setCameraEnabled usa los videoCaptureDefaults del Room (1080p) y
        // los publishDefaults (simulcast + VP9). No hace falta especificar
        // resolution aquí — el Room ya las tiene.
        await this.room.localParticipant.setCameraEnabled(true);
        const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track?.mediaStreamTrack) {
          this.onLocalVideo?.(camPub.track.mediaStreamTrack);
        }
      } catch (e) {
        console.warn('No se pudo activar la cámara:', e);
      }
    }

    this.room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (pub.track && pub.isSubscribed) {
          this.onRemoteTrack?.(pub.track, participant);
        }
      });
    });
  }

  // Publish tracks from a pre-acquired MediaStream — usado en shows donde el
  // host ya capturó la cámara con sus propios constraints (filtros, virtual
  // background, etc). Mantiene simulcast y bitrate HD.
  async publishStream(stream) {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    if (audioTrack) {
      try {
        await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.Microphone,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: true,
          red: true,
        });
      } catch (e) { console.warn('No se pudo publicar audio:', e); }
    }
    if (videoTrack) {
      try {
        await this.room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.Camera,
          // Simulcast TRUE — antes era false. El SFU ahora envía 3 layers
          // y cada viewer subscribe a la que corresponde a su tile size.
          simulcast: true,
          videoSimulcastLayers: SIMULCAST_LAYERS,
          videoCodec: 'vp9',
          backupCodec: { codec: 'vp8', encoding: VideoPresets.h720.encoding },
          videoEncoding: HIGH_QUALITY_ENCODING,
        });
        this.onLocalVideo?.(videoTrack);
      } catch (e) { console.warn('No se pudo publicar video:', e); }
    }
  }

  async replaceVideoTrack(mediaStreamTrack) {
    const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (camPub?.track) {
      await camPub.track.replaceTrack(mediaStreamTrack);
      this.onLocalVideo?.(mediaStreamTrack);
    }
  }

  async replaceAudioTrack(mediaStreamTrack) {
    const micPub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (micPub?.track) {
      await micPub.track.replaceTrack(mediaStreamTrack);
    }
  }

  setMic(enabled) {
    this.room.localParticipant.setMicrophoneEnabled(enabled).catch(() => {});
  }

  setCam(enabled) {
    this.room.localParticipant.setCameraEnabled(enabled).catch(() => {});
  }

  async switchCamera(deviceId) {
    await this.room.switchActiveDevice('videoinput', deviceId);
  }

  getLocalVideoTrack() {
    const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    return camPub?.track?.mediaStreamTrack ?? null;
  }

  async leave() {
    this._leaving = true;
    await this.room.disconnect();
  }
}

// Helper para que ShowStudio / LiveShow puedan llamar getUserMedia con los
// mismos constraints high-quality que LiveKit aplica internamente.
// Las "ideal" + "max" hints permiten que el browser elija la mejor calidad
// que el hardware soporta sin fallar si no llega a 1080p.
export const HQ_VIDEO_CONSTRAINTS = {
  width:     { ideal: 1920, max: 1920 },
  height:    { ideal: 1080, max: 1080 },
  frameRate: { ideal: 30,   max: 60 },
  // Sugiere al browser pedir la cámara con menor latencia (no siempre se respeta)
  // y desactivar zoom/exposure que dan resultados raros en algunos drivers.
};

// Audio constraints HQ: estéreo, sample rate alto, AGC + noise suppression + echo
// cancellation activos. mantienen calidad sin artefactos en conversaciones.
export const HQ_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl:  true,
  sampleRate:       48000,
  sampleSize:       16,
  channelCount:     2,
};
