import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { api, setSession } from './api.js';
import { AuthProvider, useAuth } from './auth.jsx';
import {
  Terms, Privacy, Compliance2257, Dmca, Dsa, Contact, Cookies as CookiesPage,
} from './pages/Legal.jsx';

const AGE_KEY = 'encuentros_age_ok';

// ════════════════════════════════════════════════════════════════════
// Age Gate
// ════════════════════════════════════════════════════════════════════
function AgeGate({ onPass }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">🔞</div>
        <h1 className="text-2xl font-black text-white mb-2">Solo +18</h1>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">
          Este sitio contiene material para adultos. Al entrar declarás bajo penalidad de perjurio ser mayor de 18 años y aceptás los <Link to="/terms" className="underline">términos</Link> y la <Link to="/privacy" className="underline">privacidad</Link>.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => { try { localStorage.setItem(AGE_KEY, '1'); } catch {} onPass(); }}
            className="w-full bg-accent-500 hover:bg-accent-400 text-white font-black py-3 rounded-lg"
          >
            Entrar — soy mayor de 18
          </button>
          <a href="https://www.google.com" className="block w-full text-zinc-500 text-xs py-2 hover:text-zinc-400">
            Salir
          </a>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Header / Footer / Layout
// ════════════════════════════════════════════════════════════════════
function Header() {
  const [searchParams, setSearchParams] = useSearchParams();
  const country = searchParams.get('country') || 'DO';
  const { publisher, logout } = useAuth();

  const setCountry = (c) => {
    const p = new URLSearchParams(searchParams); p.set('country', c); setSearchParams(p);
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link to="/" className="text-accent-500 font-black text-xl tracking-tight">encuentros</Link>
        <select value={country} onChange={(e) => setCountry(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-2 py-1.5">
          <option value="DO">🇩🇴 R. Dominicana</option>
          <option value="MX">🇲🇽 México</option>
          <option value="AR">🇦🇷 Argentina</option>
          <option value="CO">🇨🇴 Colombia</option>
          <option value="ES">🇪🇸 España</option>
          <option value="VE">🇻🇪 Venezuela</option>
          <option value="CL">🇨🇱 Chile</option>
          <option value="PE">🇵🇪 Perú</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/favorites" className="text-xs text-zinc-400 hover:text-white px-2 hidden sm:inline">★ Favoritos</Link>
          {publisher ? (
            <>
              <Link to="/dashboard" className="text-xs text-accent-400 hover:text-accent-300 font-bold border border-accent-500/30 px-3 py-1.5 rounded">
                Dashboard
              </Link>
              <button onClick={logout} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">Salir</button>
            </>
          ) : (
            <>
              <Link to="/auth/login" className="text-xs text-zinc-300 hover:text-white px-2">Acceder</Link>
              <Link to="/publish" className="text-xs text-accent-400 hover:text-accent-300 font-bold border border-accent-500/30 px-3 py-1.5 rounded">
                + Publicar
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-6 text-xs text-zinc-500 space-y-2">
        <p className="text-zinc-400 font-bold">encuentros — directorio de adultos</p>
        <p>Operado por entidad legal independiente. NO afiliado con ninguna otra plataforma.</p>
        <p>Todos los anunciantes son mayores de 18 años. Reportá inmediatamente si sospechás de un menor o de trata.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/terms" className="hover:text-zinc-300">Términos</Link>
          <Link to="/privacy" className="hover:text-zinc-300">Privacidad</Link>
          <Link to="/cookies" className="hover:text-zinc-300">Cookies</Link>
          <Link to="/2257" className="hover:text-zinc-300">2257 Statement</Link>
          <Link to="/dmca" className="hover:text-zinc-300">DMCA</Link>
          <Link to="/dsa" className="hover:text-zinc-300">DSA</Link>
          <Link to="/contact" className="hover:text-zinc-300">Contacto</Link>
        </div>
      </div>
    </footer>
  );
}

function Page({ children }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Listings index + filters
// ════════════════════════════════════════════════════════════════════
const SERVICES_OPTIONS = ['novia gfe','masaje','striptease','despedida','duo','beso negro','baño compartido','lluvia dorada'];
const BODY_TYPES = [['delgada','Delgada'],['atletica','Atlética'],['curvy','Curvy'],['plus','Plus'],['fitness','Fitness']];
const ETHNICITIES = [['latina','Latina'],['caucasica','Caucásica'],['afro','Afro'],['asiatica','Asiática'],['mixta','Mixta']];

function ListingsIndex() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const country = searchParams.get('country') || 'DO';
  const gender = searchParams.get('gender') || '';
  const availableNow = searchParams.get('available_now') === 'true';
  const bodyType = searchParams.get('body_type') || '';
  const ethnicity = searchParams.get('ethnicity') || '';
  const q = searchParams.get('q') || '';

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ country, limit: '60' });
    if (gender) params.set('gender', gender);
    if (availableNow) params.set('available_now', 'true');
    if (bodyType) params.set('body_type', bodyType);
    if (ethnicity) params.set('ethnicity', ethnicity);
    if (q) params.set('q', q);
    api.get(`/api/listings?${params}`)
      .then(r => setListings(r.data?.listings || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [country, gender, availableNow, bodyType, ethnicity, q]);

  const setFilter = (key, value) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    setSearchParams(p);
  };

  return (
    <Page>
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <FilterPill active={!gender} onClick={() => setFilter('gender', '')}>Todos</FilterPill>
            <FilterPill active={gender === 'female'} onClick={() => setFilter('gender', 'female')}>Mujeres</FilterPill>
            <FilterPill active={gender === 'male'} onClick={() => setFilter('gender', 'male')}>Hombres</FilterPill>
            <FilterPill active={gender === 'trans'} onClick={() => setFilter('gender', 'trans')}>Trans</FilterPill>
            <FilterPill active={gender === 'couple'} onClick={() => setFilter('gender', 'couple')}>Parejas</FilterPill>
            <span className="border-l border-zinc-700 h-5 mx-2" />
            <FilterPill active={availableNow} accent onClick={() => setFilter('available_now', availableNow ? '' : 'true')}>
              ● Disponibles ahora
            </FilterPill>
            <button onClick={() => setShowAdvanced(s => !s)} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 underline-offset-2 hover:underline">
              {showAdvanced ? '−' : '+'} Filtros avanzados
            </button>
          </div>
          {showAdvanced && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
              <input value={q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Buscar por nombre…"
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-1.5 w-48" />
              <select value={bodyType} onChange={(e) => setFilter('body_type', e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-2 py-1.5">
                <option value="">Cualquier cuerpo</option>
                {BODY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={ethnicity} onChange={(e) => setFilter('ethnicity', e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-2 py-1.5">
                <option value="">Cualquier etnia</option>
                {ETHNICITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => <div key={i} className="aspect-[3/4] bg-zinc-900 rounded animate-pulse" />)}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3 opacity-30">🔍</p>
            <p className="text-zinc-400">Sin anuncios con estos filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {listings.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </main>
    </Page>
  );
}

function FilterPill({ active, accent, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded transition-colors ${
        active
          ? accent ? 'bg-accent-500 text-white' : 'bg-zinc-700 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
      }`}>
      {children}
    </button>
  );
}

function ListingCard({ listing }) {
  const [fav, setFav] = useState(() => isFav(listing.id));
  return (
    <Link to={`/l/${listing.id}`}
      className="block group relative aspect-[3/4] bg-zinc-900 rounded overflow-hidden hover:ring-2 hover:ring-accent-500/50 transition-all">
      {listing.cover_photo_url ? (
        <img src={listing.cover_photo_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black flex items-center justify-center text-3xl opacity-30">🔥</div>
      )}
      <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
        {listing.available_now && <span className="bg-accent-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">● ahora</span>}
        {listing.tier === 'top' && <span className="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded uppercase">TOP</span>}
        {listing.tier === 'vip' && <span className="bg-purple-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">VIP</span>}
        {listing.is_verified && <span className="bg-blue-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">✓</span>}
      </div>
      <button
        onClick={(e) => { e.preventDefault(); toggleFav(listing.id); setFav(f => !f); }}
        className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-base">
        {fav ? '★' : '☆'}
      </button>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 to-transparent">
        <p className="text-white text-sm font-bold truncate">{listing.display_name}, {listing.age}</p>
        <p className="text-zinc-300 text-[10px] truncate">{listing.headline}</p>
        {listing.rate_60min && (
          <p className="text-accent-400 text-[11px] font-bold mt-1">{listing.rate_currency} {listing.rate_60min}/h</p>
        )}
      </div>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════
// Favorites (localStorage)
// ════════════════════════════════════════════════════════════════════
const FAV_KEY = 'enc_favorites';
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}
function isFav(id) { return getFavs().includes(id); }
function toggleFav(id) {
  const arr = getFavs();
  const idx = arr.indexOf(id);
  if (idx >= 0) arr.splice(idx, 1); else arr.unshift(id);
  try { localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 200))); } catch {}
}

function FavoritesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ids = getFavs();
    if (!ids.length) { setLoading(false); return; }
    Promise.all(ids.map(id => api.get(`/api/listings/${id}`).catch(() => null)))
      .then(rs => setItems(rs.filter(Boolean).map(r => r.data.listing)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Page>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-4">Tus favoritos</h1>
        {loading ? <p className="text-zinc-500">Cargando…</p>
          : items.length === 0 ? <p className="text-zinc-500">Sin favoritos todavía. Click la estrella ★ en un anuncio.</p>
          : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.map(l => <ListingCard key={l.id} listing={l} />)}</div>}
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Listing detail
// ════════════════════════════════════════════════════════════════════
function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    api.get(`/api/listings/${id}`)
      .then(r => setListing(r.data?.listing))
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [id]);

  const trackContact = () => { api.post(`/api/listings/${id}/contact`).catch(() => {}); };

  if (loading) return <Page><main className="text-center text-zinc-500 py-20">Cargando…</main></Page>;
  if (!listing) return <Page><main className="text-center text-zinc-500 py-20">Anuncio no encontrado</main></Page>;

  return (
    <Page>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white text-sm mb-4">← Volver</button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {listing.cover_photo_url ? (
              <img src={listing.cover_photo_url} alt="" className="w-full rounded-lg aspect-[3/4] object-cover" />
            ) : (
              <div className="w-full aspect-[3/4] bg-zinc-900 rounded-lg flex items-center justify-center text-5xl opacity-30">🔥</div>
            )}
            {Array.isArray(listing.photos) && listing.photos.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {listing.photos.slice(0, 6).map((p, i) => (
                  <img key={p.id || i} src={p.thumbnail_url || p.url} alt="" className="aspect-square rounded object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <h1 className="text-2xl font-black flex-1">{listing.display_name}, {listing.age}</h1>
              {listing.is_verified && <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-1 rounded">✓ verificada</span>}
            </div>
            <p className="text-accent-400 font-bold">{listing.headline}</p>
            <p className="text-zinc-400 text-sm">
              {listing.city}{listing.zone ? ` · ${listing.zone}` : ''} · {listing.country_code}
            </p>

            {listing.description && (
              <div className="bg-zinc-900 rounded p-3 text-sm text-zinc-300 whitespace-pre-wrap">
                {listing.description}
              </div>
            )}

            {/* Rates */}
            {(listing.rate_30min || listing.rate_60min || listing.rate_overnight) && (
              <div className="bg-zinc-900 rounded p-3 space-y-1 text-sm">
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Tarifas</p>
                {listing.rate_30min && <p><span className="text-zinc-500">30min:</span> <strong className="text-accent-400">{listing.rate_currency} {listing.rate_30min}</strong></p>}
                {listing.rate_60min && <p><span className="text-zinc-500">1h:</span> <strong className="text-accent-400">{listing.rate_currency} {listing.rate_60min}</strong></p>}
                {listing.rate_2h && <p><span className="text-zinc-500">2h:</span> <strong className="text-accent-400">{listing.rate_currency} {listing.rate_2h}</strong></p>}
                {listing.rate_overnight && <p><span className="text-zinc-500">Noche:</span> <strong className="text-accent-400">{listing.rate_currency} {listing.rate_overnight}</strong></p>}
                {listing.rate_notes && <p className="text-zinc-500 text-xs mt-2">{listing.rate_notes}</p>}
              </div>
            )}

            {/* Servicios */}
            {Array.isArray(listing.services) && listing.services.length > 0 && (
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Servicios</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.services.map(s => <span key={s} className="bg-zinc-800 border border-zinc-700 text-xs px-2 py-1 rounded">{s}</span>)}
                </div>
              </div>
            )}

            {/* Contacto */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              {listing.whatsapp && (
                <a href={`https://wa.me/${listing.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer nofollow"
                   onClick={trackContact}
                   className="block w-full bg-green-600 hover:bg-green-500 text-white text-center font-bold py-3 rounded transition-colors">
                  WhatsApp
                </a>
              )}
              {listing.telegram && (
                <a href={`https://t.me/${listing.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer nofollow"
                   onClick={trackContact}
                   className="block w-full bg-blue-500 hover:bg-blue-400 text-white text-center font-bold py-3 rounded transition-colors">
                  Telegram
                </a>
              )}
              {listing.signal_number && (
                <a href={`https://signal.me/#p/${listing.signal_number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer nofollow"
                   onClick={trackContact}
                   className="block w-full bg-zinc-700 hover:bg-zinc-600 text-white text-center font-bold py-3 rounded transition-colors">
                  Signal
                </a>
              )}
              <button onClick={() => setShowReport(true)} className="block w-full text-zinc-500 hover:text-red-400 text-xs py-2 text-center transition-colors">
                ⚠ Reportar este anuncio
              </button>
            </div>
          </div>
        </div>

        {showReport && <ReportModal listingId={id} onClose={() => setShowReport(false)} />}
      </main>
    </Page>
  );
}

function ReportModal({ listingId, onClose }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!category || description.length < 10) return;
    setSubmitting(true);
    try {
      await api.post('/api/reports', { listing_id: listingId, category, description, reporter_email: email || null });
      setDone(true);
    } catch (err) {
      alert('Error enviando reporte. Intentá de nuevo.');
    } finally { setSubmitting(false); }
  };

  if (done) return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="text-white font-bold mb-2">Reporte recibido</p>
        <p className="text-zinc-400 text-sm mb-4">Lo revisaremos en máximo 24h. Si es urgente (menores/trafficking), escalamos en 30 min.</p>
        <button onClick={onClose} className="text-accent-400 text-sm">Cerrar</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black mb-3">Reportar anuncio</h3>
        <p className="text-zinc-400 text-xs mb-4">Si sospechás de menor o trafficking, escalamos en 30 min.</p>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 mb-3">
          <option value="">— Tipo de reporte —</option>
          <option value="underage_suspected">⚠ Sospecho que es menor</option>
          <option value="trafficking_suspected">⚠ Sospecho trata de personas</option>
          <option value="fake_photos">Fotos falsas / robadas</option>
          <option value="scam_payment">Estafa / pidió dinero</option>
          <option value="aggressive_behavior">Comportamiento agresivo</option>
          <option value="fake_identity">Identidad falsa</option>
          <option value="spam">Spam</option>
          <option value="other">Otro</option>
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Describí qué pasó (mínimo 10 caracteres)…" rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 mb-3" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Tu email (opcional, para seguimiento)"
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold py-2 rounded">Cancelar</button>
          <button onClick={submit} disabled={!category || description.length < 10 || submitting}
            className="flex-1 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-white text-sm font-bold py-2 rounded">
            {submitting ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Auth: login con magic link + callback
// ════════════════════════════════════════════════════════════════════
function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const send = async () => {
    setSubmitting(true);
    try {
      await api.post('/api/auth/magic-link', { email });
      setSent(true);
    } catch {} finally { setSubmitting(false); }
  };
  return (
    <Page>
      <main className="max-w-md mx-auto px-4 py-10">
        <h1 className="text-2xl font-black mb-2">Acceder</h1>
        <p className="text-zinc-400 text-sm mb-6">Ingresá tu email — te mandamos un link de un solo uso.</p>
        {sent ? (
          <div className="bg-zinc-900 border border-accent-500/30 rounded-lg p-6 text-center">
            <p className="text-2xl mb-2">📧</p>
            <p className="text-white font-bold mb-2">Revisá tu email</p>
            <p className="text-zinc-400 text-sm">Si la dirección está registrada, te enviamos el link de acceso (válido 15 minutos).</p>
          </div>
        ) : (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="tu@email.com"
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded px-3 py-3 mb-3" />
            <button onClick={send} disabled={submitting || !email}
              className="w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-white font-black py-3 rounded">
              {submitting ? 'Enviando…' : 'Enviar link'}
            </button>
            <p className="text-zinc-500 text-xs text-center mt-4">
              Al continuar aceptás los <Link to="/terms" className="underline">términos</Link>.
            </p>
          </>
        )}
      </main>
    </Page>
  );
}

function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }
    api.post('/api/auth/callback', { token })
      .then(({ data }) => {
        setSession(data.session_token);
        refresh().then(() => navigate('/dashboard', { replace: true }));
      })
      .catch(() => setStatus('error'));
  }, [searchParams, navigate, refresh]);

  return (
    <Page>
      <main className="max-w-md mx-auto px-4 py-20 text-center">
        {status === 'processing' && <p className="text-zinc-400">Verificando link…</p>}
        {status === 'error' && (
          <>
            <p className="text-2xl mb-2">❌</p>
            <p className="text-white font-bold mb-2">Link inválido o expirado</p>
            <p className="text-zinc-400 text-sm mb-4">Pedí uno nuevo desde la página de acceso.</p>
            <Link to="/auth/login" className="text-accent-400">Acceder</Link>
          </>
        )}
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Publisher Dashboard
// ════════════════════════════════════════════════════════════════════
function RequireAuth({ children }) {
  const { publisher, loading } = useAuth();
  if (loading) return <Page><main className="text-center text-zinc-500 py-20">Cargando…</main></Page>;
  if (!publisher) return <Navigate to="/auth/login" replace />;
  return children;
}

function Dashboard() {
  const { publisher } = useAuth();
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/publisher/listings').catch(() => ({ data: { listings: [] } })),
      api.get('/api/publisher/stats').catch(() => ({ data: null })),
    ]).then(([l, s]) => {
      setListings(l.data.listings || []);
      setStats(s.data);
      setLoading(false);
    });
  }, []);

  return (
    <Page>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black">Tu dashboard</h1>
            <p className="text-zinc-500 text-xs">{publisher?.email}</p>
          </div>
          <Link to="/dashboard/new" className="bg-accent-500 hover:bg-accent-400 text-white font-bold text-sm px-4 py-2 rounded">
            + Nuevo anuncio
          </Link>
        </div>

        {!publisher?.identity_verified && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4 mb-4">
            <p className="text-yellow-400 font-bold text-sm">⚠ Verificá tu identidad</p>
            <p className="text-zinc-400 text-xs mt-1">
              Sin verificación de identidad, tus anuncios no se publican.
              Necesitás documento oficial + selfie.
            </p>
            <Link to="/dashboard/verify" className="inline-block mt-2 text-yellow-400 underline text-xs">Verificar ahora →</Link>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat label="Anuncios" value={stats.total_listings} />
            <Stat label="Activos" value={stats.active_listings} />
            <Stat label="Vistas" value={stats.total_views} />
            <Stat label="Contactos" value={stats.total_contacts} hint={`${stats.conversion_rate}%`} />
          </div>
        )}

        <h2 className="text-lg font-black mb-3">Mis anuncios</h2>
        {loading ? <p className="text-zinc-500">Cargando…</p>
          : listings.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded p-8 text-center">
              <p className="text-zinc-400 mb-3">No tenés anuncios todavía.</p>
              <Link to="/dashboard/new" className="text-accent-400 underline text-sm">Crear el primero</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {listings.map(l => <DashboardListingRow key={l.id} listing={l} />)}
            </div>
          )}
      </main>
    </Page>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
      <p className="text-zinc-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-black text-xl mt-1">{value}{hint && <span className="text-accent-400 text-xs ml-1">({hint})</span>}</p>
    </div>
  );
}

