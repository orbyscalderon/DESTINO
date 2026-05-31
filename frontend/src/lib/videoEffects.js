// Procesador de efectos de video en tiempo real:
//   - 'none':    passthrough (sin overhead)
//   - 'blur':    background blur con MediaPipe Selfie Segmentation
//   - 'beauty':  suavizado + brillo/saturación sutil (canvas filter)
//
// Uso:
//   const fx = new VideoEffectProcessor();
//   const outStream = await fx.process(inputStream, 'blur');
//   // luego: livekitSession.replaceVideoTrack(outStream.getVideoTracks()[0])
//   fx.setEffect('none'); // cambia en vivo
//   fx.stop();             // libera todo
//
// Notas:
// - El primer uso de blur descarga ~5MB de WASM + modelo (lazy).
// - Si MediaPipe falla en cargar (red lenta, browser viejo), cae a 'none'.

let segmenterPromise = null;

async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const resolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    return await ImageSegmenter.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  })();
  return segmenterPromise;
}

export class VideoEffectProcessor {
  constructor() {
    this.effect = 'none';
    this.video = null;       // <video> source
    this.outCanvas = null;   // <canvas> output
    this.outCtx = null;
    this.maskCanvas = null;  // helper para componer la máscara
    this.maskCtx = null;
    this.outStream = null;
    this.raf = null;
    this.running = false;
    this.segmenter = null;
    this.inputTrack = null;
  }

  isSupported() {
    return typeof OffscreenCanvas !== 'undefined' || typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  setEffect(effect) {
    this.effect = ['none', 'blur', 'beauty'].includes(effect) ? effect : 'none';
  }

  async process(inputStream, initialEffect = 'none') {
    this.effect = initialEffect;
    this.inputTrack = inputStream.getVideoTracks()[0];
    if (!this.inputTrack) return inputStream;

    const settings = this.inputTrack.getSettings();
    const w = settings.width  || 1280;
    const h = settings.height || 720;

    // Video source element para feed
    this.video = document.createElement('video');
    this.video.srcObject = new MediaStream([this.inputTrack]);
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play().catch(() => {});

    this.outCanvas = document.createElement('canvas');
    this.outCanvas.width = w;
    this.outCanvas.height = h;
    this.outCtx = this.outCanvas.getContext('2d', { willReadFrequently: false });

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = w;
    this.maskCanvas.height = h;
    this.maskCtx = this.maskCanvas.getContext('2d');

    // Dibujar primer frame (passthrough) ANTES de captureStream para que el
    // track de video tenga frames cuando se publique a LiveKit
    try { this.outCtx.drawImage(this.video, 0, 0, w, h); } catch {}

    // Stream de salida — FPS del input (típico 30)
    this.outStream = this.outCanvas.captureStream(30);

    // No bloquear esperando MediaPipe. Si effect es 'blur', el modelo se carga
    // en _loop() y mientras tanto se hace passthrough.
    this.running = true;
    this._loop();
    return this.outStream;
  }

  async _loop() {
    if (!this.running) return;
    if (this.video.readyState < 2) { this.raf = requestAnimationFrame(() => this._loop()); return; }

    const w = this.outCanvas.width;
    const h = this.outCanvas.height;

    try {
      if (this.effect === 'none') {
        this.outCtx.filter = 'none';
        this.outCtx.drawImage(this.video, 0, 0, w, h);
      } else if (this.effect === 'beauty') {
        // Suavizado de piel + brillo/saturación suave. CSS filter es GPU-aceleeado.
        this.outCtx.filter = 'brightness(1.05) contrast(1.03) saturate(1.10) blur(0.5px)';
        this.outCtx.drawImage(this.video, 0, 0, w, h);
        this.outCtx.filter = 'none';
      } else if (this.effect === 'blur') {
        // Si segmenter aún no listo, hacer passthrough Y disparar carga lazy
        if (!this.segmenter && !this._loadingSegmenter) {
          this._loadingSegmenter = true;
          getSegmenter()
            .then(s => { this.segmenter = s; })
            .catch(() => { this.effect = 'none'; })
            .finally(() => { this._loadingSegmenter = false; });
        }
        if (!this.segmenter) {
          // Passthrough mientras MediaPipe carga
          this.outCtx.filter = 'none';
          this.outCtx.drawImage(this.video, 0, 0, w, h);
        } else {
          // 1) Background blureado en outCanvas
          this.outCtx.filter = 'blur(14px) brightness(0.95)';
          this.outCtx.drawImage(this.video, 0, 0, w, h);
          this.outCtx.filter = 'none';

          // 2) Persona segmentada → dibujar SIN blur encima usando la máscara
          const result = this.segmenter.segmentForVideo(this.video, performance.now());
          const mask = result.categoryMask; // MPMask
          if (mask) {
            const maskData = mask.getAsUint8Array();
            // Pasar máscara a canvas como imagen alpha
            const tempImg = this.maskCtx.createImageData(mask.width, mask.height);
            for (let i = 0; i < maskData.length; i++) {
              const alpha = maskData[i] === 0 ? 255 : 0; // 0 = persona en MediaPipe Selfie
              const j = i * 4;
              tempImg.data[j]   = 255;
              tempImg.data[j+1] = 255;
              tempImg.data[j+2] = 255;
              tempImg.data[j+3] = alpha;
            }
            this.maskCtx.putImageData(tempImg, 0, 0);
            mask.close?.();

            // Componer: persona del video original (sin blur) recortada por máscara
            this.outCtx.save();
            this.outCtx.globalCompositeOperation = 'source-over';
            // Solo dibujar donde la máscara es opaca
            this.outCtx.drawImage(this.maskCanvas, 0, 0, w, h);
            this.outCtx.globalCompositeOperation = 'source-in';
            this.outCtx.drawImage(this.video, 0, 0, w, h);
            this.outCtx.restore();
          }
        }
      }
    } catch (err) {
      // En caso de error frame-a-frame, no romper el loop entero
      console.warn('videoEffects loop error:', err.message);
    }

    this.raf = requestAnimationFrame(() => this._loop());
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.video) {
      try { this.video.pause(); this.video.srcObject = null; } catch {}
      this.video = null;
    }
    if (this.outStream) {
      this.outStream.getTracks().forEach(t => t.stop());
      this.outStream = null;
    }
    this.outCanvas = null;
    this.outCtx = null;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.inputTrack = null;
  }
}

// Helpers de UI: efectos disponibles para mostrar como botones
export const VIDEO_EFFECTS = [
  { id: 'none',   label: 'Sin filtro', icon: '⚫', description: 'Pasa la cámara tal cual' },
  { id: 'blur',   label: 'Fondo borroso', icon: '🟦', description: 'Difumina el fondo, te mantiene a ti nítido' },
  { id: 'beauty', label: 'Belleza',    icon: '✨', description: 'Suaviza piel + ajusta color' },
];
