import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock del módulo api antes de importar geolocation
vi.mock('../src/lib/api.js', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import api from '../src/lib/api.js';
import { formatDistance, refreshLocationIfStale, requestAndSaveLocation } from '../src/lib/geolocation.js';

describe('formatDistance', () => {
  it('null o undefined devuelve null', () => {
    expect(formatDistance(null)).toBe(null);
    expect(formatDistance(undefined)).toBe(null);
  });
  it('"Aquí mismo" cuando km < 1', () => {
    expect(formatDistance(0)).toBe('Aquí mismo');
    expect(formatDistance(0.5)).toBe('Aquí mismo');
    expect(formatDistance(0.99)).toBe('Aquí mismo');
  });
  it('redondea a entero cuando 1 <= km < 100', () => {
    expect(formatDistance(1)).toBe('1 km');
    expect(formatDistance(5.4)).toBe('5 km');
    expect(formatDistance(5.6)).toBe('6 km');
    expect(formatDistance(99.4)).toBe('99 km');
  });
  it('redondea a decena con "+" cuando km >= 100', () => {
    expect(formatDistance(100)).toBe('100+ km');
    expect(formatDistance(104)).toBe('100+ km');
    expect(formatDistance(106)).toBe('110+ km');
    expect(formatDistance(1234)).toBe('1230+ km');
  });
});

describe('refreshLocationIfStale', () => {
  const storage = new Map();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    });
    vi.stubGlobal('navigator', { geolocation: undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('devuelve cached si existe y es fresh', async () => {
    storage.set('destino_last_geo', JSON.stringify({
      latitude: 10, longitude: -20, ts: Date.now() - 1000,
    }));
    const result = await refreshLocationIfStale();
    expect(result).toEqual({ latitude: 10, longitude: -20, ts: expect.any(Number) });
  });
  it('si cache es viejo, intenta refresh (sin geolocation devuelve error)', async () => {
    storage.set('destino_last_geo', JSON.stringify({
      latitude: 10, longitude: -20, ts: Date.now() - (48 * 60 * 60 * 1000),
    }));
    const result = await refreshLocationIfStale();
    expect(result.error).toBe('geolocation_not_supported');
  });
  it('si no hay cache, intenta refresh', async () => {
    const result = await refreshLocationIfStale();
    expect(result.error).toBe('geolocation_not_supported');
  });
  it('localStorage corrupto se trata como no-cache', async () => {
    storage.set('destino_last_geo', 'not-json{');
    const result = await refreshLocationIfStale();
    expect(result.error).toBe('geolocation_not_supported');
  });
  it('respeta maxAgeMs custom', async () => {
    storage.set('destino_last_geo', JSON.stringify({
      latitude: 10, longitude: -20, ts: Date.now() - 5000,
    }));
    // 1 segundo de stale-tolerance: el cache de 5s es stale
    const result = await refreshLocationIfStale(1000);
    expect(result.error).toBe('geolocation_not_supported');
  });
});

describe('requestAndSaveLocation', () => {
  const storage = new Map();
  beforeEach(() => {
    storage.clear();
    api.post.mockClear();
    vi.stubGlobal('localStorage', {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin geolocation API devuelve error', async () => {
    vi.stubGlobal('navigator', { geolocation: undefined });
    const result = await requestAndSaveLocation();
    expect(result).toEqual({ error: 'geolocation_not_supported' });
  });

  it('éxito: posta al backend y persiste en localStorage', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success) => {
          success({ coords: { latitude: 18.5, longitude: -69.9 } });
        },
      },
    });
    const result = await requestAndSaveLocation();
    expect(result).toEqual({ latitude: 18.5, longitude: -69.9 });
    expect(api.post).toHaveBeenCalledWith('/api/profiles/location', { latitude: 18.5, longitude: -69.9 });
    const cached = JSON.parse(storage.get('destino_last_geo'));
    expect(cached.latitude).toBe(18.5);
    expect(cached.longitude).toBe(-69.9);
  });

  it('user denied: error "denied"', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success, error) => {
          error({ code: 1, message: 'User denied' });
        },
      },
    });
    const result = await requestAndSaveLocation();
    expect(result).toEqual({ error: 'denied' });
  });

  it('otros errores: "unavailable"', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success, error) => {
          error({ code: 3, message: 'Timeout' });
        },
      },
    });
    const result = await requestAndSaveLocation();
    expect(result).toEqual({ error: 'unavailable' });
  });

  it('backend falla pero geolocation OK: devuelve coords + save_error', async () => {
    api.post.mockRejectedValueOnce(new Error('500'));
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success) => {
          success({ coords: { latitude: 1, longitude: 2 } });
        },
      },
    });
    const result = await requestAndSaveLocation();
    expect(result).toEqual({ latitude: 1, longitude: 2, save_error: true });
  });
});
