import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiRss, FiUser, FiUsers, FiHeart, FiCamera, FiSearch,
  FiMic, FiCheck, FiChevronRight,
} from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para tab COMUNIDAD.
//
//   Col 1 (col-span-3): "Descubre la Comunidad" — 11 quick links con icons
//   Col 2 (col-span-9, grid sub-cols-4):
//     · Super-header "CONCURSOS" (col-span-2)  · Super-header "POPULAR" (col-span-2)
//     · 4 columnas con 4 creator avatars cada una (2x2 grid o split por mes)
//
// El layout matchea PH literalmente: titulos en orange-400 para los nombres,
// verified badge azul circular abajo a la izquierda de cada avatar.

const DISCOVER_LINKS = [
  { id: 'my-rss',          label: 'Mi RSS',                          icon: FiRss,    to: '/notifications' },
  { id: 'my-profile',      label: 'Mi Perfil',                       icon: FiUser,   to: '/profile' },
  { id: 'contests',        label: 'Concursos de modelos',            icon: FiMic,    to: '/adult?tab=comunidad&section=contests' },
  { id: 'community-rss',   label: 'Comunidad RSS',                   icon: FiRss,    to: '/adult?tab=comunidad' },
  { id: 'top-members',     label: 'Miembros importantes',            icon: FiUsers,  to: '/leaderboard' },
  { id: 'new-female',      label: 'Chicas Verificadas Más Nuevas',   icon: FiUser,   to: '/adult?tab=creators&gender=female&sort=new&verified=1', genderTone: 'rose' },
  { id: 'new-couples',     label: 'Parejas Verificadas Más Nuevas',  icon: FiUser,   to: '/adult?tab=creators&gender=couple&sort=new&verified=1', genderTone: 'accent' },
  { id: 'new-male',        label: 'Chicos Verificados Más Nuevos',   icon: FiUser,   to: '/adult?tab=creators&gender=male&sort=new&verified=1', genderTone: 'blue' },
  { id: 'popular-models',  label: 'Modelos Verificados Populares',   icon: FiHeart,  to: '/adult?tab=creators&sort=popular&verified=1' },
  { id: 'online',          label: 'Miembros en Línea',               icon: FiCamera, to: '/adult?tab=creators&online=1' },
  { id: 'search',          label: 'Buscar un miembro',               icon: FiSearch, to: '/search' },
];

