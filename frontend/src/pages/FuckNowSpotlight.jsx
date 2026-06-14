import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiZap, FiAlertCircle, FiCheck, FiClock, FiX, FiInfo,
  FiGlobe, FiHeart, FiCalendar, FiUser,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import PageShell from '../components/layout/PageShell.jsx';
import { useAuthStore } from '../store/authStore.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';

// Editor del perfil Fuck Now Spotlight.
// - Suscripción de 30 días para aparecer en /adult?tab=ahora
// - Requiere ser is_adult_creator + age_verified_at
// - ToS obligatorio: no tarifas, no contacto externo, no servicios físicos
// - Frontend hace warning inline si el texto matchea patrones prohibidos,
//   pero el backend es la fuente de verdad (regex en fucknowController.js)

const INTENT_OPTIONS = [
  { id: 'casual', label: 'Casual'        },
  { id: 'fwb',    label: 'Friends w/ benefits' },
  { id: 'date',   label: 'Citas'         },
  { id: 'fun',    label: 'Diversión'     },
  { id: 'open',   label: 'Open-minded'   },
];

const BODY_TYPES = [
  { id: 'delgada',  label: 'Delgada'  },
  { id: 'atletica', label: 'Atlética' },
  { id: 'curvy',    label: 'Curvy'    },
  { id: 'plus',     label: 'Plus'     },
  { id: 'fitness',  label: 'Fitness'  },
];

const ETHNICITIES = [
  { id: 'latina',    label: 'Latina'    },
  { id: 'caucasica', label: 'Caucásica' },
  { id: 'afro',      label: 'Afro'      },
  { id: 'asiatica',  label: 'Asiática'  },
  { id: 'mixta',     label: 'Mixta'     },
];

