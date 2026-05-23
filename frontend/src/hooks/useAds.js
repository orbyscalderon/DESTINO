import { useRef, useCallback } from 'react';
import { showInterstitial, showBanner, removeBanner } from '../lib/admob.js';
import { useAuthStore } from '../store/authStore.js';

const AD_INTERVAL = 5; // mostrar intersticial cada N acciones

/**
 * Hook para gestionar anuncios en usuarios gratuitos.
 * Solo actúa en plataforma nativa (Capacitor). En web es no-op.
 */
export function useAds() {
  const { profile } = useAuthStore();
  const actionCount = useRef(0);

  // Usuarios premium no ven anuncios
  const isAdFree = profile?.is_premium;

  const trackAction = useCallback(async () => {
    if (isAdFree) return;
    actionCount.current += 1;
    if (actionCount.current % AD_INTERVAL === 0) {
      await showInterstitial();
    }
  }, [isAdFree]);

  const showBottomBanner = useCallback(async () => {
    if (isAdFree) return;
    await showBanner();
  }, [isAdFree]);

  const hideBottomBanner = useCallback(async () => {
    await removeBanner();
  }, []);

  return { trackAction, showBottomBanner, hideBottomBanner };
}
