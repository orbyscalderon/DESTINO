import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4100' });

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
          Este sitio contiene contenido para adultos. Al entrar declarás ser mayor
          de 18 años y aceptás los términos de servicio.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => {
              try { localStorage.setItem(AGE_KEY, '1'); } catch {}
              onPass();
            }}
            className="w-full bg-accent-500 hover:bg-accent-400 text-white font-black py-3 rounded-lg"
          >
            Entrar — soy mayor de 18
          </button>
          <a
            href="https://www.google.com"
            className="block w-full text-zinc-500 text-xs py-2 hover:text-zinc-400"
          >
            Salir
          </a>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Header
// ════════════════════════════════════════════════════════════════════
function Header() {
  const [searchParams, setSearchParams] = useSearchParams();
  const country = searchParams.get('country') || 'DO';

  const setCountry = (c) => {
    const p = new URLSearchParams(searchParams);
    p.set('country', c);
    setSearchParams(p);
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="text-accent-500 font-black text-xl tracking-tight">
          encuentros
        </Link>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-1.5"
        >
          <option value="DO" className="bg-zinc-800">🇩🇴 R. Dominicana</option>
          <option value="MX" className="bg-zinc-800">🇲🇽 México</option>
          <option value="AR" className="bg-zinc-800">🇦🇷 Argentina</option>
          <option value="CO" className="bg-zinc-800">🇨🇴 Colombia</option>
          <option value="ES" className="bg-zinc-800">🇪🇸 España</option>
          <option value="VE" className="bg-zinc-800">🇻🇪 Venezuela</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/publish" className="text-xs text-accent-400 hover:text-accent-300 font-bold border border-accent-500/30 hover:border-accent-500/50 px-3 py-1.5 rounded">
            + Publicar anuncio
          </Link>
        </div>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════
// Listings Index
// ════════════════════════════════════════════════════════════════════
function ListingsIndex() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  const country = searchParams.get('country') || 'DO';
  const gender = searchParams.get('gender') || '';
  const availableNow = searchParams.get('available_now') === 'true';

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ country, limit: '60' });
    if (gender) params.set('gender', gender);
    if (availableNow) params.set('available_now', 'true');
    api.get(`/api/listings?${params}`)
      .then(r => setListings(r.data?.listings || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [country, gender, availableNow]);

  const setFilter = (key, value) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    setSearchParams(p);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      {/* Filtros */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 overflow-x-auto">
          <FilterPill active={!gender} onClick={() => setFilter('gender', '')}>Todos</FilterPill>
          <FilterPill active={gender === 'female'} onClick={() => setFilter('gender', 'female')}>Mujeres</FilterPill>
          <FilterPill active={gender === 'male'} onClick={() => setFilter('gender', 'male')}>Hombres</FilterPill>
          <FilterPill active={gender === 'trans'} onClick={() => setFilter('gender', 'trans')}>Trans</FilterPill>
          <FilterPill active={gender === 'couple'} onClick={() => setFilter('gender', 'couple')}>Parejas</FilterPill>
          <span className="border-l border-zinc-700 h-5 mx-2" />
          <FilterPill
            active={availableNow}
            onClick={() => setFilter('available_now', availableNow ? '' : 'true')}
            accent
          >
            ● Disponibles ahora
          </FilterPill>
        </div>
      </div>

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-zinc-900 rounded animate-pulse" />
            ))}
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

      <Footer />
    </div>
  );
}

