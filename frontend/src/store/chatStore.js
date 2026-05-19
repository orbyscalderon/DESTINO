import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  messageCount: 0,
  remaining: 10,
  limit: 10,
  unreadTotal: 0,

  setCount: ({ count, remaining, limit }) => set({ messageCount: count, remaining, limit }),
  decrementRemaining: () => set(s => ({ remaining: Math.max(0, s.remaining - 1) })),
  setUnreadTotal: (total) => set({ unreadTotal: total }),
  incrementUnread: () => set(s => ({ unreadTotal: s.unreadTotal + 1 })),
  clearUnread: () => set({ unreadTotal: 0 }),
}));
