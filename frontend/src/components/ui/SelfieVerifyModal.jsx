import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiCamera, FiCheck } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

export default function SelfieVerifyModal({ onClose, onVerified }) {
  const [stream, setStream] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch {
        toast.error('No se pudo acceder a la cámara');
        onClose?.();
      }
    })();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(blob => setSnapshot(blob), 'image/jpeg', 0.85);
  };

  const submit = async () => {
    if (!snapshot) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('selfie', snapshot, 'selfie.jpg');
    try {
      await api.post('/api/profiles/selfie-verify', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Perfil verificado');
      onVerified?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al verificar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="card p-5 w-full max-w-md relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white">
          <FiX size={18} />
        </button>

        <h3 className="text-lg font-bold text-white mb-1">Verificación con selfie</h3>
        <p className="text-xs text-gray-500 mb-4">Toma una selfie mirando a la cámara. Obtienes el badge azul ✓</p>

        <div className="relative aspect-video bg-dark-700 rounded-xl overflow-hidden mb-4">
          {snapshot ? (
            <img src={URL.createObjectURL(snapshot)} alt="Snapshot" className="w-full h-full object-cover" data-no-invert />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" data-no-invert />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {snapshot ? (
          <div className="flex gap-2">
            <button onClick={() => setSnapshot(null)} className="btn-secondary flex-1 text-sm">
              Repetir
            </button>
            <button onClick={submit} disabled={uploading} className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
              {uploading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><FiCheck size={14} /> Verificar</>
              }
            </button>
          </div>
        ) : (
          <button onClick={takeSnapshot} className="btn-primary w-full text-sm flex items-center justify-center gap-1.5">
            <FiCamera size={15} /> Tomar selfie
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
