// FFmpeg worker para watermark server-side.
//
// Procesa jobs de la tabla `watermark_jobs`. Cada job descarga el video original,
// le quema un overlay con `watermark_text` (típicamente "@username · UUID6") en
// las esquinas, y sube el resultado a storage privado.
//
// Requisitos:
//   - ffmpeg en PATH (Railway: añadir `nixpacks.toml` con `nixPkgs = ["ffmpeg"]`,
//     o usar Dockerfile con `apk add ffmpeg` / `apt install ffmpeg`)
//   - Paquetes npm: fluent-ffmpeg (instalar con `npm i fluent-ffmpeg`)
//
// Levantar el worker:
//   node backend/src/workers/watermarkWorker.js
//   o como proceso separado en Railway (railway.json → services → workers)

import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const WORKER_ID = `wm-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

let ffmpegLib = null;
async function getFfmpeg() {
  if (ffmpegLib) return ffmpegLib;
  try {
    const mod = await import('fluent-ffmpeg');
    ffmpegLib = mod.default || mod;
    return ffmpegLib;
  } catch (err) {
    console.error('[watermark worker] fluent-ffmpeg no instalado. Run: npm i fluent-ffmpeg');
    throw err;
  }
}

async function downloadToTemp(url) {
  const tmpIn = path.join(os.tmpdir(), `wm-in-${Date.now()}.mp4`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmpIn));
  return tmpIn;
}

async function applyWatermark(inputPath, watermarkText) {
  const ffmpeg = await getFfmpeg();
  const outPath = path.join(os.tmpdir(), `wm-out-${Date.now()}.mp4`);
  const escaped = watermarkText.replace(/['\\:]/g, c => `\\${c}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter([
        // 4 esquinas + diagonal centro semi-transparente (anti-screen-record)
        `drawtext=text='${escaped}':fontcolor=white@0.5:fontsize=18:x=10:y=10`,
        `drawtext=text='${escaped}':fontcolor=white@0.5:fontsize=18:x=w-tw-10:y=10`,
        `drawtext=text='${escaped}':fontcolor=white@0.5:fontsize=18:x=10:y=h-th-10`,
        `drawtext=text='${escaped}':fontcolor=white@0.5:fontsize=18:x=w-tw-10:y=h-th-10`,
        `drawtext=text='${escaped}':fontcolor=white@0.15:fontsize=36:x=(w-tw)/2:y=(h-th)/2`,
      ])
      .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a copy'])
      .save(outPath)
      .on('end', () => resolve(outPath))
      .on('error', reject);
  });
}

async function processJob(job) {
  console.log(`[wm worker] processing ${job.id}`);
  await supabase.from('watermark_jobs').update({
    status: 'processing',
    worker_id: WORKER_ID,
    started_at: new Date().toISOString(),
  }).eq('id', job.id);

  let tmpIn = null, tmpOut = null;
  try {
    tmpIn  = await downloadToTemp(job.source_url);
    tmpOut = await applyWatermark(tmpIn, job.watermark_text);

    const buf = fs.readFileSync(tmpOut);
    const storagePath = `watermarked/${job.source_video_id || job.id}-${Date.now()}.mp4`;
    const url = await uploadFile(storagePath, buf, 'video/mp4');

    await supabase.from('watermark_jobs').update({
      status: 'done',
      output_url: url,
      output_path: storagePath,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);

    if (job.source_video_id) {
      await supabase.from('profile_videos')
        .update({ watermarked_url: url })
        .eq('id', job.source_video_id)
        .catch(() => {});
    }

    console.log(`[wm worker] done ${job.id} → ${url}`);
  } catch (err) {
    const retries = (job.retries || 0) + 1;
    const fail = retries >= MAX_RETRIES;
    await supabase.from('watermark_jobs').update({
      status: fail ? 'failed' : 'queued',
      retries,
      error: err.message?.slice(0, 1000),
    }).eq('id', job.id);
    console.error(`[wm worker] error ${job.id}: ${err.message} (retry ${retries}/${MAX_RETRIES})`);
  } finally {
    [tmpIn, tmpOut].forEach(f => { if (f) try { fs.unlinkSync(f); } catch {} });
  }
}

async function pollOnce() {
  const { data: jobs } = await supabase
    .from('watermark_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('enqueued_at', { ascending: true })
    .limit(1);
  if (jobs?.length) await processJob(jobs[0]);
}

export async function startWorker() {
  console.log(`[wm worker] starting ${WORKER_ID}`);
  while (true) {
    try { await pollOnce(); } catch (err) { console.error('[wm worker] poll error:', err.message); }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
