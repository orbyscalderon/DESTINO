import { Capacitor } from '@capacitor/core';

// IDs de prueba de Google — reemplaza con los reales en producción
const TEST_IDS = {
  banner:       'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded:     'ca-app-pub-3940256099942544/5224354917',
};

// IDs reales desde las variables de entorno
const PROD_IDS = {
  banner:       import.meta.env.VITE_ADMOB_BANNER_ID,
  interstitial: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID,
  rewarded:     import.meta.env.VITE_ADMOB_REWARDED_ID,
};

// Usar TEST_IDS si las variables de entorno no están configuradas
const adId = (type) => PROD_IDS[type] || TEST_IDS[type];

const isNative = () => Capacitor.isNativePlatform();

let AdMob = null;
let BannerAdSize, BannerAdPosition, AdLoadInfo;

async function loadPlugin() {
  if (!isNative() || AdMob) return;
  try {
    const mod = await import('@capacitor-community/admob');
    AdMob = mod.AdMob;
    BannerAdSize = mod.BannerAdSize;
    BannerAdPosition = mod.BannerAdPosition;
    AdLoadInfo = mod.AdLoadInfo;
  } catch {
    // Plugin no instalado — ignorar
  }
}

export async function initAdMob() {
  if (!isNative()) return;
  await loadPlugin();
  if (!AdMob) return;
  try {
    await AdMob.initialize({ initializeForTesting: !PROD_IDS.banner });
  } catch {}
}

export async function showBanner() {
  if (!isNative()) return;
  await loadPlugin();
  if (!AdMob) return;
  try {
    await AdMob.showBanner({
      adId: adId('banner'),
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: !PROD_IDS.banner,
    });
  } catch {}
}

export async function hideBanner() {
  if (!isNative()) return;
  await loadPlugin();
  if (!AdMob) return;
  try {
    await AdMob.hideBanner();
  } catch {}
}

export async function removeBanner() {
  if (!isNative()) return;
  await loadPlugin();
  if (!AdMob) return;
  try {
    await AdMob.removeBanner();
  } catch {}
}

// Retorna { amount, type } si el usuario vio el anuncio completo, o null si no
export async function showRewardedAd() {
  if (!isNative()) return null;
  await loadPlugin();
  if (!AdMob) return null;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: adId('rewarded'),
      isTesting: !PROD_IDS.rewarded,
    });
    const reward = await AdMob.showRewardVideoAd();
    return reward ?? null;
  } catch {
    return null;
  }
}

export async function showInterstitial() {
  if (!isNative()) return;
  await loadPlugin();
  if (!AdMob) return;
  try {
    await AdMob.prepareInterstitial({
      adId: adId('interstitial'),
      isTesting: !PROD_IDS.interstitial,
    });
    await AdMob.showInterstitial();
  } catch {}
}
