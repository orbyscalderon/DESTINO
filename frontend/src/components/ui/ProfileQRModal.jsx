import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { FiX, FiCopy, FiCheck } from 'react-icons/fi';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ProfileQRModal({ profile, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/#/profile/${profile?.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: profile?.full_name || 'Destino TV', url }); } catch {}
    } else copyLink();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 glass-strong flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
        className="card p-6 w-full max-w-sm text-center relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors" aria-label="Cerrar">
          <FiX size={18} />
        </button>

        <h3 className="text-lg font-bold text-white mb-1">Comparte tu perfil</h3>
        <p className="text-xs text-gray-500 mb-5">Escanea para abrir el perfil en Destino TV</p>

        <div className="bg-white rounded-2xl p-5 mb-4 flex justify-center shadow-glow-sm" data-no-invert>
          <QRCodeSVG value={url} size={220} level="M" includeMargin={false} />
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-2 mb-3">
          <span className="text-gray-400 text-xs truncate flex-1 px-2">{url}</span>
          <button onClick={copyLink} className="text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 px-2 py-1 rounded-md transition-colors">
            {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
          </button>
        </div>

        <button onClick={share} className="btn-primary w-full text-sm shadow-glow">
          Compartir enlace
        </button>
      </motion.div>
    </motion.div>
  );
}
