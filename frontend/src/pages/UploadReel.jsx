import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiUpload, FiX, FiCheck } from 'react-icons/fi';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useSwipeNavigation } from '../lib/useSwipeNavigation.js';
import toast from 'react-hot-toast';

const MAX_DURATION = 90;
const MAX_SIZE_MB = 100;

export default function UploadReel() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // Patrón Instagram Stories/Cámara: swipe-der vuelve a Inicio (cierra la cámara).
  useSwipeNavigation({ right: '/home' });

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [thumbnailBlob, setThumbnailBlob] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);

  const canPublishAdult = !!profile?.is_adult_creator && !!profile?.age_verified_at;

  const handleSelectFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      toast.error('Solo se aceptan videos');
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`El video no puede superar ${MAX_SIZE_MB} MB`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setDuration(0);
  };

  const handleLoadedMetadata = () => {
    const d = videoRef.current?.duration || 0;
    setDuration(d);
    if (d > MAX_DURATION) {
      toast.error(`El video debe durar máximo ${MAX_DURATION} segundos`);
    }
    // Capturar primer frame (después de un seek breve para asegurar que
    // el frame esté disponible)
    captureThumbnail();
  };

  const captureThumbnail = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      // Saltar al segundo 0.1 para evitar frame negro del inicio
      v.currentTime = Math.min(0.1, (v.duration || 0) * 0.05);
      await new Promise(resolve => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); resolve(); };
        v.addEventListener('seeked', onSeek);
        setTimeout(resolve, 800); // safety timeout
      });
      const canvas = document.createElement('canvas');
      // Limit width para que el thumbnail sea ligero
      const targetW = Math.min(v.videoWidth || 720, 720);
      const scale = targetW / (v.videoWidth || targetW);
      canvas.width = targetW;
      canvas.height = (v.videoHeight || 1280) * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          setThumbnailBlob(blob);
          if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
          setThumbnailPreview(URL.createObjectURL(blob));
        }
      }, 'image/jpeg', 0.82);
    } catch (e) {
      console.warn('No se pudo generar thumbnail:', e.message);
    }
  };

  const handleUpload = async () => {
    if (!file) return toast.error('Selecciona un video');
    if (duration <= 0) return toast.error('Espera a que el video cargue');
    if (duration > MAX_DURATION) {
      return toast.error(`El video debe durar máximo ${MAX_DURATION} segundos`);
    }

    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('video', file);
      if (thumbnailBlob) formData.append('thumbnail', thumbnailBlob, 'thumb.jpg');
      formData.append('caption', caption);
      formData.append('duration_seconds', String(Math.min(duration, MAX_DURATION)));
      formData.append('is_adult', String(isAdult));

      await api.post('/api/reels', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      toast.success('¡Reel publicado!');
      navigate('/reels');
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al subir el reel';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Topbar */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="w-9 h-9 bg-dark-700 rounded-full flex items-center justify-center"
        >
          <FiArrowLeft size={16} />
        </button>
        <h1 className="font-bold tracking-tight">Subir Reel</h1>
        <div className="w-9" />
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Preview / Selector */}
        {!previewUrl ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-[9/16] bg-dark-800 rounded-2xl border-2 border-dashed border-dark-600 hover:border-brand-500/50 transition-colors flex flex-col items-center justify-center text-gray-400"
          >
            <FiUpload size={32} className="mb-3" />
            <p className="font-bold text-sm">Selecciona un video</p>
            <p className="text-xs text-gray-500 mt-1">Vertical · máx {MAX_DURATION}s · máx {MAX_SIZE_MB} MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleSelectFile}
              className="hidden"
            />
          </button>
        ) : (
          <div className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden">
            <video
              ref={videoRef}
              src={previewUrl}
              onLoadedMetadata={handleLoadedMetadata}
              controls
              loop
              playsInline
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => {
                URL.revokeObjectURL(previewUrl);
                if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
                setFile(null);
                setPreviewUrl(null);
                setDuration(0);
                setThumbnailBlob(null);
                setThumbnailPreview(null);
              }}
              aria-label="Quitar video"
              className="absolute top-3 right-3 w-9 h-9 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center"
            >
              <FiX size={18} />
            </button>
            {duration > 0 && (
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-xs px-2 py-1 rounded-full">
                {duration.toFixed(1)}s {duration > MAX_DURATION && <span className="text-red-400">· EXCEDE</span>}
              </div>
            )}
          </div>
        )}

        {/* Thumbnail preview (read-only por ahora) */}
        {thumbnailPreview && (
          <div className="flex items-center gap-3 bg-dark-800 rounded-xl p-2.5">
            <img
              src={thumbnailPreview}
              alt="Thumbnail capturado"
              className="w-12 h-16 object-cover rounded-lg bg-black"
            />
            <div className="text-xs">
              <p className="text-white font-medium">Portada</p>
              <p className="text-gray-500">Generada automáticamente del primer frame</p>
            </div>
          </div>
        )}

        {/* Caption */}
        <div>
          <label htmlFor="reel-caption" className="text-xs text-gray-400 block mb-1.5">
            Caption (usa #hashtags para llegar a más gente)
          </label>
          <textarea
            id="reel-caption"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="¿De qué va? Añade hashtags como #destino #fyp..."
            className="w-full bg-dark-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600"
          />
          <p className="text-[10px] text-gray-500 text-right mt-1">{caption.length}/2000</p>
        </div>

        {/* Adult toggle (solo si es creator adulto) */}
        {canPublishAdult && (
          <label className="card p-3 flex items-center gap-3 cursor-pointer hover:bg-dark-800 transition-colors">
            <input
              type="checkbox"
              checked={isAdult}
              onChange={e => setIsAdult(e.target.checked)}
              className="w-4 h-4 accent-pink-500"
            />
            <div className="flex-1">
              <p className="text-sm text-white font-medium">Contenido +18 (NSFW)</p>
              <p className="text-[11px] text-gray-500">Se filtrará para usuarios sin verificación de edad</p>
            </div>
          </label>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading || duration > MAX_DURATION || duration <= 0}
          className="w-full bg-gradient-to-r from-brand-500 to-pink-500 hover:brightness-110 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Subiendo {progress}%
            </>
          ) : (
            <>
              <FiCheck size={16} /> Publicar reel
            </>
          )}
        </button>

        {uploading && (
          <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-brand-500 to-pink-500"
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        )}

        <div className="card p-3 bg-yellow-500/5 border-yellow-500/20">
          <p className="text-yellow-400 text-xs font-semibold mb-1">Recomendaciones</p>
          <ul className="text-gray-400 text-[11px] space-y-0.5 leading-relaxed">
            <li>• Formato vertical 9:16 para mejor visualización</li>
            <li>• Calidad mínima 720p, máximo 100 MB</li>
            <li>• Mantén tu identidad o personaje consistente</li>
            <li>• Usa hashtags trending para descubrimiento</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
