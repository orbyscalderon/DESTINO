import { Room, RoomEvent, Track, ConnectionState, VideoQuality } from 'livekit-client';
import api from './api.js';

export class LiveKitSession {
  constructor(roomName) {
    this.roomName          = roomName;
    this.room              = new Room();
    this._leaving          = false; // prevents onFailed from firing on intentional disconnect
    this.onReconnecting    = null;
    this.onReconnected     = null;
    this.onFailed          = null;
    this.onRemoteTrack     = null;
    this.onRemoteTrackEnded = null;
    this.onParticipantLeft = null;
    this.onLocalVideo      = null;
    this.onRemoteMuteChange = null; // (kind, muted, participant) — para indicadores UI
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
      // Solicitar calidad máxima para video de shows/llamadas
      if (track.kind === Track.Kind.Video && pub?.setVideoQuality) {
        pub.setVideoQuality(VideoQuality.High);
      }
      this.onRemoteTrack?.(track, participant);
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      this.onRemoteTrackEnded?.(track, participant);
    });

    // Indicadores de mute remoto (mic/cam off del partner)
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

    // dynacast: true → el SFU baja la calidad enviada al viewer según su
    // viewport/bandwidth. Esencial para móviles con conexión limitada o
    // viewers con tiles pequeños (battles, cohosts) que no necesitan HD.
    // Reduce buffering en ~70% sin sacrificar calidad de quien mira full screen.
    await this.room.connect(data.wsUrl, data.token, {
      dynacast: true,
      adaptiveStream: true, // ajusta resolución suscrita según tamaño DOM
    });

    if (canPublish && !skipAutoMedia) {
      // Wrap separately so a camera/mic permission error doesn't kill the whole call
      try {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        console.warn('No se pudo activar el micrófono:', e);
      }
      try {
        await this.room.localParticipant.setCameraEnabled(true);
        const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track?.mediaStreamTrack) {
          this.onLocalVideo?.(camPub.track.mediaStreamTrack);
        }
      } catch (e) {
        console.warn('No se pudo activar la cámara:', e);
      }
    }

    // Deliver tracks already present (late joiner)
    this.room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (pub.track && pub.isSubscribed) {
          this.onRemoteTrack?.(pub.track, participant);
        }
      });
    });
  }

  // Publish tracks from a pre-acquired MediaStream (shows — host controls device/quality)
  async publishStream(stream) {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    if (audioTrack) {
      try {
        await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.Microphone,
        });
      } catch (e) { console.warn('No se pudo publicar audio:', e); }
    }
    if (videoTrack) {
      try {
        await this.room.localParticipant.publishTrack(videoTrack, {
          source:    Track.Source.Camera,
          simulcast: false,
          videoEncoding: {
            maxBitrate:  2_500_000, // 2.5 Mbps para calidad HD
            maxFramerate: 30,
          },
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
