// videoProcessingWorker.js — procesa jobs de captions (Whisper) y sprite thumbnails.
//
// Activación: feature_flag_whisper_captions + feature_flag_sprite_thumbnails en
// compliance_config. Default ambos en false.
//
// Requisitos:
//   - OPENAI_API_KEY para Whisper captions
//   - ffmpeg en PATH + fluent-ffmpeg npm i (para sprites)
//
// Llamado desde cleanup.js cada 5 min si los flags están on.

import { supabase } from '../lib/supabase.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const WORKER_ID = `vp-${os.hostname()}-${process.pid}`;
const MAX_RETRIES = 3;

let cachedFlags = null;
let cachedExpires = 0;

async function getFlags() {
  if (Date.now() < cachedExpires && cachedFlags) return cachedFlags;
  const { data } = await supabase
    .from('compliance_config')
    .select('key, value')
    .in('key', ['feature_flag_whisper_captions', 'feature_flag_sprite_thumbnails', 'whisper_max_minutes_per_day']);
  cachedFlags = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  cachedExpires = Date.now() + 60 * 1000;
  return cachedFlags;
}

async function downloadToTemp(url, prefix = 'vp') {
  const ext = url.split('.').pop().split('?')[0].slice(0, 4) || 'mp4';
  const tmp = path.join(os.tmpdir(), `${prefix}-${Date.now()}.${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  return tmp;
}

async function processWhisperJob(job) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

  let tmpFile = null;
  try {
    tmpFile = await downloadToTemp(job.source_url, 'wh');

    // Llamar OpenAI Whisper API
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(tmpFile)]), 'audio.mp4');
    form.append('model', 'whisper-1');
    form.append('response_format', 'vtt');
    form.append('language', 'es');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Whisper API ${res.status}`);
    const vttContent = await res.text();

    // Subir VTT a storage privado
    const { uploadFile } = await import('../lib/storageProvider.js');
    const storagePath = `captions/${job.video_id}-${Date.now()}.vtt`;
    const vttUrl = await uploadFile(storagePath, Buffer.from(vttContent, 'utf-8'), 'text/vtt');

    // Insertar caption
    await supabase.from('video_captions').insert({
      video_id: job.video_id,
      language: 'es', vtt_url: vttUrl, vtt_storage_path: storagePath,
      source: 'auto-whisper', is_default: true,
      generated_by_job: job.id,
    });

    return { output_url: vttUrl };
  } finally {
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function processSpriteJob(job) {
  const ffmpegMod = await import('fluent-ffmpeg').catch(() => null);
  if (!ffmpegMod) throw new Error('fluent-ffmpeg no instalado');
  const ffmpeg = ffmpegMod.default || ffmpegMod;

  let tmpIn = null, tmpOut = null;
  try {
    tmpIn = await downloadToTemp(job.source_url, 'sp');
    tmpOut = path.join(os.tmpdir(), `sprite-${Date.now()}.jpg`);

    // Genera 1 thumb cada 10s, layout en columnas (sprite sheet)
    await new Promise((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions([
          '-vf', 'fps=1/10,scale=160:90,tile=10x10',
          '-frames:v', '1',
        ])
        .save(tmpOut)
        .on('end', resolve)
        .on('error', reject);
    });

    const { uploadFile } = await import('../lib/storageProvider.js');
    const storagePath = `sprites/${job.video_id}-${Date.now()}.jpg`;
    const url = await uploadFile(storagePath, fs.readFileSync(tmpOut), 'image/jpeg');

    await supabase.from('profile_videos').update({
      sprite_url: url,
      sprite_interval_sec: 10,
      sprite_columns: 10,
    }).eq('id', job.video_id);

    return { output_url: url };
  } finally {
    [tmpIn, tmpOut].forEach(f => { if (f) try { fs.unlinkSync(f); } catch {} });
  }
}

async function processJob(job) {
  console.log(`[vp worker] processing ${job.kind} ${job.id}`);
  await supabase.from('video_processing_jobs').update({
    status: 'processing', worker_id: WORKER_ID, started_at: new Date().toISOString(),
  }).eq('id', job.id);

  try {
    let result;
    if (job.kind === 'whisper_captions')      result = await processWhisperJob(job);
    else if (job.kind === 'sprite_thumbnails') result = await processSpriteJob(job);
    else throw new Error(`Unknown kind: ${job.kind}`);

    await supabase.from('video_processing_jobs').update({
      status: 'done',
      output_url: result?.output_url || null,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    console.log(`[vp worker] done ${job.id}`);
  } catch (err) {
    const retries = (job.retries || 0) + 1;
    const fail = retries >= MAX_RETRIES;
    await supabase.from('video_processing_jobs').update({
      status: fail ? 'failed' : 'queued',
      retries,
      error: err.message?.slice(0, 1000),
    }).eq('id', job.id);
    console.error(`[vp worker] error ${job.id}: ${err.message} (retry ${retries}/${MAX_RETRIES})`);
  }
}

export async function runVideoProcessingTick() {
  const flags = await getFlags();
  const whisperOn = flags.feature_flag_whisper_captions === 'true';
  const spriteOn  = flags.feature_flag_sprite_thumbnails === 'true';
  if (!whisperOn && !spriteOn) return;

  let q = supabase.from('video_processing_jobs')
    .select('*').eq('status', 'queued')
    .order('enqueued_at', { ascending: true }).limit(1);
  if (!whisperOn) q = q.neq('kind', 'whisper_captions');
  if (!spriteOn)  q = q.neq('kind', 'sprite_thumbnails');

  const { data: jobs } = await q;
  if (jobs?.length) await processJob(jobs[0]);
}
