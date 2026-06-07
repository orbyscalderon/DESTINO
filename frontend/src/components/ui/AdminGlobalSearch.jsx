import { useState, useEffect, useRef } from 'react';
import { FiSearch, FiX, FiUser, FiRadio, FiFlag } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';

// Búsqueda global del admin panel.
// Debounce 300ms para no atomizar requests al backend mientras tipeas.
// Resultados agrupados: users, shows, reports.
// Cmd/Ctrl+K abre el input desde cualquier lugar del admin.

export default function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const timeoutRef = useRef(null);

  // Atajo de teclado Cmd/Ctrl+K para abrir
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounce search
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!q || q.length < 2) {
      setResults(null);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/admin/search?q=${encodeURIComponent(q)}`);
        setResults(data);
      } catch {
        setResults({ users: [], shows: [], reports: [] });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [q]);

  const close = () => {
    setOpen(false);
    setQ('');
    setResults(null);
  };

  const totalResults = (results?.users?.length || 0) + (results?.shows?.length || 0) + (results?.reports?.length || 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 text-xs text-gray-400 transition-all duration-200 ease-out-expo w-full max-w-xs"
        aria-label="Buscar globalmente"
      >
        <FiSearch size={13} />
        <span className="flex-1 text-left">Buscar usuarios, shows…</span>
        <kbd className="text-[9px] bg-dark-900 border border-white/10 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 glass-strong pt-16 px-4"
          onClick={close}
        >
          <div
            className="max-w-2xl mx-auto glass-strong rounded-3xl overflow-hidden shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-3 border-b border-white/10">
              <FiSearch size={16} className="text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Email, username, nombre, título de show, razón de reporte…"
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600"
                autoComplete="off"
              />
              {loading && (
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <button onClick={close} className="text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors" aria-label="Cerrar">
                <FiX size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!results && (
                <p className="text-gray-600 text-xs text-center py-8">
                  Escribe al menos 2 caracteres para buscar
                </p>
              )}
              {results && totalResults === 0 && !loading && (
                <p className="text-gray-600 text-xs text-center py-8">
                  Sin resultados para "{q}"
                </p>
              )}

              {results?.users?.length > 0 && (
                <Section title="Usuarios" icon={FiUser} count={results.users.length}>
                  {results.users.map(u => (
                    <Link
                      key={u.id}
                      to={`/profile/${u.id}`}
                      onClick={close}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <img
                        src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{u.full_name || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500 truncate">@{u.username || '—'} · {u.email}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {u.is_verified && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">VER</span>}
                        {u.is_creator && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">CRE</span>}
                        {u.is_adult_creator && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">18+</span>}
                      </div>
                    </Link>
                  ))}
                </Section>
              )}

              {results?.shows?.length > 0 && (
                <Section title="Shows" icon={FiRadio} count={results.shows.length}>
                  {results.shows.map(s => (
                    <Link
                      key={s.id}
                      to={`/shows/${s.id}`}
                      onClick={close}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <div className="w-8 h-8 rounded bg-orange-500/20 flex items-center justify-center shrink-0">
                        <FiRadio size={14} className="text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{s.title || 'Sin título'}</p>
                        <p className="text-xs text-gray-500">
                          {s.status} · {new Date(s.created_at).toLocaleDateString('es')}
                        </p>
                      </div>
                    </Link>
                  ))}
                </Section>
              )}

              {results?.reports?.length > 0 && (
                <Section title="Reportes" icon={FiFlag} count={results.reports.length}>
                  {results.reports.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                    >
                      <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center shrink-0">
                        <FiFlag size={14} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{r.reason || 'Sin razón'}</p>
                        <p className="text-xs text-gray-500">
                          {r.status} · {new Date(r.created_at).toLocaleDateString('es')}
                        </p>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </div>

            <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between text-[10px] text-gray-600">
              <span>↵ abrir · esc cerrar · ⌘K reabrir</span>
              {totalResults > 0 && <span>{totalResults} resultado{totalResults !== 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, icon: Icon, count, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Icon size={11} className="text-gray-500" />
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">{title}</p>
        <span className="text-[10px] text-gray-600">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
