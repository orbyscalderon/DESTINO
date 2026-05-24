import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';
import api from './api.js';

export class LiveKitSession {
  constructor(roomName) {
    this.roomName           = roomName;
    this.room               = new Room();
    this.onReconnecting     = null;
    this.onReconnected      = null;
    this.onFailed           = null;
    this.onRemoteTrack      = null; // (track: RemoteTrack) => void
    this.onParticipantLeft  = null; // () => void
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

    await this.room.connect(data.wsUrl, data.token);

    // Deliver tracks already present (late joiner)
    this.room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (pub.track && pub.isSubscribed) {
          this.onRemoteTrack?.(pub.track);
        }
      });
    });
  }

  async publishStream(stream) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (audioTrack) {
      await this.room.localParticipant.publishTrack(audioTrack);
    }
    if (videoTrack) {
      await this.room.localParticipant.publishTrack(videoTrack, { simulcast: true });
    }
  }

  setMic(enabled) {
    this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  setCam(enabled) {
    this.room.localParticipant.setCameraEnabled(enabled);
  }

  async replaceVideoTrack(newTrack) {
    const pub = Array.from(this.room.localParticipant.trackPublications.values())
      .find(p => p.kind === Track.Kind.Video);
    if (pub?.track) await pub.track.replaceTrack(newTrack);
  }

  async replaceAudioTrack(newTrack) {
    const pub = Array.from(this.room.localParticipant.trackPublications.values())
      .find(p => p.kind === Track.Kind.Audio);
    if (pub?.track) await pub.track.replaceTrack(newTrack);
  }

  async leave() {
    await this.room.disconnect();
  }
}
