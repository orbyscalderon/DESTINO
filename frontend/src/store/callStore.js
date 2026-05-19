import { create } from 'zustand';

export const useCallStore = create((set) => ({
  callStatus: 'idle', // 'idle' | 'ringing' | 'calling' | 'connected'
  incomingCall: null,
  activeCall: null,

  setRinging: (call) => set({ callStatus: 'ringing', incomingCall: call, activeCall: null }),
  setCalling: (call) => set({ callStatus: 'calling', activeCall: call, incomingCall: null }),
  setConnected: () => set({ callStatus: 'connected' }),
  resetCall: () => set({ callStatus: 'idle', incomingCall: null, activeCall: null }),
}));
