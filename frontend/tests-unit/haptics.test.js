import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Capacitor antes de importar haptics
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

import { Capacitor } from '@capacitor/core';
import { hapticImpact, hapticNotification } from '../src/lib/haptics.js';

describe('haptics en web (no nativo)', () => {
  beforeEach(() => {
    Capacitor.isNativePlatform.mockReturnValue(false);
  });

  it('hapticImpact no-op sin error cuando no es nativo', async () => {
    await expect(hapticImpact('Heavy')).resolves.toBeUndefined();
  });

  it('hapticNotification no-op sin error cuando no es nativo', async () => {
    await expect(hapticNotification('Warning')).resolves.toBeUndefined();
  });

  it('valores defaults aceptados', async () => {
    await expect(hapticImpact()).resolves.toBeUndefined();
    await expect(hapticNotification()).resolves.toBeUndefined();
  });

  it('estilos arbitrarios no causan crash', async () => {
    await expect(hapticImpact('Light')).resolves.toBeUndefined();
    await expect(hapticImpact('Medium')).resolves.toBeUndefined();
    await expect(hapticNotification('Success')).resolves.toBeUndefined();
    await expect(hapticNotification('Error')).resolves.toBeUndefined();
  });
});
