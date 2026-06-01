import { createContext, useCallback, useContext, useState } from 'react';
import { FiAlertTriangle, FiCheck } from 'react-icons/fi';
import Modal from './Modal.jsx';

// Reemplazo accesible de window.confirm():
//
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: '¿Cancelar suscripción?',
//     message: 'Perderás el acceso al final del periodo.',
//     confirmLabel: 'Cancelar suscripción',
//     destructive: true,
//   });
//   if (ok) { ... }
//
// Para usarlo, wrappear la app en <ConfirmProvider>.

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleClose = (result) => {
    state?.resolve?.(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => handleClose(false)}
        size="sm"
        showCloseButton={false}
        zClass="z-[60]"
      >
        {state && (
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  state.destructive ? 'bg-red-500/20' : 'bg-brand-500/20'
                }`}
              >
                {state.destructive ? (
                  <FiAlertTriangle className="text-red-400" size={20} />
                ) : (
                  <FiCheck className="text-brand-400" size={20} />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">{state.title}</h3>
                {state.message && (
                  <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
                    {state.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => handleClose(false)}
                className="flex-1 py-2.5 rounded-xl bg-dark-700 text-gray-300 hover:bg-dark-600 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {state.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => handleClose(true)}
                autoFocus
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors focus:outline-none focus:ring-2 ${
                  state.destructive
                    ? 'bg-red-500 hover:bg-red-400 text-white focus:ring-red-500'
                    : 'bg-brand-500 hover:bg-brand-400 text-white focus:ring-brand-500'
                }`}
              >
                {state.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback: si no hay provider, usar window.confirm como degradación
    return (opts) => Promise.resolve(window.confirm(opts.message || opts.title || ''));
  }
  return ctx;
}
