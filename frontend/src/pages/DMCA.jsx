import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiAlertCircle, FiCheck } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

export default function DMCA() {
  const [form, setForm] = useState({
    claimant_name: '',
    claimant_email: '',
    claimant_address: '',
    claimant_phone: '',
    copyright_owner: '',
    original_work_url: '',
    infringing_url: '',
    content_type: 'other',
    good_faith_statement: false,
    accuracy_statement: false,
    perjury_acknowledgment: false,
    signature: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.good_faith_statement || !form.accuracy_statement || !form.perjury_acknowledgment) {
      toast.error('Debes aceptar las tres declaraciones legales');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/api/dmca', form);
      setSubmitted(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar la notificación');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen px-4 pt-8 pb-28 max-w-2xl mx-auto">
        <div className="card p-8 text-center bg-green-500/5 border-green-500/20">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <FiCheck className="text-green-400" size={32} />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Notificación recibida</h1>
          <p className="text-gray-400 text-sm mb-4">{submitted.message}</p>
          <div className="bg-dark-800 rounded-lg p-3 inline-block text-xs">
            <span className="text-gray-500">ID de referencia:</span>{' '}
            <span className="text-white font-mono">{submitted.reference_id}</span>
          </div>
          <div className="mt-6">
            <Link to="/" className="text-brand-400 text-sm hover:text-brand-300">← Volver al inicio</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-white"><FiArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-black gradient-text">Notificación DMCA</h1>
      </div>

      <div className="card p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
        <div className="flex gap-3">
          <FiAlertCircle className="text-yellow-400 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-gray-300 leading-relaxed">
            <p className="font-bold text-white mb-1">Antes de enviar:</p>
            <p>
              Este formulario es exclusivamente para reportar infracciones de derechos de autor según
              el <strong>17 U.S.C. § 512(c)(3)</strong> (Digital Millennium Copyright Act).
              Para reportar otros tipos de contenido (acoso, suplantación, contenido ilegal),
              usa el botón "Reportar" dentro del perfil o publicación.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section>
          <h2 className="text-sm font-bold text-white mb-2">1. Sobre ti (reclamante)</h2>
          <div className="space-y-2">
            <input className="input-field py-2 text-sm w-full" placeholder="Nombre completo *"
              value={form.claimant_name} onChange={e => set('claimant_name', e.target.value)} required />
            <input className="input-field py-2 text-sm w-full" type="email" placeholder="Email *"
              value={form.claimant_email} onChange={e => set('claimant_email', e.target.value)} required />
            <input className="input-field py-2 text-sm w-full" placeholder="Dirección física"
              value={form.claimant_address} onChange={e => set('claimant_address', e.target.value)} />
            <input className="input-field py-2 text-sm w-full" placeholder="Teléfono"
              value={form.claimant_phone} onChange={e => set('claimant_phone', e.target.value)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2">2. Obra protegida</h2>
          <div className="space-y-2">
            <input className="input-field py-2 text-sm w-full" placeholder="Titular del copyright (tú o la empresa) *"
              value={form.copyright_owner} onChange={e => set('copyright_owner', e.target.value)} required />
            <input className="input-field py-2 text-sm w-full" placeholder="URL de la obra original (si existe)"
              value={form.original_work_url} onChange={e => set('original_work_url', e.target.value)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2">3. Contenido infractor en Destino TV</h2>
          <div className="space-y-2">
            <input className="input-field py-2 text-sm w-full" placeholder="URL del contenido en Destino TV *"
              value={form.infringing_url} onChange={e => set('infringing_url', e.target.value)} required />
            <select className="input-field py-2 text-sm w-full"
              value={form.content_type} onChange={e => set('content_type', e.target.value)}>
              <option value="photo" className="bg-dark-700 text-white">Foto</option>
              <option value="video" className="bg-dark-700 text-white">Video</option>
              <option value="post" className="bg-dark-700 text-white">Publicación</option>
              <option value="show" className="bg-dark-700 text-white">Show en vivo / grabación</option>
              <option value="other" className="bg-dark-700 text-white">Otro</option>
            </select>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2">4. Declaraciones legales</h2>
          <div className="space-y-2 text-xs text-gray-300">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 shrink-0" required
                checked={form.good_faith_statement} onChange={e => set('good_faith_statement', e.target.checked)} />
              <span>Declaro de buena fe que el uso del material descrito no está autorizado por el titular del copyright, su agente o la ley.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 shrink-0" required
                checked={form.accuracy_statement} onChange={e => set('accuracy_statement', e.target.checked)} />
              <span>Declaro que la información en esta notificación es precisa.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 shrink-0" required
                checked={form.perjury_acknowledgment} onChange={e => set('perjury_acknowledgment', e.target.checked)} />
              <span>Bajo pena de perjurio, declaro ser el titular del copyright o estar autorizado a actuar en su nombre.</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2">5. Firma electrónica</h2>
          <input className="input-field py-2 text-sm w-full" placeholder="Escribe tu nombre completo como firma *"
            value={form.signature} onChange={e => set('signature', e.target.value)} required />
        </section>

        <button type="submit" disabled={submitting}
          className="btn-primary w-full disabled:opacity-50">
          {submitting ? 'Enviando…' : 'Enviar notificación DMCA'}
        </button>

        <p className="text-[10px] text-gray-600 text-center px-4">
          Las notificaciones falsas o de mala fe son perseguibles bajo el 17 U.S.C. § 512(f) y pueden
          implicar responsabilidad civil. Procesamos cada notificación dentro de 7 días hábiles.
        </p>
      </form>
    </div>
  );
}
