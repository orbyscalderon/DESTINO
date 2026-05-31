import { supabase } from '../lib/supabase.js';
import { sendSupportTicketEmail } from '../lib/emailService.js';

const CATEGORIES = ['account', 'payment', 'creator', 'safety', 'bug', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/support — abre ticket (auth opcional)
// Body: { email, name, subject, category, message }
export const submitTicket = async (req, res) => {
  try {
    const { email, name, subject, category, message } = req.body;
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido' });
    if (!subject?.trim()) return res.status(400).json({ error: 'Asunto requerido' });
    if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });
    if (message.length > 5000) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 5000 caracteres)' });

    const cat = CATEGORIES.includes(category) ? category : 'other';
    const isPayment = cat === 'payment' || cat === 'safety';

    const { data: ticket, error } = await supabase.from('support_tickets').insert({
      user_id:  req.user?.id || null,
      email:    email.trim().toLowerCase(),
      name:     name?.trim() || null,
      subject:  subject.trim().substring(0, 200),
      category: cat,
      message:  message.trim(),
      priority: isPayment ? 'high' : 'normal',
    }).select('id, created_at').single();
    if (error) throw error;

    // Confirmación email (fire-and-forget)
    sendSupportTicketEmail(email, name || 'Usuario', ticket.id.substring(0, 8), subject).catch(() => {});

    res.status(201).json({
      ticket_id: ticket.id,
      message: 'Recibimos tu solicitud. Te responderemos en máximo 48 horas hábiles.',
    });
  } catch (err) {
    console.error('submitTicket error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/support/my — mis tickets (auth)
export const getMyTickets = async (req, res) => {
  try {
    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, priority, admin_response, created_at, resolved_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    res.json({ tickets: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/support — admin
export const listTicketsAdmin = async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    res.json({ tickets: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/support/:id — admin responde / cierra
export const respondTicketAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response } = req.body;
    const validStatus = ['open', 'in_progress', 'resolved', 'closed'];
    const update = {};
    if (validStatus.includes(status)) update.status = status;
    if (admin_response?.trim()) update.admin_response = admin_response.trim();
    if (status === 'resolved' || status === 'closed') {
      update.resolved_by = req.user.id;
      update.resolved_at = new Date().toISOString();
    }
    await supabase.from('support_tickets').update(update).eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
