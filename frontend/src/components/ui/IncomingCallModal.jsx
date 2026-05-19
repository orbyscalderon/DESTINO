import { motion } from 'framer-motion';
import { FiPhone, FiPhoneOff, FiVideo } from 'react-icons/fi';

export default function IncomingCallModal({ call, onAccept, onDecline }) {
  const avatarUrl = call.callerAvatar
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(call.callerName || 'U')}&size=80&background=1a1a2e&color=f43f5e`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -60, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -60, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-80 max-w-[calc(100vw-2rem)]"
    >
      <div className="card p-5 shadow-2xl border-green-500/20 bg-dark-800/95 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="relative shrink-0">
            <img
              src={avatarUrl}
              alt={call.callerName}
              className="w-14 h-14 rounded-full object-cover"
            />
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping opacity-60" />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-dark-800 flex items-center justify-center">
              <FiVideo size={9} className="text-white" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{call.callerName}</p>
            <p className="text-gray-400 text-sm">Videollamada entrante</p>
            <div className="flex items-center gap-1 mt-1">
              {[0, 120, 240].map(d => (
                <div
                  key={d}
                  className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 py-3 bg-dark-700 border border-red-500/30 rounded-xl text-red-400 font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
          >
            <FiPhoneOff size={15} /> Rechazar
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 bg-green-600 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-green-500 transition-colors shadow-lg shadow-green-900/40"
          >
            <FiPhone size={15} /> Aceptar
          </button>
        </div>
      </div>
    </motion.div>
  );
}
