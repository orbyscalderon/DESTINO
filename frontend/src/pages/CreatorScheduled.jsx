import { useEffect, useState } from 'react';
import { FiCalendar, FiX, FiInfo, FiFileText, FiFilm } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';

export default function CreatorScheduled() {
  const confirm = useConfirm();
  const [posts, setPosts] = useState([]);
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/creator-monetization/scheduled/mine');
      setPosts(r.data?.posts || []);
      setReels(r.data?.reels || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cancel = async (kind, id) => {
    const ok = await confirm({
      title: '¿Cancelar programación?',
      message: 'El contenido NO se publicará. Podés re-programarlo después.',
      confirmLabel: 'Cancelar programación',
      destructive: true,
    });
    if (!ok) return;
    setBusy(id);
    try {
      await api.delete(`/api/creator-monetization/scheduled/${kind}/${id}`);
      toast.success('Programación cancelada');
      load();
    } catch { toast.error('Error'); }
    finally { setBusy(null); }
  };

  const fmtDate = (s) => {
    const d = new Date(s);
    const now = new Date();
    const diffMs = d - now;
    const diffH = Math.round(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffH) < 24) {
      if (diffH > 0) return `En ${diffH}h · ${d.toLocaleString('es', { hour: '2-digit', minute: '2-digit' })}`;
      return `Hace ${Math.abs(diffH)}h`;
    }
    return d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const total = posts.length + reels.length;

  return (
    <PageShell
      icon={FiCalendar}
      title="Scheduled"
      subtitle="Contenido programado para publicarse automáticamente. El cron corre cada 2 min."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="3xl"
    >
      {/* Info */}
      <div className="card p-4 mb-5 bg-brand-500/5 border-brand-500/20 flex gap-3">
        <FiInfo className="text-brand-400 shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-gray-300 leading-relaxed">
          <p className="text-brand-300 font-bold mb-1">¿Cómo programo contenido?</p>
          <p>Al crear un post o reel, tocá "Programar" en lugar de "Publicar ahora". Acá vas a ver todo lo pendiente y cancelar si te arrepentís antes de la hora.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-dark-800 rounded-xl animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-3 opacity-40">📅</div>
          <p className="text-white font-bold mb-1">No tenés contenido programado</p>
          <p className="text-gray-500 text-sm">
            Cuando programes un post o reel, aparece acá hasta que se publique.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Posts */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-sm flex items-center gap-2">
                <FiFileText size={14} className="text-brand-400" />
                Posts
              </h2>
              <span className="text-xs text-gray-500">{posts.length}</span>
            </div>
            {posts.length === 0 ? (
              <p className="text-gray-600 text-xs italic">Ninguno programado.</p>
            ) : (
              <div className="space-y-2">
                {posts.map(p => (
                  <ScheduledRow
                    key={p.id}
                    item={p}
                    kind="post"
                    busy={busy === p.id}
                    onCancel={() => cancel('post', p.id)}
                    fmtDate={fmtDate}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Reels */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-sm flex items-center gap-2">
                <FiFilm size={14} className="text-accent-400" />
                Reels
              </h2>
              <span className="text-xs text-gray-500">{reels.length}</span>
            </div>
            {reels.length === 0 ? (
              <p className="text-gray-600 text-xs italic">Ninguno programado.</p>
            ) : (
              <div className="space-y-2">
                {reels.map(r => (
                  <ScheduledRow
                    key={r.id}
                    item={r}
                    kind="reel"
                    busy={busy === r.id}
                    onCancel={() => cancel('reel', r.id)}
                    fmtDate={fmtDate}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}

function ScheduledRow({ item, kind, busy, onCancel, fmtDate }) {
  const isReel = kind === 'reel';
  const media = isReel ? item.video_url : item.media_url;
  return (
    <div className="card p-3 flex items-center gap-3">
      {media ? (
        isReel ? (
          <video src={media} className="w-12 h-12 rounded-lg object-cover shrink-0" muted />
        ) : (
          <img src={media} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
        )
      ) : (
        <div className="w-12 h-12 rounded-lg bg-dark-800 shrink-0 flex items-center justify-center text-xl opacity-30">
          {isReel ? '🎬' : '📄'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.caption || <span className="italic text-gray-500">(sin caption)</span>}</p>
        <p className="text-[11px] text-brand-400 font-bold mt-0.5">{fmtDate(item.scheduled_for)}</p>
      </div>
      <button
        onClick={onCancel}
        disabled={busy}
        aria-label="Cancelar programación"
        className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
      >
        <FiX size={14} />
      </button>
    </div>
  );
}
