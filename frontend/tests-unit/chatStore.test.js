import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../src/store/chatStore.js';

beforeEach(() => {
  useChatStore.setState({
    messageCount: 0,
    remaining: 10,
    limit: 10,
    unreadTotal: 0,
  });
});

describe('chatStore', () => {
  it('state inicial', () => {
    const s = useChatStore.getState();
    expect(s.messageCount).toBe(0);
    expect(s.remaining).toBe(10);
    expect(s.limit).toBe(10);
    expect(s.unreadTotal).toBe(0);
  });

  it('setCount actualiza los tres campos relacionados', () => {
    useChatStore.getState().setCount({ count: 5, remaining: 5, limit: 20 });
    const s = useChatStore.getState();
    expect(s.messageCount).toBe(5);
    expect(s.remaining).toBe(5);
    expect(s.limit).toBe(20);
  });

  it('decrementRemaining baja en 1', () => {
    useChatStore.setState({ remaining: 3 });
    useChatStore.getState().decrementRemaining();
    expect(useChatStore.getState().remaining).toBe(2);
  });

  it('decrementRemaining nunca baja de 0', () => {
    useChatStore.setState({ remaining: 0 });
    useChatStore.getState().decrementRemaining();
    expect(useChatStore.getState().remaining).toBe(0);

    useChatStore.setState({ remaining: 1 });
    useChatStore.getState().decrementRemaining();
    useChatStore.getState().decrementRemaining();
    useChatStore.getState().decrementRemaining();
    expect(useChatStore.getState().remaining).toBe(0);
  });

  it('setUnreadTotal sobreescribe', () => {
    useChatStore.getState().setUnreadTotal(42);
    expect(useChatStore.getState().unreadTotal).toBe(42);
    useChatStore.getState().setUnreadTotal(0);
    expect(useChatStore.getState().unreadTotal).toBe(0);
  });

  it('incrementUnread suma 1', () => {
    useChatStore.getState().incrementUnread();
    useChatStore.getState().incrementUnread();
    useChatStore.getState().incrementUnread();
    expect(useChatStore.getState().unreadTotal).toBe(3);
  });

  it('clearUnread resetea a 0', () => {
    useChatStore.setState({ unreadTotal: 99 });
    useChatStore.getState().clearUnread();
    expect(useChatStore.getState().unreadTotal).toBe(0);
  });
});
