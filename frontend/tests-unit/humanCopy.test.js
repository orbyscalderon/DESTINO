import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  timeAwareGreeting,
  smartTime,
  loadingMessage,
  humanizeError,
  randomCheer,
} from '../src/lib/humanCopy.js';

describe('timeAwareGreeting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns "Madrugando" antes de las 6am', () => {
    vi.setSystemTime(new Date('2026-06-13T04:30:00'));
    expect(timeAwareGreeting()).toBe('Madrugando');
  });
  it('"Buenos días" entre 6 y 12', () => {
    vi.setSystemTime(new Date('2026-06-13T09:00:00'));
    expect(timeAwareGreeting()).toBe('Buenos días');
  });
  it('"Buenas tardes" entre 12 y 19', () => {
    vi.setSystemTime(new Date('2026-06-13T15:00:00'));
    expect(timeAwareGreeting()).toBe('Buenas tardes');
  });
  it('"Buenas noches" después de las 19', () => {
    vi.setSystemTime(new Date('2026-06-13T22:00:00'));
    expect(timeAwareGreeting()).toBe('Buenas noches');
  });
  it('agrega el nombre cuando se provee', () => {
    vi.setSystemTime(new Date('2026-06-13T09:00:00'));
    expect(timeAwareGreeting('Orbys')).toBe('Buenos días, Orbys');
  });
});

describe('smartTime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('devuelve "" para input vacío', () => {
    expect(smartTime(null)).toBe('');
    expect(smartTime(undefined)).toBe('');
    expect(smartTime('')).toBe('');
  });
  it('devuelve "" para fecha inválida', () => {
    expect(smartTime('not-a-date')).toBe('');
  });
  it('"ahora" cuando hace menos de 1 min', () => {
    vi.setSystemTime(new Date('2026-06-13T12:00:30'));
    expect(smartTime(new Date('2026-06-13T12:00:00'))).toBe('ahora');
  });
  it('formato min cuando hace 1-59 min', () => {
    vi.setSystemTime(new Date('2026-06-13T12:30:00'));
    expect(smartTime(new Date('2026-06-13T12:15:00'))).toBe('hace 15 min');
  });
  it('formato horas cuando hace <24h', () => {
    vi.setSystemTime(new Date('2026-06-13T18:00:00'));
    expect(smartTime(new Date('2026-06-13T10:00:00'))).toBe('hace 8h');
  });
  it('"ayer" cuando fue exactamente 1 día atrás', () => {
    vi.setSystemTime(new Date('2026-06-13T12:00:00'));
    expect(smartTime(new Date('2026-06-12T12:00:00'))).toBe('ayer');
  });
});

describe('humanizeError', () => {
  it('maneja status 401 como unauthorized', () => {
    const err = { response: { status: 401 } };
    expect(humanizeError(err)).toMatch(/sesión/i);
  });
  it('maneja status 403 como forbidden', () => {
    expect(humanizeError({ response: { status: 403 } })).toMatch(/permiso/i);
  });
  it('maneja status 429 como rate limit', () => {
    expect(humanizeError({ response: { status: 429 } })).toMatch(/despacio/i);
  });
  it('maneja status 500+ como server error', () => {
    expect(humanizeError({ response: { status: 500 } })).toMatch(/rompió/i);
    expect(humanizeError({ response: { status: 503 } })).toMatch(/rompió/i);
  });
  it('código INSUFFICIENT_COINS prioriza sobre status', () => {
    const err = { response: { status: 400, data: { code: 'INSUFFICIENT_COINS' } } };
    expect(humanizeError(err)).toMatch(/coins/i);
  });
  it('GEO_BLOCKED o 451 dan mensaje regional', () => {
    expect(humanizeError({ response: { status: 451 } })).toMatch(/región/i);
    expect(humanizeError({ response: { status: 400, data: { code: 'GEO_BLOCKED' } } })).toMatch(/región/i);
  });
  it('mensajes de error de network', () => {
    expect(humanizeError({ message: 'Network Error' })).toMatch(/conexión/i);
  });
  it('mensaje custom del backend si es corto', () => {
    const err = { response: { data: { error: 'Email ya registrado' } } };
    expect(humanizeError(err)).toBe('Email ya registrado');
  });
  it('fallback genérico para errores desconocidos', () => {
    expect(humanizeError({})).toMatch(/algo salió mal/i);
  });
});

describe('loadingMessage', () => {
  it('devuelve uno de los 5 mensajes predefinidos', () => {
    const valid = ['Cargando…', 'Un momento…', 'Ya casi…', 'Casi listo…', 'Procesando…'];
    for (let i = 0; i < 20; i++) {
      expect(valid).toContain(loadingMessage());
    }
  });
});

describe('randomCheer', () => {
  it('devuelve un cheer no vacío', () => {
    for (let i = 0; i < 20; i++) {
      const c = randomCheer();
      expect(c).toBeTruthy();
      expect(c.length).toBeGreaterThan(0);
    }
  });
});
