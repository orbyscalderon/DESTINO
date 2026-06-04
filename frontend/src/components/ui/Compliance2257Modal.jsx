import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShield, FiUpload, FiX, FiAlertCircle } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const ID_TYPES = [
  { value: 'passport',         label: 'Pasaporte' },
  { value: 'drivers_license',  label: 'Licencia de conducir' },
  { value: 'national_id',      label: 'Cédula / DNI / ID Nacional' },
];

export default function Compliance2257Modal({ videoId, onComplete, onClose }) {
  const [form, setForm] = useState({
    performer_legal_name: '',
    performer_dob: '',
    performer_id_type: 'national_id',
    produced_at: new Date().toISOString().slice(0, 10),
    consent_signed: false,
    age_confirmed: false,
  });
  const [idFile, setIdFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.performer_legal_name.trim()) return toast.error('Nombre legal requerido');
    if (!form.performer_dob) return toast.error('Fecha de nacimiento requerida');
    if (!idFile) return toast.error('Documento de identidad requerido');
    if (!form.consent_signed || !form.age_confirmed) return toast.error('Debes aceptar las declaraciones');

    // Check edad >= 18 desde el cliente (mejor UX)
    const age = Math.floor((Date.now() - new Date(form.performer_dob).getTime()) / (365.25*24*60*60*1000));
    if (age < 18) return toast.error('El performer debe ser mayor de 18 años');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('id_document', idFile);
      fd.append('video_id', videoId);
      fd.append('performer_legal_name', form.performer_legal_name);
      fd.append('performer_dob', form.performer_dob);
      fd.append('performer_id_type', form.performer_id_type);
      fd.append('produced_at', form.produced_at);
      fd.append('consent_signed', 'true');
      await api.post('/api/explore/2257', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Records 2257 enviados');
      onComplete?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
          className="bg-dark-800 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        >
          <div className="sticky top-0 bg-dark-800 border-b border-white/5 px-4 py-3 flex items-center gap-3">
            <FiShield className="text-brand-400" size={18} />
            <div className="flex-1">
              <h3 className="text-white font-bold text-sm">Records 2257 — obligatorio</h3>
              <p className="text-[10px] text-gray-500">US Title 18 § 2257 compliance</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Cerrar">
              <FiX size={18} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-gray-300 flex gap-2">
              <FiAlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <p>
                Por ley, todo contenido adulto debe tener records verificables de la edad e identidad
                de cada performer. Sin estos records, el video no se publicará.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-bold uppercase mb-1 block">Nombre legal del performer *</label>
              <input className="input-field py-2 text-sm w-full"
                value={form.performer_legal_name}
                onChange={e => set('performer_legal_name', e.target.value)} />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-bold uppercase mb-1 block">Fecha de nacimiento *</label>
              <input type="date" className="input-field py-2 text-sm w-full"
                value={form.performer_dob} onChange={e => set('performer_dob', e.target.value)} />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-bold uppercase mb-1 block">Tipo de ID *</label>
              <select className="input-field py-2 text-sm w-full"
                value={form.performer_id_type} onChange={e => set('performer_id_type', e.target.value)}>
                {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-bold uppercase mb-1 block">Foto del ID *</label>
              <label className="border-2 border-dashed border-white/15 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-brand-500/40">
                <FiUpload size={20} className="text-gray-500" />
                <span className="text-xs text-gray-400">
                  {idFile ? idFile.name : 'Sube foto/PDF del ID'}
                </span>
                <input type="file" accept="image/*,.pdf" className="hidden"
                  onChange={e => setIdFile(e.target.files?.[0] || null)} />
              </label>
              <p className="text-[10px] text-gray-600 mt-1">Máx 10MB. Almacenado privadamente, solo el equipo legal lo verá.</p>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-bold uppercase mb-1 block">Fecha de producción</label>
              <input type="date" className="input-field py-2 text-sm w-full"
                value={form.produced_at} onChange={e => set('produced_at', e.target.value)} />
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5 shrink-0"
                  checked={form.age_confirmed} onChange={e => set('age_confirmed', e.target.checked)} />
                <span>Confirmo que el performer tenía 18 años o más al momento de la grabación.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5 shrink-0"
                  checked={form.consent_signed} onChange={e => set('consent_signed', e.target.checked)} />
                <span>Tengo consentimiento firmado del performer para publicar este contenido en Destino TV.</span>
              </label>
            </div>

            <button onClick={submit} disabled={submitting}
              className="btn-primary w-full disabled:opacity-50">
              {submitting ? 'Enviando…' : 'Enviar records y publicar video'}
            </button>

            <p className="text-[10px] text-gray-600 text-center">
              Falsificar estos records es delito federal en US (18 USC § 2257)
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