function DashboardListingRow({ listing }) {
  const STATUS_COLORS = { active: 'text-green-400', pending_review: 'text-yellow-400', rejected: 'text-red-400', paused: 'text-zinc-500', expired: 'text-zinc-500' };
  return (
    <Link to={`/dashboard/listings/${listing.id}`} className="block bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded p-3 flex items-center gap-3">
      {listing.cover_photo_url ? (
        <img src={listing.cover_photo_url} alt="" className="w-12 h-16 rounded object-cover" />
      ) : (
        <div className="w-12 h-16 rounded bg-zinc-800 flex items-center justify-center text-xl opacity-50">🔥</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold truncate">{listing.display_name}</p>
        <p className="text-zinc-500 text-xs truncate">{listing.city} · {listing.country_code}</p>
        <p className={`text-[10px] font-bold uppercase ${STATUS_COLORS[listing.status] || 'text-zinc-500'}`}>
          {listing.status === 'pending_review' ? 'en revisión' : listing.status}
        </p>
      </div>
      <div className="text-right text-xs text-zinc-500 shrink-0">
        <p>👁 {listing.views_count}</p>
        <p>💬 {listing.contacts_count}</p>
      </div>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════
// Listing wizard — crear nuevo anuncio (multi-step)
// ════════════════════════════════════════════════════════════════════
const COUNTRIES = [
  ['DO','República Dominicana'],['MX','México'],['AR','Argentina'],['CO','Colombia'],
  ['ES','España'],['VE','Venezuela'],['CL','Chile'],['PE','Perú'],['EC','Ecuador'],
  ['UY','Uruguay'],['BO','Bolivia'],['PY','Paraguay'],['CR','Costa Rica'],['PA','Panamá'],
  ['CU','Cuba'],['GT','Guatemala'],['HN','Honduras'],['SV','El Salvador'],['NI','Nicaragua'],
  ['BR','Brasil'],['PR','Puerto Rico'],['US','Estados Unidos'],['CA','Canadá'],
];

function NewListingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    display_name: '', age: '', gender: 'female',
    country_code: 'DO', city: '', zone: '',
    headline: '', description: '',
    body_type: '', ethnicity: '', height_cm: '',
    languages: ['Español'], services: [],
    rate_30min: '', rate_60min: '', rate_2h: '', rate_overnight: '', rate_currency: 'USD',
    whatsapp: '', telegram: '',
    available_incall: false, available_outcall: false, available_online: false,
    available_now: false, available_today: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k) => setForm(f => ({ ...f, [k]: !f[k] }));

  const canStep1 = form.display_name && form.age >= 18 && form.gender && form.country_code && form.city && form.headline;
  const canStep2 = true; // todo opcional
  const canStep3 = form.whatsapp || form.telegram;

  const submit = async () => {
    setSubmitting(true); setError('');
    try {
      const { data } = await api.post('/api/listings', { ...form, age: parseInt(form.age) });
      navigate(`/dashboard/listings/${data.listing.id}?new=1`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error creando anuncio');
    } finally { setSubmitting(false); }
  };

  return (
    <Page>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-2">Nuevo anuncio</h1>
        <p className="text-zinc-500 text-sm mb-6">Paso {step} de 3</p>

        {step === 1 && (
          <div className="space-y-3">
            <Field label="Nombre artístico">
              <input value={form.display_name} onChange={(e) => update('display_name', e.target.value)}
                maxLength={60} className="enc-input" />
            </Field>
            <Field label="Edad">
              <input type="number" value={form.age} onChange={(e) => update('age', e.target.value)}
                min={18} max={99} className="enc-input" />
            </Field>
            <Field label="Género">
              <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className="enc-input">
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="trans">Trans</option>
                <option value="couple">Pareja</option>
                <option value="other">Otro</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="País">
                <select value={form.country_code} onChange={(e) => update('country_code', e.target.value)} className="enc-input">
                  {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Ciudad">
                <input value={form.city} onChange={(e) => update('city', e.target.value)} className="enc-input" />
              </Field>
            </div>
            <Field label="Zona / barrio (opcional)">
              <input value={form.zone} onChange={(e) => update('zone', e.target.value)} className="enc-input" />
            </Field>
            <Field label="Titular (corto)">
              <input value={form.headline} onChange={(e) => update('headline', e.target.value)}
                maxLength={100} placeholder="Ej: Latina sensual disponible 24/7" className="enc-input" />
            </Field>
            <Field label="Descripción (opcional)">
              <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
                rows={4} maxLength={2000} className="enc-input" />
            </Field>
            <div className="flex justify-end pt-4">
              <button disabled={!canStep1} onClick={() => setStep(2)}
                className="bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-white font-bold px-6 py-2 rounded">
                Siguiente
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cuerpo">
                <select value={form.body_type} onChange={(e) => update('body_type', e.target.value)} className="enc-input">
                  <option value="">—</option>
                  {BODY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Etnia">
                <select value={form.ethnicity} onChange={(e) => update('ethnicity', e.target.value)} className="enc-input">
                  <option value="">—</option>
                  {ETHNICITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Altura (cm)">
              <input type="number" value={form.height_cm} onChange={(e) => update('height_cm', e.target.value)}
                min={100} max={230} className="enc-input" />
            </Field>
            <Field label="Servicios">
              <div className="flex flex-wrap gap-1.5">
                {SERVICES_OPTIONS.map(s => {
                  const active = form.services.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => update('services', active ? form.services.filter(x => x !== s) : [...form.services, s])}
                      className={`text-xs px-2 py-1 rounded border ${active ? 'bg-accent-500 text-white border-accent-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>
            <p className="text-zinc-400 text-xs uppercase tracking-wider mt-3">Tarifas (la plataforma NO procesa estos pagos)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="30 min"><input type="number" value={form.rate_30min} onChange={(e) => update('rate_30min', e.target.value)} className="enc-input" /></Field>
              <Field label="1 hora"><input type="number" value={form.rate_60min} onChange={(e) => update('rate_60min', e.target.value)} className="enc-input" /></Field>
              <Field label="2 horas"><input type="number" value={form.rate_2h} onChange={(e) => update('rate_2h', e.target.value)} className="enc-input" /></Field>
              <Field label="Toda la noche"><input type="number" value={form.rate_overnight} onChange={(e) => update('rate_overnight', e.target.value)} className="enc-input" /></Field>
            </div>
            <Field label="Moneda">
              <select value={form.rate_currency} onChange={(e) => update('rate_currency', e.target.value)} className="enc-input w-32">
                <option>USD</option><option>EUR</option><option>DOP</option><option>MXN</option><option>ARS</option><option>COP</option><option>CLP</option>
              </select>
            </Field>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="text-zinc-400 hover:text-white">← Atrás</button>
              <button onClick={() => setStep(3)} className="bg-accent-500 hover:bg-accent-400 text-white font-bold px-6 py-2 rounded">Siguiente</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Contacto (mínimo 1)</p>
            <Field label="WhatsApp (+código país, sin espacios)">
              <input value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)}
                placeholder="+1809..." className="enc-input" />
            </Field>
            <Field label="Telegram (usuario, sin @)">
              <input value={form.telegram} onChange={(e) => update('telegram', e.target.value)} className="enc-input" />
            </Field>
            <p className="text-zinc-400 text-xs uppercase tracking-wider mt-3">Disponibilidad</p>
            <div className="space-y-2">
              <Check label="Recibe en su lugar (incall)" checked={form.available_incall} onChange={() => toggle('available_incall')} />
              <Check label="Va a hotel/lugar del cliente (outcall)" checked={form.available_outcall} onChange={() => toggle('available_outcall')} />
              <Check label="Servicio online (videocall, fotos)" checked={form.available_online} onChange={() => toggle('available_online')} />
              <Check label="Disponible ahora" checked={form.available_now} onChange={() => toggle('available_now')} />
              <Check label="Disponible hoy" checked={form.available_today} onChange={() => toggle('available_today')} />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="text-zinc-400 hover:text-white">← Atrás</button>
              <button onClick={submit} disabled={submitting || !canStep3}
                className="bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-white font-bold px-6 py-2 rounded">
                {submitting ? 'Creando…' : 'Crear anuncio'}
              </button>
            </div>
          </div>
        )}
      </main>
    </Page>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-zinc-400 text-xs mb-1 block">{label}</span>
      {children}
    </label>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4" />
      {label}
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════
// Edit listing (con photo upload)
// ════════════════════════════════════════════════════════════════════
function EditListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    api.get(`/api/listings/${id}`)
      .then(r => setListing(r.data?.listing))
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append('photo', file);
    try {
      await api.post(`/api/listings/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error subiendo foto');
    } finally { setUploading(false); }
  };

  const deletePhoto = async (photoId) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    try { await api.delete(`/api/listings/${id}/photos/${photoId}`); load(); } catch {}
  };

  const pauseListing = async () => {
    if (!confirm('¿Pausar este anuncio? Dejará de aparecer en el directorio.')) return;
    try { await api.delete(`/api/listings/${id}`); navigate('/dashboard'); } catch {}
  };

  if (loading) return <Page><main className="text-center text-zinc-500 py-20">Cargando…</main></Page>;
  if (!listing) return <Page><main className="text-center text-zinc-500 py-20">No encontrado</main></Page>;

  return (
    <Page>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/dashboard" className="text-zinc-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-2xl font-black mt-2 mb-1">{listing.display_name}</h1>
        <p className={`text-xs uppercase font-bold ${listing.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
          {listing.status === 'pending_review' ? 'En revisión' : listing.status}
        </p>

        <section className="mt-6">
          <h2 className="text-sm font-bold mb-2 uppercase tracking-wider text-zinc-400">Fotos</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {(listing.photos || []).map(p => (
              <div key={p.id} className="relative aspect-[3/4] bg-zinc-900 rounded overflow-hidden group">
                <img src={p.thumbnail_url || p.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => deletePhoto(p.id)}
                  className="absolute top-1 right-1 bg-red-500/80 text-white text-xs w-6 h-6 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  ×
                </button>
                {p.is_cover && <span className="absolute bottom-1 left-1 bg-accent-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cover</span>}
                {p.moderation_status === 'pending' && <span className="absolute top-1 left-1 bg-yellow-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Pending</span>}
              </div>
            ))}
            <label className="aspect-[3/4] bg-zinc-900 border-2 border-dashed border-zinc-700 rounded flex items-center justify-center cursor-pointer hover:border-accent-500 transition-colors">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="hidden" />
              <span className="text-zinc-500 text-3xl">{uploading ? '…' : '+'}</span>
            </label>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold mb-2 uppercase tracking-wider text-zinc-400">Stats</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Vistas" value={listing.views_count || 0} />
            <Stat label="Contactos" value={listing.contacts_count || 0} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold mb-2 uppercase tracking-wider text-zinc-400">Acciones</h2>
          <div className="space-y-2">
            <Link to={`/l/${id}`} className="block bg-zinc-900 hover:bg-zinc-800 text-white text-sm px-4 py-3 rounded">
              👁 Ver como visitante
            </Link>
            <button onClick={pauseListing} className="block w-full text-left bg-zinc-900 hover:bg-red-500/10 text-red-400 text-sm px-4 py-3 rounded">
              ⏸ Pausar anuncio
            </button>
          </div>
        </section>
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Verify identity (placeholder Onfido)
// ════════════════════════════════════════════════════════════════════
function VerifyIdentity() {
  return (
    <Page>
      <main className="max-w-md mx-auto px-4 py-10">
        <h1 className="text-2xl font-black mb-3">Verificación de identidad</h1>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-6">
          <p className="text-zinc-400 text-sm mb-4">
            Para publicar tu anuncio, necesitamos verificar:
          </p>
          <ul className="text-zinc-300 text-sm space-y-1 mb-4">
            <li>✓ Que sos mayor de 18 años</li>
            <li>✓ Tu identidad real (no podemos publicar nombres falsos)</li>
            <li>✓ Que sos la persona en las fotos</li>
          </ul>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 mb-4">
            <p className="text-yellow-400 text-xs">
              ⚠ Integración con Onfido pendiente. En producción este botón abre el SDK de Onfido — el flujo toma ~3 min.
            </p>
          </div>
          <button className="w-full bg-accent-500 hover:bg-accent-400 text-white font-bold py-3 rounded">
            Empezar verificación →
          </button>
        </div>
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Publish (landing para publicar)
// ════════════════════════════════════════════════════════════════════
function PublishLanding() {
  const { publisher } = useAuth();
  return (
    <Page>
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-black mb-4">Publicar tu anuncio</h1>
        <ol className="space-y-3 text-zinc-300">
          <li><strong className="text-accent-400">1.</strong> Creá tu cuenta con email.</li>
          <li><strong className="text-accent-400">2.</strong> Verificá tu identidad con documento oficial + selfie.</li>
          <li><strong className="text-accent-400">3.</strong> Completá tu anuncio (3 minutos).</li>
          <li><strong className="text-accent-400">4.</strong> Elegí plan (free básico, premium con resaltado).</li>
          <li><strong className="text-accent-400">5.</strong> Revisión por nuestro equipo (24h).</li>
        </ol>
        <div className="mt-6">
          {publisher ? (
            <Link to="/dashboard" className="inline-block bg-accent-500 hover:bg-accent-400 text-white font-bold px-6 py-3 rounded">
              Ir al dashboard →
            </Link>
          ) : (
            <Link to="/auth/login" className="inline-block bg-accent-500 hover:bg-accent-400 text-white font-bold px-6 py-3 rounded">
              Empezar ahora →
            </Link>
          )}
        </div>
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Admin (mismo magic link login + check de admins table)
// ════════════════════════════════════════════════════════════════════
function AdminPanel() {
  const [tab, setTab] = useState('queue');
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/admin/stats').catch(e => { if (e.response?.status === 403) setError('No autorizado'); return { data: null }; }),
      api.get('/api/admin/listings/pending').catch(() => ({ data: { listings: [] } })),
      api.get('/api/admin/reports').catch(() => ({ data: { reports: [] } })),
    ]).then(([s, q, r]) => {
      setStats(s.data);
      setQueue(q.data?.listings || []);
      setReports(r.data?.reports || []);
      setLoading(false);
    });
  }, []);

  const approve = async (id) => {
    if (!confirm('¿Aprobar este listing?')) return;
    await api.post(`/api/admin/listings/${id}/approve`);
    setQueue(q => q.filter(l => l.id !== id));
  };
  const reject = async (id) => {
    const reason = prompt('Motivo del rechazo:');
    if (!reason) return;
    await api.post(`/api/admin/listings/${id}/reject`, { reason });
    setQueue(q => q.filter(l => l.id !== id));
  };
  const resolveReport = async (id, dismiss) => {
    const action = dismiss ? null : prompt('Acción tomada:');
    if (!dismiss && !action) return;
    await api.post(`/api/admin/reports/${id}/resolve`, { dismiss, action_taken: action });
    setReports(rs => rs.filter(r => r.id !== id));
  };

  if (error) return <Page><main className="text-center text-red-400 py-20">{error}</main></Page>;
  if (loading) return <Page><main className="text-center text-zinc-500 py-20">Cargando…</main></Page>;

  return (
    <Page>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-4">Admin</h1>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            <Stat label="Pending" value={stats.pending_listings} />
            <Stat label="Reportes" value={stats.pending_reports} />
            <Stat label="🚨 Urgentes" value={stats.urgent_reports} />
            <Stat label="Publishers" value={stats.active_publishers} />
            <Stat label="USD 24h" value={`$${(stats.revenue_24h || 0).toFixed(2)}`} />
          </div>
        )}

        <div className="flex gap-2 border-b border-zinc-800 mb-4">
          <button onClick={() => setTab('queue')} className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === 'queue' ? 'border-accent-500 text-white' : 'border-transparent text-zinc-500'}`}>
            Cola de revisión ({queue.length})
          </button>
          <button onClick={() => setTab('reports')} className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === 'reports' ? 'border-accent-500 text-white' : 'border-transparent text-zinc-500'}`}>
            Reportes ({reports.length})
          </button>
        </div>

        {tab === 'queue' && (
          <div className="space-y-2">
            {queue.length === 0 ? <p className="text-zinc-500 text-sm">Sin pendientes</p>
              : queue.map(l => (
                <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex items-center gap-3">
                  {l.cover_photo_url && <img src={l.cover_photo_url} alt="" className="w-16 h-20 object-cover rounded" />}
                  <div className="flex-1">
                    <p className="font-bold">{l.display_name}, {l.age} · {l.gender}</p>
                    <p className="text-zinc-400 text-sm">{l.city} · {l.country_code} · {l.headline}</p>
                    <p className="text-zinc-500 text-xs">{l.publisher_email}</p>
                  </div>
                  <button onClick={() => approve(l.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-2 rounded">✓ Aprobar</button>
                  <button onClick={() => reject(l.id)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded">✗ Rechazar</button>
                </div>
              ))}
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-2">
            {reports.length === 0 ? <p className="text-zinc-500 text-sm">Sin reportes</p>
              : reports.map(r => {
                const urgent = ['underage_suspected', 'trafficking_suspected'].includes(r.category);
                return (
                  <div key={r.id} className={`border rounded p-3 ${urgent ? 'bg-red-500/10 border-red-500/40' : 'bg-zinc-900 border-zinc-800'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`text-xs font-bold uppercase ${urgent ? 'text-red-400' : 'text-zinc-400'}`}>
                        {urgent && '🚨 '}{r.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-zinc-500 text-xs ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-zinc-400 text-xs mt-1">Listing: {r.listing?.display_name || r.listing_id}</p>
                    <p className="text-sm mt-2 whitespace-pre-wrap">{r.description}</p>
                    {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noopener noreferrer" className="text-accent-400 text-xs underline mt-1 inline-block">Evidencia</a>}
                    <div className="flex gap-2 mt-3">
                      <Link to={`/l/${r.listing_id}`} target="_blank" className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 py-1.5 rounded">Ver listing</Link>
                      <button onClick={() => resolveReport(r.id, false)} className="bg-accent-500 hover:bg-accent-400 text-white text-xs font-bold px-3 py-1.5 rounded">Resolver</button>
                      <button onClick={() => resolveReport(r.id, true)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-bold px-3 py-1.5 rounded">Descartar</button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════════════
// Cookie banner
// ════════════════════════════════════════════════════════════════════
const COOKIE_ACK = 'enc_cookie_ack';
function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(COOKIE_ACK)) setShow(true); } catch {}
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-zinc-900 border-t border-zinc-700 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center gap-3 text-xs">
        <p className="flex-1 text-zinc-300">
          Solo usamos cookies estrictamente necesarias. <Link to="/cookies" className="underline">Detalles</Link>.
        </p>
        <button
          onClick={() => { try { localStorage.setItem(COOKIE_ACK, '1'); } catch {} setShow(false); }}
          className="bg-accent-500 hover:bg-accent-400 text-white font-bold px-3 py-1.5 rounded shrink-0">
          OK
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════
export default function App() {
  const [ageOk, setAgeOk] = useState(() => {
    try { return localStorage.getItem(AGE_KEY) === '1'; } catch { return false; }
  });

  if (!ageOk) return <AgeGate onPass={() => setAgeOk(true)} />;

  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ListingsIndex />} />
          <Route path="/l/:id" element={<ListingDetail />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/publish" element={<PublishLanding />} />

          {/* Auth */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Publisher dashboard */}
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/dashboard/new" element={<RequireAuth><NewListingWizard /></RequireAuth>} />
          <Route path="/dashboard/listings/:id" element={<RequireAuth><EditListing /></RequireAuth>} />
          <Route path="/dashboard/verify" element={<RequireAuth><VerifyIdentity /></RequireAuth>} />

          {/* Admin */}
          <Route path="/admin" element={<RequireAuth><AdminPanel /></RequireAuth>} />

          {/* Legales */}
          <Route path="/terms" element={<Page><Terms /></Page>} />
          <Route path="/privacy" element={<Page><Privacy /></Page>} />
          <Route path="/2257" element={<Page><Compliance2257 /></Page>} />
          <Route path="/dmca" element={<Page><Dmca /></Page>} />
          <Route path="/dsa" element={<Page><Dsa /></Page>} />
          <Route path="/contact" element={<Page><Contact /></Page>} />
          <Route path="/cookies" element={<Page><CookiesPage /></Page>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <CookieBanner />
      </AuthProvider>
    </HashRouter>
  );
}
