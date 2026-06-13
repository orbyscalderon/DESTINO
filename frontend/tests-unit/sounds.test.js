import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSoundsEnabled,
  setSoundsEnabled,
  playWhoosh,
  playPop,
  playDing,
  playClick,
  playSuccess,
  playError,
} from '../src/lib/sounds.js';

// Mock localStorage en jsdom
const storage = new Map();
const localStorageMock = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', localStorageMock);
  // Stub AudioContext con un mock que captura calls
  const oscillatorMock = {
    type: '',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gainMock = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
  };
  vi.stubGlobal('AudioContext', vi.fn(() => ({
    state: 'running',
    currentTime: 0,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => oscillatorMock),
    createGain: vi.fn(() => gainMock),
    destination: {},
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isSoundsEnabled / setSoundsEnabled', () => {
  it('por defecto está deshabilitado', () => {
    expect(isSoundsEnabled()).toBe(false);
  });
  it('setSoundsEnabled(true) lo activa', () => {
    setSoundsEnabled(true);
    expect(isSoundsEnabled()).toBe(true);
  });
  it('setSoundsEnabled(false) lo desactiva', () => {
    setSoundsEnabled(true);
    setSoundsEnabled(false);
    expect(isSoundsEnabled()).toBe(false);
  });
  it('persiste el flag con la key correcta', () => {
    setSoundsEnabled(true);
    expect(localStorage.getItem('destino_sounds_enabled')).toBe('1');
    setSoundsEnabled(false);
    expect(localStorage.getItem('destino_sounds_enabled')).toBe('0');
  });
});

describe('play functions cuando está deshabilitado', () => {
  it('todos los play son no-ops sin crash', () => {
    expect(() => {
      playWhoosh();
      playPop();
      playDing();
      playClick();
      playSuccess();
      playError();
    }).not.toThrow();
  });
});

describe('play functions cuando está habilitado', () => {
  beforeEach(() => {
    setSoundsEnabled(true);
  });
  it('playWhoosh ejecuta sin error', () => {
    expect(() => playWhoosh()).not.toThrow();
  });
  it('playPop ejecuta sin error', () => {
    expect(() => playPop()).not.toThrow();
  });
  it('playDing ejecuta sin error', () => {
    expect(() => playDing()).not.toThrow();
  });
  it('playSuccess ejecuta sin error', () => {
    expect(() => playSuccess()).not.toThrow();
  });
  it('playError ejecuta sin error', () => {
    expect(() => playError()).not.toThrow();
  });
});

describe('sin AudioContext (browsers viejos)', () => {
  it('no rompe si AudioContext no existe', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    setSoundsEnabled(true);
    expect(() => {
      playWhoosh();
      playPop();
      playDing();
    }).not.toThrow();
  });
});
