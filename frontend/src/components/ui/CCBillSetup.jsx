import { useEffect, useState } from 'react';
import { FiCheck, FiAlertTriangle, FiExternalLink } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Sección de configuración de CCBill para el creator adulto.
// Solo visible si profile.is_adult_creator === true.
// Permite ingresar sub_account_id + recurring_form_id (lo da CCBill al aprobar
// la cuenta). El admin valida y cambia status a 'active' manualmente.
export default function CCBillSetup() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subAccountId, setSubAccountId] = useState('');
  const [recurringFormId, setRecurringFormId] = useState('');

  useEffect(() => {
    let cancel = false;
    api.get('/api/payments/ccbill/my-account')
      .then(({ data }) => {
        if (cancel) return;
        setAccount(data);
        if (data.sub_account_id)    setSubAccountId(data.sub_account_id);
        if (data.recurring_form_id) setRecurringFormId(data.recurring_form_id);
      })
      .catch(() => { if (!cancel) toast.error('Error al cargar CCBill'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const handleSave = async () => {
    if (!subAccountId.trim() || !recurringFormId.trim()) {
      toast.error('Ambos campos son requeridos');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/payments/ccbill/my-account', {
        sub_account_id: subAccountId.trim(),
        recurring_form_id: recurringFormId.trim(),
      });
      toast.success('Datos guardados. Tu cuenta queda en revisión.');
      setAccount(prev => ({ ...prev, configured: true, status: 'pending' }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-6 flex justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!account?.ccbill_enabled_globally) {
    return (
      <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
        <p className="text-yellow-400 text-xs font-semibold mb-1 flex items-center gap-1.5">
          <FiAlertTriangle size={12} /> CCBill no está habilitado
        </p>
        <p className="text-gray-400 text-xs leading-relaxed">
          La plataforma aún no tiene cuenta master de CCBill configurada.
          Mientras tanto puedes cobrar con Stripe.
        </p>
      </div>
    );
  }

  const status = account.status;
  const statusBadge = status === 'active'
    ? { color: 'green', label: 'Cuenta verificada' }
    : status === 'pending'
      ? { color: 'yellow', label: 'En revisión' }
      : status === 'suspended'
        ? { color: 'red', label: 'Suspendida' }
        : null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
          🔞 CCBill (cobro adulto)
        </h3>
        <p className="text-gray-500 text-xs leading-relaxed">
          Stripe rechaza creators adultos en muchos países. CCBill es el
          procesador estándar de la industria. Si tienes tu cuenta CCBill
          aprobada, ingresa tus credenciales abajo.
        </p>
      </div>

      {statusBadge && (
        <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-${statusBadge.color}-500/10 text-${statusBadge.color}-400 border border-${statusBadge.color}-500/30 w-fit`}>
          {status === 'active' ? <FiCheck size={12} /> : <FiAlertTriangle size={12} />}
          {statusBadge.label}
        </div>
      )}

      {!account.configured && (
        <a
          href="https://ccbill.com/signup"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
        >
          Crear cuenta en CCBill <FiExternalLink size={11} />
        </a>
      )}

      <div className="space-y-2">
        <label className="block text-xs text-gray-400">
          Sub-account ID (lo da CCBill al aprobar)
          <input
            type="text"
            value={subAccountId}
            onChange={e => setSubAccountId(e.target.value)}
            placeholder="0001"
            maxLength={32}
            className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
        </label>
        <label className="block text-xs text-gray-400">
          Recurring Form ID
          <input
            type="text"
            value={recurringFormId}
            onChange={e => setRecurringFormId(e.target.value)}
            placeholder="123cc"
            maxLength={32}
            className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full btn-primary py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Guardando...' : account.configured ? 'Actualizar credenciales' : 'Guardar'}
      </button>

      <div className="bg-dark-800 rounded-lg p-3 text-[11px] text-gray-500 leading-relaxed">
        <p className="text-gray-400 font-semibold mb-1">¿Cómo conseguir las credenciales?</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>Regístrate en ccbill.com (proceso ~ 5-10 días con KYC)</li>
          <li>Cuando aprueban, el dashboard te muestra tu Sub-account ID</li>
          <li>Crea un "Recurring Form" en FlexForms y copia el form ID</li>
          <li>Pega ambos aquí y guarda</li>
        </ol>
      </div>
    </div>
  );
}
