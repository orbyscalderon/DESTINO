// ────────────────────────────────────────────────────────────────────────────
// Genera todos los iconos de Android para Capacitor a partir de
// frontend/public/icon-512.png. Se ejecuta así:
//
//   node scripts/generate-android-icons.mjs
//
// Replaces:
//   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
//   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png
//   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png
//
// Densidades estándar Android (icono regular):
//   mdpi    48
//   hdpi    72
//   xhdpi   96
//   xxhdpi  144
//   xxxhdpi 192
//
// Foreground del adaptive icon = 108dp con safe area 66dp en el centro.
// Para que el corazón no quede cortado por la máscara adaptive (que recorta
// los bordes), insertamos el logo (escala 60%) sobre canvas transparente.
// ────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'public', 'icon-512.png');
const RES_DIR = join(here, '..', 'android', 'app', 'src', 'main', 'res');

const REGULAR_SIZES = {
  mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
};
const FOREGROUND_SIZES = {
  mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432,
};

async function regularIcon(size, outPath) {
  await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toFile(outPath);
}

async function roundIcon(size, outPath) {
  // Máscara circular: el launcher round es solo redondeado en algunos OEMs;
  // sharp aplica un canvas con alpha circular.
  const radius = size / 2;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/></svg>`
  );
  const resized = await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toBuffer();
  await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(outPath);
}

async function foregroundIcon(size, outPath) {
  // Adaptive icon foreground: canvas transparente con el logo al 60%
  // centrado en el safe area (66dp de 108dp). Sin background — el background
  // viene de @color/ic_launcher_background.
  const inner = Math.round(size * 0.6);
  const innerBuf = await sharp(SRC).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: innerBuf, top: offset, left: offset }])
    .png()
    .toFile(outPath);
}

async function run() {
  for (const [density, size] of Object.entries(REGULAR_SIZES)) {
    const dir = join(RES_DIR, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });
    await regularIcon(size, join(dir, 'ic_launcher.png'));
    await roundIcon(size, join(dir, 'ic_launcher_round.png'));
    await foregroundIcon(FOREGROUND_SIZES[density], join(dir, 'ic_launcher_foreground.png'));
    console.log(`✓ ${density} (${size}px regular, ${FOREGROUND_SIZES[density]}px foreground)`);
  }

  // playstore icon (1024x1024) — útil para la publicación
  const playstoreDir = join(RES_DIR, '..', '..', '..');
  await sharp(SRC).resize(1024, 1024, { fit: 'cover' }).png().toFile(join(playstoreDir, 'ic_launcher-playstore.png'));
  console.log(`✓ playstore icon (1024px)`);

  // iOS AppIcon — Xcode 14+ acepta un único PNG 1024x1024 universal
  const iosIconDir = join(here, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  try {
    await sharp(SRC).resize(1024, 1024, { fit: 'cover' }).png().toFile(join(iosIconDir, 'AppIcon-512@2x.png'));
    console.log(`✓ iOS AppIcon (1024px)`);
  } catch {
    // Si no hay carpeta ios/ (proyecto solo Android) lo saltamos sin ruido.
  }
}

run().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
