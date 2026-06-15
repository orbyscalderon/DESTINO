// Upload a Supabase Storage (bucket 'encuentros-photos').
// Strip EXIF + resize cover (sharp) antes de subir — protege identidad del modelo
// (sin GPS coords, sin device info que pueda usarse para doxxing).

import sharp from 'sharp';
import crypto from 'crypto';
import { supabase } from './supabase.js';

const BUCKET = process.env.ENCUENTROS_STORAGE_BUCKET || 'encuentros-photos';

export async function processAndUploadPhoto({ buffer, mimetype, listing_id }) {
  // Reject if not image
  if (!/^image\/(jpe?g|png|webp)$/.test(mimetype)) {
    throw new Error('Formato no soportado (jpeg/png/webp)');
  }
  // Strip EXIF + resize + convert to webp
  const processed = await sharp(buffer)
    .rotate()                    // auto-rotate basado en EXIF, luego strip
    .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const thumbnail = await sharp(buffer)
    .rotate()
    .resize({ width: 400, height: 533, fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();

  const id = crypto.randomBytes(8).toString('hex');
  const path = `${listing_id}/${Date.now()}_${id}.webp`;
  const thumbPath = `${listing_id}/thumb_${Date.now()}_${id}.webp`;

  const { error: e1 } = await supabase.storage.from(BUCKET)
    .upload(path, processed, { contentType: 'image/webp', upsert: false });
  if (e1) throw e1;

  const { error: e2 } = await supabase.storage.from(BUCKET)
    .upload(thumbPath, thumbnail, { contentType: 'image/webp', upsert: false });
  if (e2) throw e2;

  const { data: { publicUrl: url } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const { data: { publicUrl: thumbnail_url } } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath);
  return { url, thumbnail_url };
}