function FilterPill({ active, accent, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded transition-colors ${
        active
          ? accent ? 'bg-accent-500 text-white' : 'bg-zinc-700 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

function ListingCard({ listing }) {
  return (
    <Link
      to={`/l/${listing.id}`}
      className="block group relative aspect-[3/4] bg-zinc-900 rounded overflow-hidden hover:ring-2 hover:ring-accent-500/50 transition-all"
    >
      {listing.cover_photo_url ? (
        <img src={listing.cover_photo_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black flex items-center justify-center text-3xl opacity-30">🔥</div>
      )}
      <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
        {listing.available_now && (
          <span className="bg-accent-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
            ● ahora
          </span>
        )}
        {listing.tier === 'top' && (
          <span className="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded uppercase">TOP</span>
        )}
        {listing.is_verified && (
          <span className="bg-blue-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">✓ verificada</span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 to-transparent">
        <p className="text-white text-sm font-bold truncate">
          {listing.display_name}, {listing.age}
        </p>
        <p className="text-zinc-300 text-[10px] truncate">{listing.headline}</p>
        {listing.rate_60min && (
          <p className="text-accent-400 text-[11px] font-bold mt-1">
            {listing.rate_currency} {listing.rate_60min}/h
          </p>
        )}
      </div>
    </Link>
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

  const trackContact = () => {
    api.post(`/api/listings/${id}/contact`).catch(() => {});
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Cargando…</div>;
  if (!listing) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Anuncio no encontrado</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white text-sm mb-4">← Volver</button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Photos */}
          <div className="space-y-2">
            {listing.cover_photo_url ? (
              <img src={listing.cover_photo_url} alt="" className="w-full rounded-lg aspect-[3/4] object-cover" />
            ) : (
              <div className="w-full aspect-[3/4] bg-zinc-900 rounded-lg flex items-center justify-center text-5xl opacity-30">🔥</div>
            )}
            {Array.isArray(listing.photos) && listing.photos.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {listing.photos.slice(1, 7).map((p, i) => (
                  <img key={i} src={p.url} alt="" className="aspect-square rounded object-cover" />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {listing.is_verified && (
                <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">✓ Verificada</span>
              )}
              {listing.tier === 'top' && (
                <span className="bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase">TOP</span>
              )}
              {listing.available_now && (
                <span className="bg-accent-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">● Disponible ahora</span>
              )}
            </div>

            <h1 className="text-2xl font-black mb-1">{listing.display_name}, {listing.age}</h1>
            <p className="text-zinc-400 text-sm mb-4">
              {listing.city}{listing.zone && ` · ${listing.zone}`} · {listing.country_code}
            </p>

            <p className="text-zinc-200 text-sm leading-relaxed mb-4">{listing.headline}</p>
            {listing.description && (
              <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed mb-4">{listing.description}</p>
            )}

            {/* Físicos */}
            {(listing.height_cm || listing.body_type || listing.ethnicity) && (
              <div className="border-t border-zinc-800 pt-3 mb-3">
                <p className="text-zinc-500 text-xs uppercase font-bold mb-1.5">Físico</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {listing.height_cm && <span className="text-zinc-300">{listing.height_cm}cm</span>}
                  {listing.body_type && <span className="text-zinc-300">· {listing.body_type}</span>}
                  {listing.ethnicity && <span className="text-zinc-300">· {listing.ethnicity}</span>}
                </div>
              </div>
            )}

            {/* Servicios */}
            {Array.isArray(listing.services) && listing.services.length > 0 && (
              <div className="border-t border-zinc-800 pt-3 mb-3">
                <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Servicios</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.services.map(s => (
                    <span key={s} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Tarifas */}
            {(listing.rate_30min || listing.rate_60min || listing.rate_overnight) && (
              <div className="border-t border-zinc-800 pt-3 mb-3">
                <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Tarifas ({listing.rate_currency})</p>
                <div className="space-y-1 text-sm">
                  {listing.rate_30min && (
                    <div className="flex justify-between"><span className="text-zinc-400">30 min</span><span className="text-accent-400 font-bold">{listing.rate_30min}</span></div>
                  )}
                  {listing.rate_60min && (
                    <div className="flex justify-between"><span className="text-zinc-400">1 hora</span><span className="text-accent-400 font-bold">{listing.rate_60min}</span></div>
                  )}
                  {listing.rate_overnight && (
                    <div className="flex justify-between"><span className="text-zinc-400">Noche</span><span className="text-accent-400 font-bold">{listing.rate_overnight}</span></div>
                  )}
                </div>
              </div>
            )}

            {/* Modalidades */}
            <div className="border-t border-zinc-800 pt-3 mb-4">
              <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Modalidad</p>
              <div className="flex flex-wrap gap-1.5">
                {listing.available_incall && <span className="bg-accent-500/20 text-accent-300 text-xs px-2 py-1 rounded">🏠 Recibo</span>}
                {listing.available_outcall && <span className="bg-accent-500/20 text-accent-300 text-xs px-2 py-1 rounded">🚗 Voy</span>}
                {listing.available_online && <span className="bg-accent-500/20 text-accent-300 text-xs px-2 py-1 rounded">📹 Online</span>}
              </div>
            </div>

            {/* Contacto */}
            <div className="border-t border-zinc-800 pt-3 space-y-2">
              <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Contacto</p>
              {listing.whatsapp && (
                <a
                  href={`https://wa.me/${listing.whatsapp.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={trackContact}
                  className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded text-center"
                >
                  💬 WhatsApp · {listing.whatsapp}
                </a>
              )}
              {listing.telegram && (
                <a
                  href={`https://t.me/${listing.telegram.replace('@','')}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={trackContact}
                  className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm py-3 rounded text-center"
                >
                  ✈ Telegram · @{listing.telegram.replace('@','')}
                </a>
              )}
              {listing.signal_number && (
                <a
                  href={`https://signal.me/#p/${listing.signal_number.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={trackContact}
                  className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm py-3 rounded text-center"
                >
                  🔒 Signal · {listing.signal_number}
                </a>
              )}
            </div>

            {/* Address (si publica) */}
            {listing.address && listing.available_incall && (
              <div className="border-t border-zinc-800 pt-3 mt-3">
                <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Ubicación</p>
                <p className="text-sm text-zinc-300">{listing.address}</p>
              </div>
            )}

            {/* Report */}
            <div className="border-t border-zinc-800 pt-3 mt-4">
              <button
                onClick={() => setShowReport(true)}
                className="text-xs text-zinc-500 hover:text-rose-400"
              >
                🚩 Reportar este anuncio
              </button>
            </div>
          </div>
        </div>
      </main>

      {showReport && <ReportModal listingId={id} onClose={() => setShowReport(false)} />}
      <Footer />
    </div>
  );
}

function ReportModal({ listingId, onClose }) {
  const [category, setCategory] = useState('fake_photos');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (description.length < 10) return alert('Descripción muy corta');
    setSending(true);
    try {
      await api.post(`/api/listings/${listingId}/report`, { category, description });
      alert('Reporte enviado. Lo revisamos en máximo 48h.');
      onClose();
    } catch {
      alert('Error');
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-zinc-900 rounded-lg max-w-md w-full p-5 border border-zinc-700">
        <h3 className="text-white font-bold mb-3">Reportar anuncio</h3>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 mb-3">
          <option value="underage_suspected" className="bg-zinc-800">🚨 Menor de edad sospechado</option>
          <option value="trafficking_suspected" className="bg-zinc-800">🚨 Posible trata</option>
          <option value="fake_photos" className="bg-zinc-800">Fotos falsas</option>
          <option value="scam_payment" className="bg-zinc-800">Estafa de pago</option>
          <option value="aggressive_behavior" className="bg-zinc-800">Comportamiento agresivo</option>
          <option value="fake_identity" className="bg-zinc-800">Identidad falsa</option>
          <option value="spam" className="bg-zinc-800">Spam</option>
          <option value="other" className="bg-zinc-800">Otro</option>
        </select>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Detalles del reporte (mínimo 10 caracteres)"
          rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 mb-3 resize-none"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-white text-sm py-2 rounded">Cancelar</button>
          <button onClick={submit} disabled={sending} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold py-2 rounded">
            {sending ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Publish form (creator onboarding)
// ════════════════════════════════════════════════════════════════════
function PublishForm() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black mb-2">Publicar anuncio</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Para publicar tu anuncio necesitás (1) verificar tu edad con documento oficial,
          (2) elegir un plan de suscripción mensual, (3) completar tu información.
        </p>
        <div className="bg-zinc-900 border border-accent-500/30 rounded-lg p-6 text-center">
          <p className="text-accent-400 font-bold mb-2">Onboarding flow pendiente de implementación</p>
          <p className="text-zinc-400 text-sm mb-4">
            El flujo de age verification (Onfido/Jumio) + payment (Verotel/MobiusPay)
            se conecta cuando tengamos el merchant account aprobado.
          </p>
          <p className="text-zinc-500 text-xs">
            Si querés publicar mientras tanto, escribinos a soporte@encuentros.app
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Footer
// ════════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer className="border-t border-zinc-800 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-6 text-xs text-zinc-500 space-y-2">
        <p className="text-zinc-400 font-bold">encuentros — directorio de adultos</p>
        <p>Operado por entidad legal independiente. NO afiliado con ninguna otra plataforma.</p>
        <p>Todos los anunciantes son mayores de 18 años verificados. Si sospechás de un menor o de trata, reportá inmediatamente.</p>
        <div className="flex gap-3 pt-2">
          <a href="#" className="hover:text-zinc-300">Términos</a>
          <a href="#" className="hover:text-zinc-300">Privacidad</a>
          <a href="#" className="hover:text-zinc-300">2257 Statement</a>
          <a href="#" className="hover:text-zinc-300">DMCA</a>
        </div>
      </div>
    </footer>
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
      <Routes>
        <Route path="/" element={<ListingsIndex />} />
        <Route path="/l/:id" element={<ListingDetail />} />
        <Route path="/publish" element={<PublishForm />} />
      </Routes>
    </HashRouter>
  );
}
