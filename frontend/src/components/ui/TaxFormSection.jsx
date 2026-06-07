import { useState, useEffect } from 'react';
import { FiCheck, FiAlertTriangle, FiFileText, FiLock } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Bloque de Tax Forms (W-9 / W-8BEN) para la pestaña Pagos del Dashboard.
//
// Estados:
// · loading
// · none      → user nunca firmó → muestra CTA "Empezar form"
// · signed    → form vigente → muestra resumen + "Actualizar"
// · expired   → form firmado pero >3 años → CTA "Renovar" en rojo
// · form_open → wizard de submit

const COUNTRIES = [
  { code: 'US', name: 'Estados Unidos' },
  { code: 'MX', name: 'México' },
  { code: 'ES', name: 'España' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Perú' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'CU', name: 'Cuba' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'HN', name: 'Honduras' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'PA', name: 'Panamá' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'CA', name: 'Canadá' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'CH', name: 'Suiza' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'AU', name: 'Australia' },
  { code: 'OT', name: 'Otro' },
];

export default function TaxFormSection() {
  const [status, setStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/api/tax-forms/status');
      setStatus(data);
    } catch {
      setStatus({ submitted: false });
    }
  };

  const isExpired = status?.status === 'expired';
  const isValid = status?.submitted && status.status === 'signed' && !isExpired;

  if (!status) {
    return <div className="card p-4 text-sm text-gray-500">Cargando…</div>;
  }

  if (showForm) {
    return <TaxFormWizard
      onClose={() => setShowForm(false)}
      onSuccess={() => { setShowForm(false); loadStatus(); }}
      initialCountry={status?.country || ''}
    />;
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <FiFileText className={`shrink-0 mt-0.5 ${isValid ? 'text-green-400' : isExpired ? 'text-red-400' : 'text-yellow-400'}`} size={18} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">Tax Forms (W-9 / W-8BEN)</p>
            {isValid && (
              <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <FiCheck size={10} /> Firmado
              </span>
            )}
            {isExpired && (
              <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Expirado</span>
            )}
          </div>
          {isValid ? (
            <p className="text-xs text-gray-400 mt-1">
              {status.form_type} · {status.full_name} · TIN ••••{status.tin_last4}
              <br />
              Vence {new Date(status.expires_at).toLocaleDateString('es')}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Obligatorio antes de cobrar más de $600/año (regulación IRS).
              {' '}
              <span className="text-yellow-400">W-9</span> si vives en EE.UU., <span className="text-yellow-400">W-8BEN</span> en cualquier otro país.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => setShowForm(true)}
        className={`w-full text-sm py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-expo active:scale-95 ${
          isExpired
            ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_28px_rgba(239,68,68,0.55)] hover:-translate-y-0.5'
            : isValid
              ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 hover:border-white/20'
              : 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5'
        }`}
      >
        {isExpired ? 'Renovar formulario' : isValid ? 'Actualizar datos' : 'Firmar formulario'}
      </button>
    </div>
  );
}

// ── Wizard del form ───────────────────────────────────────────────────
function TaxFormWizard({ onClose, onSuccess, initialCountry }) {
  const [country, setCountry] = useState(initialCountry || '');
  const [formType, setFormType] = useState(''); // se decide al elegir país
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    full_name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state_or_province: '',
    postal_code: '',
    tin: '',
    foreign_tax_id: '',
    date_of_birth: '',
    treaty_country: '',
    signed_full_name: '',
    agreed: false,
  });

  useEffect(() => {
    if (!country) { setFormType(''); return; }
    setFormType(country === 'US' ? 'W9' : 'W8BEN');
  }, [country]);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!country) return toast.error('Selecciona país');
    if (!f.agreed) return toast.error('Debes aceptar la declaración');
    if (f.signed_full_name.trim().toLowerCase() !== f.full_name.trim().toLowerCase()) {
      return toast.error('La firma debe coincidir exactamente con tu nombre');
    }
    setBusy(true);
    try {
      await api.post('/api/tax-forms', {
        form_type: formType,
        country,
        ...f,
      });
      toast.success('Formulario firmado');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'No se pudo guardar el formulario');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <FiFileText className="text-brand-400 shrink-0" size={18} />
        <p className="text-sm font-medium text-white">
          Firmar formulario {formType ? `· ${formType}` : ''}
        </p>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        Tus datos se guardan cifrados. Solo verás los últimos 4 dígitos del TIN después de firmar.
        Este formulario es válido por 3 años.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div>
          <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1 block">País de residencia *</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="input-field w-full text-sm"
            required
          >
            <option value="" className="bg-dark-700 text-white">Selecciona…</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code} className="bg-dark-700 text-white">{c.name}</option>
            ))}
          </select>
          {country && (
            <p className="text-[11px] mt-1 text-gray-500">
              Form aplicable: <span className="text-yellow-400 font-medium">{formType}</span>
              {' · '}
              {formType === 'W9'
                ? 'US person (ciudadano/residente)'
                : 'Persona física no-US'}
            </p>
          )}
        </div>

        {country && (
          <>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Nombre legal completo *" value={f.full_name} onChange={(v) => set('full_name', v)} required />
              <Field label="Dirección línea 1 *" value={f.address_line1} onChange={(v) => set('address_line1', v)} required />
              <Field label="Dirección línea 2 (opcional)" value={f.address_line2} onChange={(v) => set('address_line2', v)} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ciudad *" value={f.city} onChange={(v) => set('city', v)} required />
                <Field label="Estado/Provincia" value={f.state_or_province} onChange={(v) => set('state_or_province', v)} />
              </div>
              <Field label="Código postal *" value={f.postal_code} onChange={(v) => set('postal_code', v)} required />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1 block">
                {formType === 'W9' ? 'SSN o EIN (9 dígitos) *' : 'TIN / Identificación fiscal local *'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={f.tin}
                onChange={(e) => set('tin', e.target.value)}
                placeholder={formType === 'W9' ? '123-45-6789' : 'Tu RFC/CPF/NIE/etc.'}
                className="input-field w-full text-sm font-mono tracking-wider"
                required
                autoComplete="off"
                maxLength={20}
              />
              <p className="text-[10px] text-gray-600 mt-1">
                <FiLock size={9} className="inline -mt-0.5" /> Cifrado AES-256. Solo verás los últimos 4 dígitos.
              </p>
            </div>

            {formType === 'W8BEN' && (
              <>
                <Field label="Fecha de nacimiento" type="date" value={f.date_of_birth} onChange={(v) => set('date_of_birth', v)} />
                <div>
                  <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1 block">
                    País de treaty (opcional)
                  </label>
                  <select
                    value={f.treaty_country}
                    onChange={(e) => set('treaty_country', e.target.value)}
                    className="input-field w-full text-sm"
                  >
                    <option value="" className="bg-dark-700 text-white">Sin treaty / desconozco</option>
                    {COUNTRIES.filter(c => c.code !== 'US' && c.code !== 'OT').map(c => (
                      <option key={c.code} value={c.code} className="bg-dark-700 text-white">{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Si tu país tiene tratado fiscal con EE.UU., el withholding se reduce. Si no sabes, déjalo vacío.
                  </p>
                </div>
              </>
            )}

            {/* Declaración bajo perjurio */}
            <label className="flex items-start gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={f.agreed}
                onChange={(e) => set('agreed', e.target.checked)}
                className="mt-0.5 shrink-0"
                required
              />
              <span className="text-xs text-gray-300 leading-relaxed">
                <FiAlertTriangle size={11} className="inline text-yellow-400 -mt-0.5 mr-1" />
                Declaro bajo pena de perjurio que la información es veraz, correcta y completa.
                Entiendo que la información falsa puede resultar en penalizaciones.
                {formType === 'W8BEN' && ' Soy persona no-US según las definiciones del IRS.'}
              </span>
            </label>

            {/* Firma electrónica */}
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1 block">
                Firma (escribe tu nombre legal completo) *
              </label>
              <input
                type="text"
                value={f.signed_full_name}
                onChange={(e) => set('signed_full_name', e.target.value)}
                placeholder="Escribe tu nombre tal como aparece arriba"
                className="input-field w-full text-sm font-serif italic"
                required
              />
              <p className="text-[10px] text-gray-600 mt-1">
                Esto cuenta como firma electrónica vinculante (E-SIGN Act / eIDAS).
              </p>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary flex-1 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={busy || !country || !f.agreed} className="btn-primary flex-1 text-sm">
            {busy ? 'Guardando…' : 'Firmar y guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full text-sm"
        required={required}
        autoComplete="off"
      />
    </div>
  );
}
