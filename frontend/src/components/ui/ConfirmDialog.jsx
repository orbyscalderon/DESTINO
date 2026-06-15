import { createContext, useCallback, useContext, useState, useEffect } from 'react';
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
  const [phraseInput, setPhraseInput] = useState('');

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  // Reset phrase input al cambiar el modal
  useEffect(() => { if (!state) setPhraseInput(''); }, [state]);

  const handleClose = (result) => {
    state?.resolve?.(result);
    setState(null);
  };

  const phraseRequired = state?.requirePhrase;
  const phraseMatches = phraseRequired ? phraseInput === phraseRequired : true;

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

            {phraseRequired && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-1.5">
                  Escribe <code className="text-red-400 font-bold">{phraseRequired}</code> para confirmar:
                </p>
                <input
                  type="text"
                  value={phraseInput}
                  onChange={(e) => setPhraseInput(e.target.value)}
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Frase de confirmación"
                />
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => handleClose(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20 font-medium text-sm transition-all duration-200 ease-out-expo focus:outline-none focus:ring-2 focus:ring-brand-500/60 active:scale-95"
              >
                {state.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => handleClose(true)}
                disabled={!phraseMatches}
                autoFocus={!phraseRequired}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ease-out-expo focus:outline-none focus:ring-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  state.destructive
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_28px_rgba(239,68,68,0.55)] hover:-translate-y-0.5 focus:ring-red-500/60'
                    : 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 focus:ring-brand-500/60'
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