export default function ComunidadMegamenu({ onClose }) {
  const [creators, setCreators] = useState([]);

  // Una sola llamada — distribuye en 4 buckets por slice.
  // Cuando el backend tenga ?contest= y ?period= dedicados, se puede
  // hacer 4 calls en paralelo a los endpoints específicos.
  useEffect(() => {
    api.get('/api/creator/discover?sort=popular&limit=16')
      .then(({ data }) => setCreators(data.creators || []))
      .catch(() => {});
  }, []);

  const buckets = {
    editorsJune:    creators.slice(0, 2),
    editorsAlt:     creators.slice(2, 4),
    viewsMay:       creators.slice(4, 6),
    viewsApril:     creators.slice(6, 8),
    verifiedTop:    creators.slice(8, 12),
    newPopular:     creators.slice(12, 16),
  };

  return (
    <div
      role="menu"
      aria-label="Menú de comunidad"
      className="relative bg-dark-900 border-y border-white/10 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">

        {/* ── Col 1: Descubre la Comunidad ── */}
        <div className="col-span-3">
          <button
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
            onClick={onClose}
          >
            Descubre la Comunidad
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
          <ul className="space-y-0.5">
            {DISCOVER_LINKS.map(l => {
              const Icon = l.icon;
              return (
                <li key={l.id}>
                  <Link
                    to={l.to}
                    onClick={onClose}
                    role="menuitem"
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors"
                  >
                    <Icon size={13} className={
                      l.genderTone === 'rose'   ? 'text-rose-400' :
                      l.genderTone === 'blue'   ? 'text-blue-400' :
                      l.genderTone === 'accent' ? 'text-accent-400' :
                      'text-gray-500'
                    } />
                    <span className="truncate">{l.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Col 2: 4 preview columns con super-headers ── */}
        <div className="col-span-9 grid grid-cols-4 gap-4">
          {/* Super-headers — span 2 cols cada uno */}
          <h4 className="col-span-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">
            CONCURSOS
          </h4>
          <h4 className="col-span-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">
            POPULAR
          </h4>

          {/* Col 1 — Elección de espectadores (June) */}
          <ColumnAvatarGrid
            title="Elección de espectadores"
            subtitle="June"
            creators={[...buckets.editorsJune, ...buckets.editorsAlt]}
            onClose={onClose}
            href="/adult?tab=creators&contest=editors-choice"
          />

          {/* Col 2 — Más vistos (May + April split) */}
          <SplitColumnAvatars
            title="Más vistos"
            blocks={[
              { label: 'May',   creators: buckets.viewsMay   },
              { label: 'April', creators: buckets.viewsApril },
            ]}
            onClose={onClose}
            href="/adult?tab=creators&sort=views"
          />

          {/* Col 3 — Verificados Populares */}
          <ColumnAvatarGrid
            title="Verificados Populares"
            creators={buckets.verifiedTop}
            onClose={onClose}
            href="/adult?tab=creators&verified=1&sort=popular"
          />

          {/* Col 4 — Nuevo y Popular */}
          <ColumnAvatarGrid
            title="Nuevo y Popular"
            creators={buckets.newPopular}
            onClose={onClose}
            href="/adult?tab=creators&sort=new-popular"
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────── Sub-componentes ─────────── */

function ColumnAvatarGrid({ title, subtitle, creators, onClose, href }) {
  return (
    <div>
      <Link
        to={href}
        onClick={onClose}
        className="flex items-center gap-1 text-white text-sm font-black mb-1 hover:text-brand-300 transition-colors group"
      >
        {title}
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </Link>
      {subtitle && (
        <p className="text-gray-500 text-[10px] font-medium mb-2">{subtitle}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {creators.length === 0 && [...Array(4)].map((_, i) => (
          <div key={i} className="aspect-square bg-dark-800 rounded-md animate-pulse" />
        ))}
        {creators.map(c => <CreatorAvatar key={c.id} creator={c} onClose={onClose} />)}
      </div>
    </div>
  );
}

function SplitColumnAvatars({ title, blocks, onClose, href }) {
  return (
    <div>
      <Link
        to={href}
        onClick={onClose}
        className="flex items-center gap-1 text-white text-sm font-black mb-1 hover:text-brand-300 transition-colors group"
      >
        {title}
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </Link>
      {blocks.map((b, i) => (
        <div key={b.label} className={i === 0 ? '' : 'mt-3'}>
          <p className="text-gray-500 text-[10px] font-medium mb-2">{b.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {b.creators.length === 0 && [...Array(2)].map((_, j) => (
              <div key={j} className="aspect-square bg-dark-800 rounded-md animate-pulse" />
            ))}
            {b.creators.map(c => <CreatorAvatar key={c.id} creator={c} onClose={onClose} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreatorAvatar({ creator, onClose }) {
  return (
    <Link
      to={`/profile/${creator.id}`}
      onClick={onClose}
      className="block group"
    >
      <div className="relative aspect-square rounded-md overflow-hidden bg-dark-800 ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
        {creator.avatar_url ? (
          <img
            src={creator.avatar_url}
            alt={creator.full_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-900/40 to-accent-900/40 flex items-center justify-center text-white font-black text-lg">
            {creator.full_name?.[0]?.toUpperCase()}
          </div>
        )}
        {creator.is_verified && (
          <span
            className="absolute bottom-1 left-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center ring-2 ring-dark-900"
            aria-label="Verificado"
          >
            <FiCheck size={9} className="text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      <p className="text-orange-400 text-[11px] font-bold mt-1 truncate group-hover:text-orange-300 transition-colors">
        {creator.full_name}
      </p>
    </Link>
  );
}
