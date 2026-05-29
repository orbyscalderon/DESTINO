import api from './api.js';

export async function requestAndSaveLocation() {
  if (!navigator.geolocation) {
    return { error: 'geolocation_not_supported' };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        try {
          await api.post('/api/profiles/location', { latitude, longitude });
          localStorage.setItem('destino_last_geo', JSON.stringify({ latitude, longitude, ts: Date.now() }));
          resolve({ latitude, longitude });
        } catch {
          resolve({ latitude, longitude, save_error: true });
        }
      },
      (err) => {
        resolve({ error: err.code === 1 ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

export async function refreshLocationIfStale(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const cached = JSON.parse(localStorage.getItem('destino_last_geo') || 'null');
    if (cached && Date.now() - cached.ts < maxAgeMs) return cached;
  } catch {}
  return requestAndSaveLocation();
}

export function formatDistance(km) {
  if (km == null) return null;
  if (km < 1) return 'Aquí mismo';
  if (km < 100) return `${Math.round(km)} km`;
  return `${Math.round(km / 10) * 10}+ km`;
}
