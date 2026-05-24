import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';
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
    this.onParticipantLeft = null;
    this.onLocalVideo      = null;
  }

  async join(canPublish = true) {
    const { data } = await api.post('/api/livekit/token', {
      roomName:   this.roomName,
      canPublish,
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Reconnecting) this.onReconnecting?.();
      if (state === ConnectionState.Connected)    this.onReconnected?.();
      // Only fire onFailed on unexpected disconnect, not on intentional leave
      if (state === ConnectionState.Disconnected && !this._leaving) this.onFailed?.();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      this.onRemoteTrack?.(track);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      this.onParticipantLeft?.();
    });

    this.room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
        this.onLocalVideo?.(pub.track.mediaStreamTrack);
      }
    });

    await this.room.connect(data.wsUrl, data.token);

    if (canPublish) {
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
          this.onRemoteTrack?.(pub.track);
        }
      });
    });
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

  async leave() {
    this._leaving = true;
    await this.room.disconnect();
  }
}
