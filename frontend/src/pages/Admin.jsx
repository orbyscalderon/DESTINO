import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUsers, FiHeart, FiMessageCircle, FiDollarSign, FiShield, FiStar, FiTrash2 } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

export default function Admin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, matches: 0, messages: 0, premium: 0 });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/users'),
      ]);
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users);
    } catch (err) {
      if (err.response?.status === 403) {
        navigate('/home', { replace: true });
      } else {
        toast.error('Error cargando datos admin');
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = async (userId, current) => {
    try {
      await api.patch('/api/admin/users/premium', { userId, isPremium: !current });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_premium: !current } : u));
      toast.success(`Premium ${!current ? 'activado' : 'desactivado'}`);
    } catch {
      toast.error('Error actualizando premium');
    }
  };

  const toggleVerified = async (userId, current) => {
    try {
      await api.patch('/api/admin/users/verified', { userId, isVerified: !current });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_verified: !current } : u));
      toast.success(`Verificado ${!current ? 'activado' : 'desactivado'}`);
    } catch {
      toast.error('Error actualizando verificación');
    }
  };

  const deleteUser = async (userId, name) => {
    if (!confirm(`¿Eliminar a "${name}"? Esta acción es irreversible.`)) return;
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('Usuario eliminado');
    } catch {
      toast.error('Error eliminando usuario');
    }
  };

  const statCards = [
    { icon: FiUsers, label: 'Usuarios', value: stats.users, color: 'text-blue-400' },
    { icon: FiHeart, label: 'Matches', value: stats.matches, color: 'text-brand-400' },
    { icon: FiMessageCircle, label: 'Mensajes', value: stats.messages, color: 'text-green-400' },
    { icon: FiDollarSign, label: 'Premium', value: stats.premium, color: 'text-yellow-400' },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-24">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-black mb-6 gradient-text">Panel Admin</h1>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {statCards.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="card p-4">
              <Icon size={20} className={`${color} mb-2`} />
              <div className="text-2xl font-bold text-white">{value?.toLocaleString()}</div>
              <div className="text-gray-500 text-sm">{label}</div>
            </div>
          ))}
        </div>

        <h2 className="font-semibold text-gray-300 mb-3 text-sm">Últimos registros</h2>
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="card p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.full_name || 'Sin nombre'}</p>
                <p className="text-xs text-gray-500">@{u.username || 'sin-username'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => togglePremium(u.id, u.is_premium)}
                  title="Toggle premium"
                  className={`p-1.5 rounded-lg transition-colors ${u.is_premium ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-gray-500'}`}
                >
                  <FiStar size={14} />
                </button>
                <button
                  onClick={() => toggleVerified(u.id, u.is_verified)}
                  title="Toggle verificado"
                  className={`p-1.5 rounded-lg transition-colors ${u.is_verified ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-500'}`}
                >
                  <FiShield size={14} />
                </button>
                <button
                  onClick={() => deleteUser(u.id, u.full_name || u.username)}
                  title="Eliminar usuario"
                  className="p-1.5 rounded-lg transition-colors bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                >
                  <FiTrash2 size={14} />
                </button>
                <p className="text-xs text-gray-600">{new Date(u.created_at).toLocaleDateString('es')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