const LANGUAGE_OPTIONS = [
  { code: 'es', flag: '🇪🇸', label: 'Español'    },
  { code: 'en', flag: '🇬🇧', label: 'Inglés'     },
  { code: 'pt', flag: '🇧🇷', label: 'Portugués'  },
  { code: 'fr', flag: '🇫🇷', label: 'Francés'    },
  { code: 'it', flag: '🇮🇹', label: 'Italiano'   },
];

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Warning patterns mirror del backend (descripciones, no regex literales).
// Usados solo para feedback inline — el backend re-valida con su regex.
const CLIENT_WARN_PATTERNS = [
  { id: 'money',   test: /(\$|usd|rd\$|tarifa|rate|precio)\s*:?\s*\d+|\d+\s*(\/|por\s+)\s*(h|hora|noche)/i, label: 'tarifa de pago' },
  { id: 'contact', test: /\b(whats?app|wsp|telegram|viber|signal|snapchat|kik)\b|\b(ig|insta)\s*[:@]/i, label: 'contacto externo' },
  { id: 'phone',   test: /(\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/, label: 'número de teléfono' },
  { id: 'address', test: /\b(calle|avenida|av\.?|sector|condominio|apto\.?|casa\s+#?)\s+\S/i, label: 'dirección física' },
];

function checkText(text) {
  if (!text) return null;
  for (const p of CLIENT_WARN_PATTERNS) {
    if (p.test.test(text)) return p.label;
  }
  return null;
}

export default function FuckNowSpotlight() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [ageOk, setAgeOk] = useState(isAgeVerified());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const [form, setForm] = useState({
    bio: '',
    looking_for: '',
    intent: 'casual',
    city: '',
    interests: [],
    height_cm: '',
    body_type: '',
    ethnicity: '',
    languages: ['es'],
    availability_days: ['Vie', 'Sáb', 'Dom'],
    availability_from: '18:00',
    availability_to:   '23:00',
    tos_accepted: false,
  });
  const [interestInput, setInterestInput] = useState('');

  const bioWarn = useMemo(() => checkText(form.bio), [form.bio]);
  const lookingWarn = useMemo(() => checkText(form.looking_for), [form.looking_for]);

  useEffect(() => {
    if (!ageOk) return;
    api.get('/api/fucknow/status')
      .then(({ data }) => {
        setStatus(data);
        if (data?.data) {
          const d = data.data;
          setForm(f => ({
            ...f,
            bio:           d.fucknow_bio || '',
            looking_for:   d.fucknow_looking_for || '',
            intent:        d.fucknow_intent || 'casual',
            city:          d.fucknow_city || '',
            interests:     d.fucknow_interests || [],
            height_cm:     d.height_cm || '',
            body_type:     d.body_type || '',
            ethnicity:     d.ethnicity || '',
            languages:     d.languages || ['es'],
            availability_days: d.fucknow_availability?.days || ['Vie','Sáb','Dom'],
            availability_from: d.fucknow_availability?.hours_from || '18:00',
            availability_to:   d.fucknow_availability?.hours_to   || '23:00',
            tos_accepted: !!d.fucknow_tos_accepted_at,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ageOk]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const toggleArr = (key, val) => setForm(f => ({
    ...f,
    [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val],
  }));

  const addInterest = (e) => {
    e?.preventDefault();
    const v = interestInput.trim();
    if (!v || form.interests.includes(v) || form.interests.length >= 12) return;
    set('interests', [...form.interests, v]);
    setInterestInput('');
  };

  const removeInterest = (v) => set('interests', form.interests.filter(x => x !== v));

  const canSubmit = form.tos_accepted && form.bio.trim().length > 0 && form.looking_for.trim().length > 0
    && !bioWarn && !lookingWarn;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = {
        bio:         form.bio.trim(),
        looking_for: form.looking_for.trim(),
        intent:      form.intent,
        city:        form.city.trim() || null,
        interests:   form.interests,
        height_cm:   form.height_cm ? Number(form.height_cm) : null,
        body_type:   form.body_type || null,
        ethnicity:   form.ethnicity || null,
        languages:   form.languages,
        availability: {
          days: form.availability_days,
          hours_from: form.availability_from,
          hours_to:   form.availability_to,
        },
        tos_accepted: true,
      };
      const endpoint = status?.is_active ? '/api/fucknow/update' : '/api/fucknow/publish';
      const { data } = await api.post(endpoint, body);

      // Backend devuelve mode: 'updated' | 'dev_activated' | 'checkout'
      if (data.mode === 'checkout' && data.checkout_url) {
        toast.success(`Te llevamos a CCBill — $${data.price_usd}/${data.days} días`);
        // Pequeño delay para que se vea el toast
        setTimeout(() => { window.location.href = data.checkout_url; }, 800);
        return;
      }
      toast.success(data.message || '¡Listo!');
      setTimeout(() => navigate('/adult?tab=ahora'), 600);
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al guardar';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm('¿Quitar tu perfil del directorio Fuck Now?')) return;
    setSubmitting(true);
    try {
      await api.delete('/api/fucknow');
      toast.success('Perfil quitado del directorio');
      setStatus(s => ({ ...s, is_active: false }));
    } catch {
      toast.error('No se pudo quitar');
    } finally {
      setSubmitting(false);
    }
  };

  if (!ageOk) return <AgeGate onVerified={() => setAgeOk(true)} />;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!status?.eligible) {
    return (
      <PageShell
        icon={FiZap}
        title="Fuck Now Spotlight"
        subtitle="Aparece en el directorio premium"
        backTo="/adult?tab=ahora"
        maxWidth="2xl"
      >
        <div className="card p-8 text-center bg-orange-500/5 border-orange-500/20">
          <FiAlertCircle className="text-orange-400 mx-auto mb-3" size={36} />
          <h2 className="text-white font-bold text-lg mb-2">Necesitas ser creador adulto verificado</h2>
          <p className="text-gray-400 text-sm mb-5">
            Spotlight es solo para creadores con cuenta de adulto y verificación de edad completada.
          </p>
          <button
            onClick={() => navigate('/become-creator')}
            className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-2.5 rounded-xl"
          >
            Hacerme creador adulto
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      icon={FiZap}
      title="Fuck Now Spotlight"
      subtitle={status?.is_active
        ? `Activo · ${status.days_remaining} días restantes`
        : 'Aparece en el directorio premium por 30 días'}
      backTo="/adult?tab=ahora"
      maxWidth="2xl"
      actions={status?.is_active && (
        <button
          onClick={handleUnpublish}
          disabled={submitting}
          className="text-xs text-red-400 hover:text-red-300 font-bold"
        >
          Desactivar
        </button>
      )}
    >
      {/* Banner ToS */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-5 flex gap-3">
        <FiInfo className="text-orange-400 shrink-0 mt-0.5" size={18} />
        <div className="text-xs text-gray-300 leading-relaxed flex-1">
          <p className="text-orange-400 font-bold mb-1">Reglas del directorio</p>
          <ul className="space-y-0.5 list-disc list-inside ml-1">
            <li>NO publiques tarifas por servicios físicos o encuentros</li>
            <li>NO publiques tu WhatsApp, teléfono, ni contacto externo</li>
            <li>NO ofrezcas servicios sexuales explícitos por dinero</li>
            <li>NO publiques tu dirección física</li>
          </ul>
          <p className="mt-2">
            Todo el contacto pasa por el chat de la plataforma. Los perfiles
            que incumplan se quitan automáticamente.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Bio */}
        <FormSection title="Tu bio" subtitle="Quién eres, qué buscas, qué te define">
          <textarea
            value={form.bio}
            onChange={(e) => set('bio', e.target.value.slice(0, 600))}
            rows={4}
            placeholder="Ej: Me gusta el café, los viajes, y las conexiones reales. Open-minded, sin drama."
            className={`input-field w-full text-sm resize-none ${bioWarn ? 'border-red-500/50 bg-red-500/5' : ''}`}
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[10px] ${bioWarn ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
              {bioWarn ? `⚠ Detecté ${bioWarn}. No se podrá publicar.` : 'Texto libre, sin tarifas ni contacto externo.'}
            </span>
            <span className="text-[10px] text-gray-600">{form.bio.length}/600</span>
          </div>
        </FormSection>

        {/* Looking for */}
        <FormSection title='"Estoy buscando..."' subtitle="Una línea sobre qué vibe te interesa">
          <input
            type="text"
            value={form.looking_for}
            onChange={(e) => set('looking_for', e.target.value.slice(0, 200))}
            placeholder="Ej: Conexión auténtica con personas open-minded"
            className={`input-field w-full text-sm ${lookingWarn ? 'border-red-500/50 bg-red-500/5' : ''}`}
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[10px] ${lookingWarn ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
              {lookingWarn ? `⚠ Detecté ${lookingWarn}. No se podrá publicar.` : ' '}
            </span>
            <span className="text-[10px] text-gray-600">{form.looking_for.length}/200</span>
          </div>
        </FormSection>

        {/* Intent */}
        <FormSection title="Intent" subtitle="Qué tipo de conexión buscás">
          <div className="flex flex-wrap gap-2">
            {INTENT_OPTIONS.map(o => (
              <button
                key={o.id}
                onClick={() => set('intent', o.id)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                  form.intent === o.id ? 'bg-orange-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FormSection>

        {/* City */}
        <FormSection title="Ciudad" subtitle="Donde estás basado">
          <input
            type="text"
            value={form.city}
            onChange={(e) => set('city', e.target.value.slice(0, 80))}
            placeholder="Ej: Santo Domingo"
            className="input-field w-full text-sm"
          />
        </FormSection>

        {/* Datos físicos */}
        <FormSection title="Datos físicos (opcional)" subtitle="Aparecen en la card del directorio">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 uppercase font-bold mb-1 block">Altura (cm)</label>
              <input
                type="number" min="100" max="230"
                value={form.height_cm}
                onChange={(e) => set('height_cm', e.target.value)}
                className="input-field w-full text-sm"
                placeholder="165"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase font-bold mb-1 block">Cuerpo</label>
              <select
                value={form.body_type}
                onChange={(e) => set('body_type', e.target.value)}
                className="input-field w-full text-sm"
              >
                <option value="">— Sin especificar —</option>
                {BODY_TYPES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase font-bold mb-1 block">Etnia</label>
              <select
                value={form.ethnicity}
                onChange={(e) => set('ethnicity', e.target.value)}
                className="input-field w-full text-sm"
              >
                <option value="">— Sin especificar —</option>
                {ETHNICITIES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        {/* Languages */}
        <FormSection title="Idiomas" subtitle="Que hablás">
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map(l => {
              const on = form.languages.includes(l.code);
              return (
                <button
                  key={l.code}
                  onClick={() => toggleArr('languages', l.code)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
                    on ? 'bg-orange-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <span>{l.flag}</span> {l.label}
                </button>
              );
            })}
          </div>
        </FormSection>

        {/* Interests */}
        <FormSection title="Intereses" subtitle="Tags libres — hasta 12. Enter para agregar.">
          <form onSubmit={addInterest} className="flex gap-2 mb-2">
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value.slice(0, 30))}
              placeholder="Ej: yoga, viajes, café, kink"
              className="input-field flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={!interestInput.trim() || form.interests.length >= 12}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold text-sm px-4 py-2 rounded-xl"
            >
              + Añadir
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {form.interests.map(t => (
              <span key={t} className="bg-orange-500/20 text-orange-300 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                {t}
                <button onClick={() => removeInterest(t)} className="text-orange-200 hover:text-white">
                  <FiX size={12} />
                </button>
              </span>
            ))}
          </div>
        </FormSection>

        {/* Availability */}
        <FormSection title="Disponibilidad" subtitle="Para chat — no para encuentros offline">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAYS.map(d => {
              const on = form.availability_days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleArr('availability_days', d)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    on ? 'bg-orange-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[10px] text-gray-400 uppercase font-bold">De</span>
            <input
              type="time"
              value={form.availability_from}
              onChange={(e) => set('availability_from', e.target.value)}
              className="input-field text-sm"
            />
            <span className="text-[10px] text-gray-400 uppercase font-bold">a</span>
            <input
              type="time"
              value={form.availability_to}
              onChange={(e) => set('availability_to', e.target.value)}
              className="input-field text-sm"
            />
          </div>
        </FormSection>

        {/* ToS */}
        <div className="card p-4 bg-dark-800/60 border-orange-500/30">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.tos_accepted}
              onChange={(e) => set('tos_accepted', e.target.checked)}
              className="mt-1 w-4 h-4 accent-orange-500"
            />
            <span className="text-xs text-gray-300 leading-relaxed">
              Acepto las <strong className="text-orange-400">reglas del directorio Spotlight</strong>:
              no publicar tarifas por servicios físicos, no incluir contacto externo
              (WhatsApp, teléfono, redes), no ofrecer servicios sexuales explícitos
              por dinero, ni dirección física. Entiendo que el contenido se modera
              automáticamente y mi perfil puede ser quitado si incumplo.
            </span>
          </label>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-base py-3.5 rounded-xl shadow-glow flex items-center justify-center gap-2 transition-all"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : status?.is_active ? (
            <>
              <FiCheck size={18} /> Actualizar Spotlight
            </>
          ) : (
            <>
              <FiZap size={18} /> Activar Spotlight (30 días)
            </>
          )}
        </button>

        {!status?.is_active && (
          <p className="text-center text-[11px] text-gray-500">
            Al activar, aparecerás en el directorio durante 30 días. Después de eso
            podrás renovar o dejar que expire.
          </p>
        )}
      </div>
    </PageShell>
  );
}

function FormSection({ title, subtitle, children }) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-white font-bold text-sm">{title}</p>
        {subtitle && <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
