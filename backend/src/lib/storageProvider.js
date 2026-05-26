/**
 * storageProvider — abstracción de almacenamiento de archivos
 *
 * HOY:    Supabase Storage (PROVIDER=supabase o sin configurar)
 * MIGRAR: Backblaze B2 + BunnyCDN (PROVIDER=backblaze)
 *         Solo cambia estas variables de entorno:
 *           STORAGE_PROVIDER=backblaze
 *           B2_KEY_ID=...
 *           B2_APP_KEY=...
 *           B2_BUCKET_ID=...
 *           B2_BUCKET_NAME=...
 *           BUNNYCDN_URL=https://destino.b-cdn.net
 */

import { supabase } from './supabase.js';

const PROVIDER = process.env.STORAGE_PROVIDER || 'supabase';
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'DESTINO';

// ── Supabase Storage ──────────────────────────────────────────

async function supabaseUpload(path, buffer, contentType) {
  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function supabaseDelete(paths) {
  const arr = Array.isArray(paths) ? paths : [paths];
  await supabase.storage.from(SUPABASE_BUCKET).remove(arr);
}

function supabasePublicUrl(path) {
  return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Backblaze B2 + BunnyCDN ───────────────────────────────────
// Se activa cuando STORAGE_PROVIDER=backblaze

async function b2Upload(path, buffer, contentType) {
  const B2 = await import('@backblaze-b2/b2').then(m => m.default || m).catch(() => null);
  if (!B2) throw new Error('Instala @backblaze-b2/b2 para usar Backblaze');

  const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey:   process.env.B2_APP_KEY,
  });
  await b2.authorize();
  const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
    bucketId: process.env.B2_BUCKET_ID,
  });
  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName:        path,
    data:            buffer,
    mime:            contentType,
  });
  const cdnBase = (process.env.BUNNYCDN_URL || '').replace(/\/$/, '');
  return `${cdnBase}/${path}`;
}

async function b2Delete(paths) {
  // B2 requiere fileId para borrar — en migración se puede omitir o implementar
  // con un índice path→fileId en la DB. Por ahora es no-op seguro.
  console.warn('[storageProvider] b2Delete: implementar con fileId cuando migres');
}

function b2PublicUrl(path) {
  const cdnBase = (process.env.BUNNYCDN_URL || '').replace(/\/$/, '');
  return `${cdnBase}/${path}`;
}

// ── API pública ───────────────────────────────────────────────

/**
 * Sube un archivo y devuelve la URL pública.
 * @param {string} path        Ruta dentro del bucket, ej: "avatars/userId"
 * @param {Buffer} buffer      Contenido del archivo
 * @param {string} contentType MIME type, ej: "image/jpeg"
 * @returns {Promise<string>}  URL pública
 */
export async function uploadFile(path, buffer, contentType) {
  return PROVIDER === 'backblaze'
    ? b2Upload(path, buffer, contentType)
    : supabaseUpload(path, buffer, contentType);
}

/**
 * Elimina uno o varios archivos.
 * @param {string|string[]} paths
 */
export async function deleteFile(paths) {
  return PROVIDER === 'backblaze'
    ? b2Delete(paths)
    : supabaseDelete(paths);
}

/**
 * Devuelve la URL pública de un archivo sin subirlo.
 * @param {string} path
 * @returns {string}
 */
export function getPublicUrl(path) {
  return PROVIDER === 'backblaze'
    ? b2PublicUrl(path)
    : supabasePublicUrl(path);
}
