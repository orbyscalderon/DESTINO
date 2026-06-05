import { useState, useEffect } from 'react';
import { FiAlertTriangle, FiDownload, FiTrash2, FiClock, FiCheck } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Panel GDPR para Settings → Cuenta → Eliminar.
// Flow: request → 30d grace period → cancel anytime → cron borra.
// + botón export JSON con toda la data del user.

export default function AccountDeletionSection() {
  const [status, setStatus] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | confirm | confirmed
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/api/account-deletion');
      setStatus(data.request);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/api/account-deletion/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `destino_mis_datos_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Datos descargados');
    } catch {
      toast.error('Error descargando');
    } finally {
      setDownloading(false);
    }
  };

  const handleRequest = async () => {
    setBusy(true);
    try {
      await api.post('/api/account-deletion', { reason: reason.trim() || undefined });
      toast.success('Solicitud enviada. Tienes 30 días para cancelar.');
      setStage('confirmed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('¿Cancelar la solicitud de eliminación?')) return;
    setBusy(true);
    try {
      await api.delete('/api/account-deletion');
      toast.success('Solicitud cancelada');
      setStage('idle');
      load();
    } catch {
      toast.error('Error');
    } finally {
      setBusy(false);
    }
  };

  const isPending = status?.status === 'pending';
  const daysLeft = isPending
    ? Math.max(0, Math.ceil((new Date(status.scheduled_for) - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-3">
      {/* Export data — siempre disponible */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <FiDownload size={16} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">Descargar mis datos</h3>
        </div>
        <p className="text-xs text-gray-500">
          Tu perfil, matches, mensajes, posts, transacciones y suscripciones en JSON. Cumple GDPR/CCPA.
        </p>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="btn-secondary w-full text-sm py-2 disabled:opacity-50"
        >
          {downloading ? 'Descargando…' : 'Descargar JSON'}
        </button>
      </div>

      {/* Account deletion */}
      <div className="card p-4 space-y-2 border-red-500/30">
        <div className="flex items-center gap-2 mb-1">
          <FiAlertTriangle size={16} className="text-red-400" />
          <h3 className="text-sm font-bold text-white">Eliminar cuenta</h3>
        </div>

        {isPending ? (
          <>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-yellow-400 font-bold">
                <FiClock size={12} /> Eliminación programada
              </div>
              <p className="text-gray-300">
                Tu cuenta será eliminada el {new Date(status.scheduled_for).toLocaleDateString('es', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
                {' '}({daysLeft} {daysLeft === 1 ? 'día' : 'días'} restantes).
              </p>
              <p className="text-gray-400">
                Cancela ahora y mantén tu cuenta intacta.
              </p>
            </div>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="btn-primary w-full text-sm py-2 disabled:opacity-50"
            >
              Cancelar eliminación
            </button>
          </>
        ) : stage === 'idle' ? (
          <>
            <p className="text-xs text-gray-500">
              Solicita la eliminación de tu cuenta. Tienes <b className="text-white">30 días</b> para cancelar
              antes de que se elimine definitivamente.
            </p>
            <button
              onClick={() => setStage('confirm')}
              className="text-sm py-2 w-full rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 font-semibold transition-colors"
            >
              Solicitar eliminación
            </button>
          </>
        ) : stage === 'confirm' ? (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cuéntanos por qué te vas (opcional, nos ayuda a mejorar)"
              rows={3}
              maxLength={500}
              className="input-field py-2 text-sm w-full resize-none"
            />
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-gray-300">
              <p className="font-bold text-red-400 mb-1">¿Estás seguro?</p>
              <ul className="space-y-0.5 list-disc list-inside text-gray-400">
                <li>Tus matches, mensajes, posts y reels desaparecerán</li>
                <li>El saldo de coins será descartado (sin reembolso)</li>
                <li>Tienes 30 días para cancelar antes de la eliminación final</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStage('idle'); setReason(''); }}
                className="btn-secondary flex-1 text-sm py-2"
              >
                Volver
              </button>
              <button
                onClick={handleRequest}
                disabled={busy}
                className="flex-1 text-sm py-2 rounded-lg bg-red-500 text-white font-semibold disabled:opacity-50"
              >
                {busy ? 'Enviando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-green-400 text-sm">
            <FiCheck size={24} className="mx-auto mb-2" />
            Solicitud enviada
          </div>
        )}
      </div>
    </div>
  );
}
