import { supabase } from '../lib/supabase.js';
import { COIN_VALUE_USD, PLATFORM_FEE_RATE } from './coinController.js';
import { logAdmin } from '../lib/auditLog.js';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SEARCH — busca users, shows y reports en una sola query
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/search?q=texto
export const globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [], shows: [], reports: [] });

    // Escape de % para que el LIKE no se rompa con texto del usuario
    const safe = q.replace(/[%_\\]/g, '\\$&');
    const like = `%${safe}%`;

    const [u, s, r] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, username, avatar_url, email, is_creator, is_verified, is_adult_creator')
        .or(`full_name.ilike.${like},username.ilike.${like},email.ilike.${like}`)
        .limit(10),
      supabase.from('live_shows')
        .select('id, title, status, host_id, created_at')
        .ilike('title', like)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('reports')
        .select('id, reason, status, reporter_id, reported_id, created_at')
        .ilike('reason', like)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    res.json({
      users:   u.data || [],
      shows:   s.data || [],
      reports: r.data || [],
    });
  } catch (err) {
    console.error('[globalSearch]', err);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE DIARIO — para gráfico
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/revenue-daily?days=30
export const revenueDaily = async (req, res) => {
  try {
    const days = Math.max(7, Math.min(90, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    // Coin purchases (100% para la plataforma)
    const { data: purchases } = await supabase
      .from('coin_transactions')
      .select('amount, created_at, metadata')
      .eq('type', 'purchase')
      .gte('created_at', since);

    // Tips/gifts/PPV/etc — la plataforma gana el 30% de cada uno
    const { data: feeTx } = await supabase
      .from('coin_transactions')
      .select('amount, created_at, type')
      .in('type', ['tip_sent', 'gift_sent', 'private_show', 'ppv_spent', 'post_purchase', 'video_purchase'])
      .gte('created_at', since);

    // Bucket por día YYYY-MM-DD
    const buckets = {};
    const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);

    for (const p of purchases || []) {
      const k = dayKey(p.created_at);
      const usd = p.metadata?.price_usd || (p.amount * COIN_VALUE_USD);
      buckets[k] = buckets[k] || { date: k, coin_sales: 0, commission: 0 };
      buckets[k].coin_sales += parseFloat(usd) || 0;
    }

    for (const t of feeTx || []) {
      const k = dayKey(t.created_at);
      const usd = Math.abs(t.amount) * COIN_VALUE_USD * PLATFORM_FEE_RATE;
      buckets[k] = buckets[k] || { date: k, coin_sales: 0, commission: 0 };
      buckets[k].commission += usd;
    }

    // Rellenar días sin actividad con 0 para que el chart sea continuo
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const k = d.toISOString().slice(0, 10);
      const b = buckets[k] || { date: k, coin_sales: 0, commission: 0 };
      result.push({
        date: k,
        coin_sales: Number(b.coin_sales.toFixed(2)),
        commission: Number(b.commission.toFixed(2)),
        total: Number((b.coin_sales + b.commission).toFixed(2)),
      });
    }

    res.set('Cache-Control', 'private, max-age=60');
    res.json({ days, series: result });
  } catch (err) {
    console.error('[revenueDaily]', err);
    res.status(500).json({ error: 'Error generando revenue diario' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG — read access para admin
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-log?limit=50&action=user.*&admin_id=...
export const getAuditLog = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const action = (req.query.action || '').trim();
    const adminId = (req.query.admin_id || '').trim();

    let q = supabase
      .from('admin_audit_log')
      .select('id, admin_id, admin_email, action, target_type, target_id, metadata, ip, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) {
      // Soporte wildcard básico: 'user.*' → user.%
      const pattern = action.includes('*') ? action.replace(/\*/g, '%') : action;
      if (pattern.includes('%')) q = q.like('action', pattern);
      else q = q.eq('action', action);
    }
    if (adminId && /^[0-9a-f-]{36}$/i.test(adminId)) {
      q = q.eq('admin_id', adminId);
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({ log: data || [] });
  } catch (err) {
    console.error('[getAuditLog]', err);
    res.status(500).json({ error: 'Error obteniendo audit log' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV — exporta dataset crudo
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/export/:dataset?format=csv
//
// Datasets soportados:
//   - users:         id, email, full_name, username, country, is_creator, is_verified, coins_balance, created_at
//   - withdrawals:   id, creator_id, amount_usd, payout_method, status, created_at, processed_at
//   - revenue:       (granularidad por día — mismos campos que /revenue-daily)
//   - audit_log:     id, admin_email, action, target_type, target_id, created_at
//
// Implementación: usamos streaming simple — el dataset se construye en memoria.
// Para >100k filas convendría streamear desde DB con cursor, pero esos volúmenes
// no aparecen en admin export todavía.

function toCsvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => toCsvCell(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

export const exportDataset = async (req, res) => {
  try {
    const { dataset } = req.params;

    let rows = [];
    let columns = [];

    if (dataset === 'users') {
      const { data } = await supabase.from('profiles')
        .select('id, full_name, username, country, is_creator, is_verified, is_premium, is_adult_creator, coins_balance, created_at')
        .order('created_at', { ascending: false })
        .limit(50000);
      rows = data || [];
      columns = ['id', 'full_name', 'username', 'country', 'is_creator', 'is_verified', 'is_premium', 'is_adult_creator', 'coins_balance', 'created_at'];
    } else if (dataset === 'withdrawals') {
      const { data } = await supabase.from('withdrawal_requests')
        .select('id, creator_id, amount_usd, payout_method, status, created_at, processed_at, notes')
        .order('created_at', { ascending: false })
        .limit(50000);
      rows = data || [];
      columns = ['id', 'creator_id', 'amount_usd', 'payout_method', 'status', 'created_at', 'processed_at', 'notes'];
    } else if (dataset === 'audit_log') {
      const { data } = await supabase.from('admin_audit_log')
        .select('id, admin_email, action, target_type, target_id, ip, created_at')
        .order('created_at', { ascending: false })
        .limit(50000);
      rows = data || [];
      columns = ['id', 'admin_email', 'action', 'target_type', 'target_id', 'ip', 'created_at'];
    } else if (dataset === 'transactions') {
      const { data } = await supabase.from('coin_transactions')
        .select('id, user_id, amount, type, description, created_at')
        .order('created_at', { ascending: false })
        .limit(50000);
      rows = data || [];
      columns = ['id', 'user_id', 'amount', 'type', 'description', 'created_at'];
    } else {
      return res.status(400).json({ error: 'Dataset no soportado' });
    }

    logAdmin(req, 'export.csv', null, { dataset, rows: rows.length });

    const csv = rowsToCsv(rows, columns);
    const filename = `${dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[exportDataset]', err);
    res.status(500).json({ error: 'Error exportando' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS LIST con filtros avanzados (paginated)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users-filtered?q=&country=&from=&to=&min_spent=&role=&page=
export const getUsersFiltered = async (req, res) => {
  try {
    const q       = (req.query.q || '').trim();
    const country = (req.query.country || '').trim().toUpperCase();
    const from    = (req.query.from || '').trim();
    const to      = (req.query.to || '').trim();
    const role    = (req.query.role || '').trim(); // creator | adult | premium | verified | admin
    const page    = Math.max(0, parseInt(req.query.page) || 0);
    const pageSize = 50;

    let query = supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, country, is_creator, is_verified, is_premium, premium_tier, is_adult_creator, coins_balance, created_at', { count: 'estimated' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (q) {
      const safe = q.replace(/[%_\\]/g, '\\$&');
      query = query.or(`full_name.ilike.%${safe}%,username.ilike.%${safe}%`);
    }
    if (country && /^[A-Z]{2}$/.test(country)) query = query.eq('country', country);
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('created_at', from);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to))   query = query.lte('created_at', to + 'T23:59:59.999Z');

    if (role === 'creator')   query = query.eq('is_creator', true);
    if (role === 'adult')     query = query.eq('is_adult_creator', true);
    if (role === 'premium')   query = query.eq('is_premium', true);
    if (role === 'verified')  query = query.eq('is_verified', true);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      users: data || [],
      page,
      page_size: pageSize,
      total_estimated: count || 0,
      has_more: (data?.length || 0) === pageSize,
    });
  } catch (err) {
    console.error('[getUsersFiltered]', err);
    res.status(500).json({ error: 'Error filtrando usuarios' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNNEL ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/funnel?days=30
//
// Devuelve el funnel ordenado con count distinct de users por evento + % de
// conversión vs el primer paso. Permite ver dónde el user drop-eea.
export const getFunnel = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const STEPS = [
      'signup_completed',
      'onboarding_started',
      'onboarding_completed',
      'first_like',
      'first_match',
      'first_message',
      'first_purchase',
      'first_tip',
      'first_subscription',
      'became_creator',
      'first_live_show',
    ];

    // Una query por step — más simple que un GROUP BY con cohort restrictivo
    const results = await Promise.all(STEPS.map(async (step) => {
      const { count } = await supabase
        .from('funnel_events')
        .select('user_id', { count: 'estimated', head: true })
        .eq('event', step)
        .gte('created_at', since);
      return { step, count: count || 0 };
    }));

    const base = results[0]?.count || 1;
    const enriched = results.map((r, i) => ({
      step: r.step,
      count: r.count,
      pct_of_top: base ? +(r.count / base * 100).toFixed(1) : 0,
      pct_of_prev: i === 0 ? 100 :
        results[i - 1].count ? +(r.count / results[i - 1].count * 100).toFixed(1) : 0,
    }));

    res.json({ days, steps: enriched });
  } catch (err) {
    console.error('[funnel]', err);
    res.status(500).json({ error: 'Error generando funnel' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK ACTIONS — operaciones masivas
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/users/bulk { user_ids: [], action: 'verify' | 'unverify' | 'creator' | 'uncreator' | 'delete' }
export const bulkUserAction = async (req, res) => {
  try {
    const { user_ids, action } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids debe ser array no vacío' });
    }
    if (user_ids.length > 200) {
      return res.status(400).json({ error: 'Máximo 200 users por bulk action' });
    }
    if (user_ids.includes(req.user.id)) {
      return res.status(400).json({ error: 'No puedes incluirte a ti mismo en la selección' });
    }

    const validIds = user_ids.filter(id => /^[0-9a-f-]{36}$/i.test(id));
    if (validIds.length === 0) return res.status(400).json({ error: 'Ningún user_id válido' });

    let results = { ok: 0, failed: 0 };

    if (action === 'verify' || action === 'unverify') {
      const { error, count } = await supabase
        .from('profiles')
        .update({ is_verified: action === 'verify' })
        .in('id', validIds);
      if (error) throw error;
      results.ok = count || validIds.length;
    } else if (action === 'creator' || action === 'uncreator') {
      const { error, count } = await supabase
        .from('profiles')
        .update({ is_creator: action === 'creator' })
        .in('id', validIds);
      if (error) throw error;
      results.ok = count || validIds.length;
    } else if (action === 'delete') {
      // delete uno a uno porque supabase.auth.admin.deleteUser no acepta array
      for (const id of validIds) {
        try { await supabase.auth.admin.deleteUser(id); results.ok++; }
        catch { results.failed++; }
      }
    } else {
      return res.status(400).json({ error: 'action no soportada' });
    }

    logAdmin(req, `user.bulk_${action}`, null, {
      count: validIds.length, ok: results.ok, failed: results.failed,
    });

    res.json({ ...results, total: validIds.length });
  } catch (err) {
    console.error('[bulkUserAction]', err);
    res.status(500).json({ error: 'Error en bulk action' });
  }
};
