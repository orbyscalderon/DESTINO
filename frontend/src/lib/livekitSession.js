import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';
import api from './api.js';

export class LiveKitSession {
  constructor(roomName) {
    this.roomName          = roomName;
    this.room              = new Room();
    this.onReconnecting    = null;
    this.onReconnected     = null;
    this.onFailed          = null;
    this.onRemoteTrack     = null; // (track: RemoteTrack) => void
    this.onParticipantLeft = null; // () => void
    this.onLocalVideo      = null; // (mediaStreamTrack) => void — local camera preview
  }

  async join(canPublish = true) {
    const { data } = await api.post('/api/livekit/token', {
      roomName:   this.roomName,
      canPublish,
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Reconnecting) this.onReconnecting?.();
      if (state === ConnectionState.Connected)    this.onReconnected?.();
      if (state === ConnectionState.Disconnected) this.onFailed?.();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      this.onRemoteTrack?.(track);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      this.onParticipantLeft?.();
    });

    // Notify when local camera track is published so the preview can show it
    this.room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
        this.onLocalVideo?.(pub.track.mediaStreamTrack);
      }
    });

    await this.room.connect(data.wsUrl, data.token);

    if (canPublish) {
      // Let LiveKit manage track creation — avoids raw-track simulcast failures
      await this.room.localParticipant.setMicrophoneEnabled(true);
      await this.room.localParticipant.setCameraEnabled(true);

      // Provide local video track immediately if already published
      const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track?.mediaStreamTrack) {
        this.onLocalVideo?.(camPub.track.mediaStreamTrack);
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
    this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  setCam(enabled) {
    this.room.localParticipant.setCameraEnabled(enabled);
  }

  async switchCamera(deviceId) {
    await this.room.switchActiveDevice('videoinput', deviceId);
  }

  async leave() {
    await this.room.disconnect();
  }
}
