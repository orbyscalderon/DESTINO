import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheck, FiType, FiLink, FiVideo, FiImage, FiUploadCloud } from 'react-icons/fi';
import { compressImage } from '../../lib/imageCompressor.js';
import { useFocusTrap } from '../../lib/useFocusTrap.js';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Story Composer tier-2
// Flow:
//   1) User selecciona archivo (foto o video)
//   2) Preview con overlays: caption text + CTA link/label
//   3) Para video: scrubber para elegir cover frame (poster)
//   4) Submit → POST /api/stories (multipart) con campos extras
//
// Props:
//   onClose  — cierra sin publicar
//   onPosted — callback tras publicar (refresh feed)
//
// Limits:
//   - Caption: 280 chars
//   - CTA url: 500 chars, require http(s)
//   - CTA label: 30 chars

const MAX_CAPTION = 280;
const MAX_CTA_LABEL = 30;

export default function StoryComposer({ onClose, onPosted }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [coverFrameS, setCoverFrameS] = useState(0);
  const [posting, setPosting] = useState(false);
  const [showCtaInput, setShowCtaInput] = useState(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const trapRef = useFocusTrap(true, { onEscape: () => !posting && onClose() });

  const isVideo = file?.type?.startsWith('video/');

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error('Máximo 50 MB');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setCoverFrameS(0);
  };

  const handleVideoMeta = () => {
    if (videoRef.current) {
      setCoverFrameS(0);
    }
  };

  const handleScrub = (e) => {
    const value = parseFloat(e.target.value);
    setCoverFrameS(value);
    if (videoRef.current) {
      videoRef.current.currentTime = value;
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Selecciona una foto o video primero');
      return;
    }
    if (showCtaInput && ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
      toast.error('El link debe empezar con http:// o https://');
      return;
    }
    setPosting(true);
    try {
      const processed = isVideo ? file : await compressImage(file);
      const fd = new FormData();
      fd.append('media', processed);
      if (caption.trim()) fd.append('caption', caption.trim());
      if (ctaUrl.trim() && showCtaInput) {
        fd.append('cta_url', ctaUrl.trim());
        if (ctaLabel.trim()) fd.append('cta_label', ctaLabel.trim());
      }
      if (isVideo) fd.append('cover_frame_s', String(coverFrameS));

      await api.post('/api/stories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('¡Story publicada!');
      onPosted?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar');
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget && !posting) onClose(); }}
      >
        <motion.div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-composer-title"
          initial={{ y: 20, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="relative w-full max-w-sm bg-dark-900 rounded-3xl overflow-hidden shadow-2xl shadow-black/80"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h2 id="story-composer-title" className="text-white font-bold text-sm">
              {file ? 'Nueva story' : 'Crear story'}
            </h2>
            <button
              onClick={onClose}
              disabled={posting}
              aria-label="Cerrar"
              className="text-gray-500 hover:text-white hover:bg-white/5 p-1 -m-1 rounded-lg transition-colors disabled:opacity-40"
            >
              <FiX size={18} />
            </button>
          </div>

          {!file ? (
            // ── Step 1: selección de archivo ──
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/15 border border-brand-500/30 flex items-center justify-center mb-4">
                <FiUploadCloud className="text-brand-400" size={32} />
              </div>
              <p className="text-white font-semibold mb-1">Elige una foto o video</p>
              <p className="text-gray-500 text-xs mb-6">Máx 50 MB · Foto/video vertical recomendado</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { fileRef.current.accept = 'image/*'; fileRef.current.click(); }}
                  className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  <FiImage size={16} /> Foto
                </button>
                <button
                  onClick={() => { fileRef.current.accept = 'video/*'; fileRef.current.click(); }}
                  className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  <FiVideo size={16} /> Video
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                onChange={handleFile}
                className="hidden"
              />
            </div>
          ) : (
            // ── Step 2: preview + caption + CTA + (video: cover frame) ──
            <div className="flex flex-col">
              {/* Preview con caption overlay */}
              <div className="relative bg-black aspect-[9/16] max-h-[55vh]">
                {isVideo ? (
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    className="w-full h-full object-contain"
                    onLoadedMetadata={handleVideoMeta}
                    muted
                    playsInline
                  />
                ) : (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                )}
                {/* Caption overlay sobre el preview */}
                {caption && (
                  <div className="absolute bottom-16 left-3 right-3 pointer-events-none">
                    <p className="text-white text-sm font-medium bg-black/55 backdrop-blur-sm rounded-xl px-3 py-2 inline-block whitespace-pre-wrap break-words">
                      {caption}
                    </p>
                  </div>
                )}
                {/* CTA preview */}
                {showCtaInput && ctaUrl && (
                  <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
                    <div className="bg-brand-500 text-white rounded-full px-4 py-2 text-xs font-bold text-center shadow-glow">
                      {ctaLabel || 'Ver más'} →
                    </div>
                  </div>
                )}
              </div>

              {/* Cover frame scrubber para video */}
              {isVideo && videoRef.current?.duration > 0 && (
                <div className="px-4 pt-3 pb-2 border-t border-white/5 bg-dark-800/50">
                  <label className="flex items-center justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1.5">
                    Cover frame
                    <span className="text-brand-400 font-mono">{coverFrameS.toFixed(1)}s</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={videoRef.current.duration}
                    step="0.1"
                    value={coverFrameS}
                    onChange={handleScrub}
                    className="w-full accent-brand-500 cursor-pointer"
                    aria-label="Seleccionar frame de portada"
                  />
                </div>
              )}

              {/* Caption input */}
              <div className="px-4 py-3 border-t border-white/5 space-y-3">
                <div>
                  <label className="flex items-center justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <FiType size={11} /> Caption
                    </span>
                    <span className={caption.length > MAX_CAPTION - 30 ? 'text-amber-400' : 'text-gray-600'}>
                      {caption.length}/{MAX_CAPTION}
                    </span>
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
                    placeholder="¿Qué quieres contar?"
                    rows="2"
                    className="input-field py-2 text-sm w-full resize-none"
                  />
                </div>

                {/* Toggle CTA */}
                {!showCtaInput ? (
                  <button
                    onClick={() => setShowCtaInput(true)}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1.5 transition-colors"
                  >
                    <FiLink size={11} /> Añadir link
                  </button>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-[10px] text-gray-400 uppercase font-bold tracking-wide">
                      <span className="flex items-center gap-1.5">
                        <FiLink size={11} /> Link CTA
                      </span>
                      <button
                        onClick={() => { setShowCtaInput(false); setCtaUrl(''); setCtaLabel(''); }}
                        className="text-[10px] text-gray-600 hover:text-gray-400"
                      >
                        Quitar
                      </button>
                    </label>
                    <input
                      type="url"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://…"
                      className="input-field py-2 text-sm w-full"
                    />
                    <div>
                      <input
                        type="text"
                        value={ctaLabel}
                        onChange={(e) => setCtaLabel(e.target.value.slice(0, MAX_CTA_LABEL))}
                        placeholder="Texto del botón (opcional, 30 chars)"
                        className="input-field py-2 text-sm w-full"
                      />
                      <p className="text-[10px] text-gray-600 mt-1">
                        Si está vacío, usa "Ver más" por defecto.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-4 py-3 border-t border-white/5 flex gap-2 bg-dark-800/30">
                <button
                  onClick={() => { setFile(null); setPreviewUrl(null); }}
                  disabled={posting}
                  className="btn-secondary text-sm px-4 py-2.5 disabled:opacity-40"
                >
                  Cambiar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={posting}
                  className="btn-primary text-sm flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 shadow-glow hover:shadow-glow-lg"
                >
                  {posting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Publicando…
                    </>
                  ) : (
                    <>
                      <FiCheck size={16} /> Publicar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
