import { supabase } from '../lib/supabase.js';
import { sendPushToUser } from './notificationController.js';

// ── CRUD ───────────────────────────────────────────────────────────────
// POST /api/recurring-shows  body: { title, description?, category?, recurrence, day_of_week?, hour, minute?, duration_minutes?, timezone? }
export const createRecurring = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title?.trim()) return res.status(400).json({ error: 'title requerido' });
    if (b.recurrence === 'weekly' && (b.day_of_week == null || b.day_of_week < 0 || b.day_of_week > 6)) {
      return res.status(400).json({ error: 'day_of_week 0-6 requerido para weekly' });
    }
    if (b.hour == null || b.hour < 0 || b.hour > 23) return res.status(400).json({ error: 'hour 0-23 requerido' });

    const { data, error } = await supabase
      .from('recurring_shows')
      .insert({
        host_id: req.user.id,
        title: b.title.trim().slice(0, 200),
        description: b.description?.trim()?.slice(0, 1000) || null,
        category: b.category || null,
        recurrence: b.recurrence === 'daily' ? 'daily' : 'weekly',
        day_of_week: b.recurrence === 'daily' ? null : parseInt(b.day_of_week),
        hour: parseInt(b.hour),
        minute: parseInt(b.minute) || 0,
        timezone: b.timezone?.slice(0, 50) || 'UTC',
        duration_minutes: Math.max(5, Math.min(360, parseInt(b.duration_minutes) || 60)),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ recurring: data });
  } catch (err) {
    console.error('[createRecurring]', err);
    res.status(500).json({ error: 'Error creando' });
  }
};

// GET /api/recurring-shows  → del user logueado
export const listMyRecurring = async (req, res) => {
  try {
    const { data } = await supabase
      .from('recurring_shows')
      .select('*')
      .eq('host_id', req.user.id)
      .order('created_at', { ascending: false });
    res.json({ recurring: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// DELETE /api/recurring-shows/:id
export const deleteRecurring = async (req, res) => {
  try {
    const { error } = await supabase
      .from('recurring_shows')
      .delete()
      .eq('id', req.params.id)
      .eq('host_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PATCH /api/recurring-shows/:id  body: { active }
export const toggleRecurring = async (req, res) => {
  try {
    const { error } = await supabase
      .from('recurring_shows')
      .update({ active: !!req.body.active })
      .eq('id', req.params.id)
      .eq('host_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// ── Cron jobs ─────────────────────────────────────────────────────────
// Genera instancias futuras (próximos 7d) para todos los recurring activos.
// Evita duplicados verificando si ya existe live_shows con recurring_id+scheduled_at.
export async function generateUpcomingFromRecurring() {
  try {
    const { data: recurring } = await supabase
      .from('recurring_shows')
      .select('*')
      .eq('active', true);

    if (!recurring?.length) return { created: 0 };

    let created = 0;
    const now = new Date();

    for (const r of recurring) {
      // Calcular las próximas 1-2 instancias en los próximos 7 días
      const upcoming = computeNextOccurrences(r, now, 7);

      for (const occursAt of upcoming) {
        // Check si ya existe (idempotente)
        const { data: existing } = await supabase
          .from('live_shows')
          .select('id')
          .eq('recurring_id', r.id)
          .eq('scheduled_at', occursAt.toISOString())
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from('live_shows').insert({
          host_id: r.host_id,
          title: r.title,
          description: r.description,
          category: r.category,
          status: 'scheduled',
          scheduled_at: occursAt.toISOString(),
          recurring_id: r.id,
        });
        if (!error) created++;
      }
    }
    return { created };
  } catch (err) {
    console.error('[generateUpcoming]', err);
    return { created: 0 };
  }
}

// Push recordatorio 15 min antes a seguidores del host.
export async function sendShowReminders() {
  try {
    const cutoffEnd = new Date(Date.now() + 16 * 60 * 1000); // 16 min para margen
    const cutoffStart = new Date(Date.now() + 14 * 60 * 1000); // 14 min

    const { data: due } = await supabase
      .from('live_shows')
      .select('id, host_id, title, scheduled_at')
      .eq('status', 'scheduled')
      .is('reminder_sent_at', null)
      .gte('scheduled_at', cutoffStart.toISOString())
      .lte('scheduled_at', cutoffEnd.toISOString())
      .limit(100);

    if (!due?.length) return { sent: 0 };

    let totalSent = 0;
    for (const show of due) {
      // Fetch seguidores
      const { data: followers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', show.host_id)
        .limit(2000);

      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', show.host_id)
        .single();

      const payload = {
        title: `${hostProfile?.full_name || 'Un creador'} en 15 min`,
        body: show.title,
        url: `/shows/${show.id}`,
      };

      await Promise.all((followers || []).map(f =>
        sendPushToUser(f.follower_id, payload).catch(() => {})
      ));

      await supabase
        .from('live_shows')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', show.id);

      totalSent += followers?.length || 0;
    }
    return { sent: totalSent, shows: due.length };
  } catch (err) {
    console.error('[sendShowReminders]', err);
    return { sent: 0 };
  }
}

// Calcula las próximas N ocurrencias dentro de daysAhead días.
// Trabaja en UTC para simplicidad — un futuro upgrade puede traducir
// timezone del recurring usando Intl.DateTimeFormat.
function computeNextOccurrences(recurring, now, daysAhead) {
  const out = [];
  const limit = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);

  if (recurring.recurrence === 'daily') {
    let candidate = new Date(now);
    candidate.setUTCHours(recurring.hour, recurring.minute || 0, 0, 0);
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    while (candidate <= limit && out.length < 7) {
      out.push(new Date(candidate));
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
  } else {
    // weekly
    let candidate = new Date(now);
    candidate.setUTCHours(recurring.hour, recurring.minute || 0, 0, 0);
    const targetDay = recurring.day_of_week;
    const currentDay = candidate.getUTCDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0 && candidate <= now) daysToAdd = 7;
    candidate.setUTCDate(candidate.getUTCDate() + daysToAdd);
    while (candidate <= limit && out.length < 4) {
      out.push(new Date(candidate));
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
  }
  return out;
}
