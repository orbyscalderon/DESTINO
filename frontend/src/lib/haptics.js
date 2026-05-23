import { Capacitor } from '@capacitor/core';

let _haptics = null;

async function getHaptics() {
  if (!Capacitor.isNativePlatform()) return null;
  if (_haptics) return _haptics;
  try {
    const mod = await import('@capacitor/haptics');
    _haptics = mod.Haptics;
    return _haptics;
  } catch {
    return null;
  }
}

export async function hapticImpact(style = 'Medium') {
  const h = await getHaptics();
  if (!h) return;
  try {
    await h.impact({ style: h.ImpactStyle?.[style] ?? style });
  } catch {}
}

export async function hapticNotification(type = 'Success') {
  const h = await getHaptics();
  if (!h) return;
  try {
    await h.notification({ type: h.NotificationType?.[type] ?? type });
  } catch {}
}
