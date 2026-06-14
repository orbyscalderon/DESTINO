import { supabase } from '../lib/supabase.js';

// Fuck Now Spotlight — publicación premium en el directorio /adult?tab=ahora
//
// Modelo: adult dating con publicación pagada, NO escort directory.
// El backend aplica regex de moderación a bio/looking_for para hacer cumplir
// que los publishers NO publiquen tarifas, contacto externo, o servicios
// físicos explícitos. Si matchea, rechaza el publish con código + razón.
//
// Routes (registradas en routes/fucknow.js):
//   GET    /api/fucknow/status            — estado actual del publisher
//   POST   /api/fucknow/publish           — activar/renovar (requiere ToS + datos)
//   POST   /api/fucknow/update            — editar datos (sin renovar expiry)
//   DELETE /api/fucknow/unpublish         — quitar del directorio
//   GET    /api/fucknow/moderation-rules  — devolver los patrones (frontend warning)

// ── Reglas de moderación ────────────────────────────────────────────────
//
// Patrones server-side que rechazan el publish/update. El frontend tiene
// su propio set para mostrar warning inline al usuario, pero el backend
// es la fuente de verdad.

const MODERATION_RULES = [
  {
    id: 'money_rate',
    label: 'Tarifas por servicios físicos',
    // matches: $50, RD$50, USD 50, "tarifa 100", "$ 50/h", "50 por hora"
    pattern: /(\$|usd|rd\$|tarifa|rate|precio|cost[oa])\s*:?\s*\d+|(\d+)\s*(\/|por\s+|x\s+|p\/)\s*(h(ora)?|noche|night|n)\b/i,
  },
  {
    id: 'external_contact',
    label: 'Contacto externo (apps, teléfono)',
    // matches: whatsapp, wsp, telegram, viber, signal, snapchat, ig: @user, phone numbers
    pattern: /\b(whats?app|wsp|wtsp|telegram|viber|signal|snapchat|sn[a@]p|kik)\b|\b(ig|insta|gram)\s*[:@]/i,
  },
  {
    id: 'phone_number',
    label: 'Número de teléfono',
    // matches: +1 809-555-1234, 8095551234, 809.555.1234, etc.
    pattern: /(\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/,
  },
  {
    id: 'physical_address',
    label: 'Dirección física',
    // matches: "calle X #Y", "av. ...", "apto. ...", "casa #"
    pattern: /\b(calle|avenida|av\.?|sector|condominio|apto\.?|apt\.?|casa\s+#?|edificio|piso)\s+\S/i,
  },
  {
    id: 'explicit_service',
    label: 'Servicios sexuales explícitos',
    // Lista mínima — la idea es bloquear el ofrecimiento explícito por dinero.
    // No bloquea bio aspiracional ("me encanta el sexo"), solo "ofrezco BJ", "doy GFE", etc.
    pattern: /\b(ofrezco|doy|brindo|servicio\s+de)\s+(bj|gfe|pse|anal|oral|trio|trío|sexo|completo)\b/i,
  },
];

function moderateText(text) {
  if (!text || typeof text !== 'string') return { ok: true };
  for (const r of MODERATION_RULES) {
    if (r.pattern.test(text)) {
      return { ok: false, rule: r.id, label: r.label };
    }
  }
  return { ok: true };
}

async function logModeration(userId, field, value, outcome, ruleMatched = null) {
  try {
    await supabase
      .from('fucknow_moderation_log')
      .insert({ user_id: userId, field, raw_value: value, outcome, rule_matched: ruleMatched });
  } catch {}
}

// Duración del spotlight cuando se activa (días)
const SPOTLIGHT_DAYS = 30;
const SPOTLIGHT_PRICE_USD = parseFloat(process.env.SPOTLIGHT_PRICE_USD || '9.99');

// CCBill master account (no sub-account de creator) para cobros de
// servicios de la plataforma (Spotlight, Boosts, etc).
const CCBILL_FORM_BASE = process.env.CCBILL_FLEXFORMS_DOMAIN || 'https://api.ccbill.com';
function isCCBillConfigured() {
  return !!process.env.CCBILL_ACCOUNT_NUMBER
      && !!process.env.CCBILL_WEBHOOK_HMAC_SECRET;
}

// ── GET /api/fucknow/status ────────────────────────────────────────────
export const getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        fucknow_publisher, fucknow_published_at, fucknow_expires_at,
        fucknow_bio, fucknow_looking_for, fucknow_availability,
        fucknow_intent, fucknow_city, fucknow_interests, fucknow_tos_accepted_at,
        height_cm, body_type, ethnicity, languages,
        is_adult_creator, age_verified_at
      `)
      .eq('id', userId)
      .single();
    if (error) throw error;

    const now = Date.now();
    const isActive = !!data?.fucknow_publisher
      && data.fucknow_expires_at
      && new Date(data.fucknow_expires_at).getTime() > now;

    const daysRemaining = isActive
      ? Math.ceil((new Date(data.fucknow_expires_at).getTime() - now) / 86400000)
      : 0;

    res.json({
      is_active:         isActive,
      days_remaining:    daysRemaining,
      eligible:          !!(data?.is_adult_creator && data?.age_verified_at),
      data: data || null,
    });
  } catch (err) {
    console.error('[fucknow:status]', err.message);
    res.status(500).json({ error: 'No se pudo consultar estado' });
  }
};

// ── POST /api/fucknow/publish ──────────────────────────────────────────
// Body: { bio, looking_for, intent, city, availability, interests, height_cm,
//         body_type, ethnicity, languages, tos_accepted: true }
//
// Flow nuevo (v75.1):
//   1. Validar eligibility (is_adult_creator + age_verified_at)
//   2. Validar ToS aceptado
//   3. Moderación de bio/looking_for (regex)
//   4. Persistir datos (NO activar publisher todavía)
//   5. Devolver URL de CCBill FlexForms — el publisher solo se activa
//      cuando llega el webhook NewSaleSuccess con customField1='spotlight'
//   6. Si el user ya tiene spotlight activo, el publish solo actualiza
//      datos sin cobrar (devuelve { mode: 'updated' })
export const publish = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    if (body.tos_accepted !== true && body.tos_accepted !== 'true') {
      return res.status(400).json({ error: 'Debes aceptar los términos de Spotlight', code: 'TOS_REQUIRED' });
    }

    // Eligibilidad
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('is_adult_creator, age_verified_at')
      .eq('id', userId)
      .single();
    if (profErr) throw profErr;
    if (!prof?.is_adult_creator || !prof?.age_verified_at) {
      return res.status(403).json({
        error: 'Spotlight requiere ser creador adulto verificado',
        code: 'NOT_ELIGIBLE',
      });
    }

    // Moderación bio
    if (body.bio) {
      const mod = moderateText(body.bio);
      await logModeration(userId, 'bio', body.bio, mod.ok ? 'accepted' : 'rejected', mod.rule || null);
      if (!mod.ok) {
        return res.status(400).json({
          error: `Tu bio contiene contenido no permitido: ${mod.label}. Reescríbelo sin tarifas, contacto externo, o servicios físicos explícitos.`,
          code: 'MODERATION_REJECTED',
          rule: mod.rule,
        });
      }
    }

    // Moderación looking_for
    if (body.looking_for) {
      const mod = moderateText(body.looking_for);
      await logModeration(userId, 'looking_for', body.looking_for, mod.ok ? 'accepted' : 'rejected', mod.rule || null);
      if (!mod.ok) {
        return res.status(400).json({
          error: `Tu "Busco" contiene contenido no permitido: ${mod.label}. Reescríbelo.`,
          code: 'MODERATION_REJECTED',
          rule: mod.rule,
        });
      }
    }

    // Verificar si ya tiene spotlight activo — en ese caso solo actualiza
    const { data: cur } = await supabase
      .from('profiles')
      .select('fucknow_publisher, fucknow_expires_at')
      .eq('id', userId)
      .single();
    const isAlreadyActive = !!cur?.fucknow_publisher
      && cur.fucknow_expires_at
      && new Date(cur.fucknow_expires_at).getTime() > Date.now();

    const now = new Date();
    // Sanitizar inputs antes de persist — siempre persiste datos
    // pero solo activa publisher si ya tenía o pagó
    const update = {
      fucknow_tos_accepted_at: now.toISOString(),
    };
    if (body.bio != null)          update.fucknow_bio          = String(body.bio).slice(0, 600);
    if (body.looking_for != null)  update.fucknow_looking_for  = String(body.looking_for).slice(0, 200);
    if (body.intent && ['casual','fwb','date','fun','open'].includes(body.intent))
      update.fucknow_intent = body.intent;
    if (body.city != null)         update.fucknow_city         = String(body.city).slice(0, 80);
    if (Array.isArray(body.interests))
      update.fucknow_interests = body.interests.slice(0, 12).map(s => String(s).slice(0, 30));
    if (body.availability && typeof body.availability === 'object')
      update.fucknow_availability = body.availability;
    if (body.height_cm != null && !isNaN(Number(body.height_cm)))
      update.height_cm = Math.max(100, Math.min(230, parseInt(body.height_cm)));
    if (body.body_type && ['delgada','atletica','curvy','plus','fitness'].includes(body.body_type))
      update.body_type = body.body_type;
    if (body.ethnicity && ['latina','caucasica','afro','asiatica','mixta'].includes(body.ethnicity))
      update.ethnicity = body.ethnicity;
    if (Array.isArray(body.languages))
      update.languages = body.languages.slice(0, 6).map(s => String(s).slice(0, 4));

    const { error: updErr } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId);
    if (updErr) throw updErr;

    // Si ya está activo → solo actualizó datos, sin cobro
    if (isAlreadyActive) {
      return res.json({
        mode: 'updated',
        message: 'Datos actualizados. Spotlight sigue activo.',
        expires_at: cur.fucknow_expires_at,
      });
    }

    // Caso primer publish — generar URL de checkout
    if (!isCCBillConfigured()) {
      // Modo dev sin CCBill — activar gratis (warning en consola)
      console.warn('[fucknow:publish] CCBill NO configurado, activando Spotlight gratis (dev mode)');
      const expiresAt = new Date(now.getTime() + SPOTLIGHT_DAYS * 86400 * 1000);
      await supabase.from('profiles').update({
        fucknow_publisher:    true,
        fucknow_published_at: now.toISOString(),
        fucknow_expires_at:   expiresAt.toISOString(),
      }).eq('id', userId);
      return res.json({
        mode: 'dev_activated',
        message: '¡Spotlight activado (modo dev)!',
        expires_at: expiresAt.toISOString(),
      });
    }

    // Producción — devolver URL al FlexForms de CCBill.
    // customField1='spotlight' es el discriminador que el webhook usa
    // para detectar que el cobro es por Spotlight (no por subscription
    // a otro creator).
    const params = new URLSearchParams({
      clientAccnum: process.env.CCBILL_ACCOUNT_NUMBER,
      clientSubacc: process.env.CCBILL_SPOTLIGHT_SUB_ACCOUNT || '0000',
      formName:     process.env.CCBILL_SPOTLIGHT_FORM_ID || '',
      currencyCode: '840',
      formPrice:           SPOTLIGHT_PRICE_USD.toFixed(2),
      formPeriod:          String(SPOTLIGHT_DAYS),
      formRecurringPrice:  SPOTLIGHT_PRICE_USD.toFixed(2),
      formRecurringPeriod: String(SPOTLIGHT_DAYS),
      customField1: 'spotlight',
      customField2: userId,
    });
    const checkoutUrl = `${CCBILL_FORM_BASE}/jpost/signup.cgi?${params}`;

    res.json({
      mode: 'checkout',
      checkout_url: checkoutUrl,
      price_usd: SPOTLIGHT_PRICE_USD,
      days: SPOTLIGHT_DAYS,
      message: 'Completa el pago para activar Spotlight',
    });
  } catch (err) {
    console.error('[fucknow:publish]', err.message);
    res.status(500).json({ error: 'No se pudo iniciar Spotlight' });
  }
};

// ── Helper exportado para el webhook handler ──────────────────────────
// Llamado desde ccbillController cuando llega NewSaleSuccess|Renewal con
// customField1='spotlight'. Activa o extiende el publisher.
export async function activateSpotlightFromWebhook(userId, eventType) {
  if (!userId) return false;
  try {
    const { data: cur } = await supabase
      .from('profiles')
      .select('fucknow_expires_at')
      .eq('id', userId)
      .single();

    // Si se renueva mientras aún está activo, extender desde su expires_at
    // actual; sino, desde ahora.
    const baseTime = (cur?.fucknow_expires_at && new Date(cur.fucknow_expires_at).getTime() > Date.now())
      ? new Date(cur.fucknow_expires_at).getTime()
      : Date.now();
    const newExpiresAt = new Date(baseTime + SPOTLIGHT_DAYS * 86400 * 1000);

    await supabase.from('profiles').update({
      fucknow_publisher:    true,
      fucknow_published_at: new Date().toISOString(),
      fucknow_expires_at:   newExpiresAt.toISOString(),
    }).eq('id', userId);

    // Email de activación/renovación
    import('../lib/emailService.js')
      .then(m => {
        if (eventType === 'Renewal') return m.sendSpotlightRenewedEmail?.(userId, newExpiresAt);
        return m.sendSpotlightActivatedEmail?.(userId, newExpiresAt);
      })
      .catch(() => {});

    console.log(`[fucknow] Spotlight ${eventType} para user=${userId} → expira ${newExpiresAt.toISOString()}`);
    return true;
  } catch (err) {
    console.error('[activateSpotlightFromWebhook]', err.message);
    return false;
  }
}

// ── POST /api/fucknow/update ───────────────────────────────────────────
// Edita los campos sin renovar la suscripción.
export const update = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    // Verificar que esté activo
    const { data: cur } = await supabase
      .from('profiles')
      .select('fucknow_publisher, fucknow_expires_at')
      .eq('id', userId)
      .single();
    if (!cur?.fucknow_publisher || !cur?.fucknow_expires_at
        || new Date(cur.fucknow_expires_at).getTime() < Date.now()) {
      return res.status(403).json({
        error: 'No tienes Spotlight activo. Actívalo primero.',
        code: 'NOT_ACTIVE',
      });
    }

    // Moderación de los campos editados
    for (const field of ['bio', 'looking_for']) {
      const apiField = field === 'bio' ? body.bio : body.looking_for;
      if (apiField != null) {
        const mod = moderateText(apiField);
        await logModeration(userId, field, apiField, mod.ok ? 'accepted' : 'rejected', mod.rule || null);
        if (!mod.ok) {
          return res.status(400).json({
            error: `${field === 'bio' ? 'Tu bio' : 'Tu "Busco"'} contiene contenido no permitido: ${mod.label}.`,
            code: 'MODERATION_REJECTED',
            rule: mod.rule,
          });
        }
      }
    }

    const update = {};
    if (body.bio != null)         update.fucknow_bio = String(body.bio).slice(0, 600);
    if (body.looking_for != null) update.fucknow_looking_for = String(body.looking_for).slice(0, 200);
    if (body.intent && ['casual','fwb','date','fun','open'].includes(body.intent))
      update.fucknow_intent = body.intent;
    if (body.city != null) update.fucknow_city = String(body.city).slice(0, 80);
    if (Array.isArray(body.interests))
      update.fucknow_interests = body.interests.slice(0, 12).map(s => String(s).slice(0, 30));
    if (body.availability && typeof body.availability === 'object')
      update.fucknow_availability = body.availability;
    if (body.height_cm != null && !isNaN(Number(body.height_cm)))
      update.height_cm = Math.max(100, Math.min(230, parseInt(body.height_cm)));
    if (body.body_type && ['delgada','atletica','curvy','plus','fitness'].includes(body.body_type))
      update.body_type = body.body_type;
    if (body.ethnicity && ['latina','caucasica','afro','asiatica','mixta'].includes(body.ethnicity))
      update.ethnicity = body.ethnicity;
    if (Array.isArray(body.languages))
      update.languages = body.languages.slice(0, 6).map(s => String(s).slice(0, 4));

    const { error: updErr } = await supabase
      .from('profiles').update(update).eq('id', userId);
    if (updErr) throw updErr;
    res.json({ ok: true, message: 'Spotlight actualizado' });
  } catch (err) {
    console.error('[fucknow:update]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar Spotlight' });
  }
};

// ── DELETE /api/fucknow ─────────────────────────────────────────────────
export const unpublish = async (req, res) => {
  try {
    const userId = req.user.id;
    const { error } = await supabase
      .from('profiles')
      .update({ fucknow_publisher: false, fucknow_expires_at: null })
      .eq('id', userId);
    if (error) throw error;
    res.json({ ok: true, message: 'Spotlight desactivado' });
  } catch (err) {
    console.error('[fucknow:unpublish]', err.message);
    res.status(500).json({ error: 'No se pudo desactivar' });
  }
};

// ── GET /api/fucknow/moderation-rules ──────────────────────────────────
// Devuelve los patrones que el backend bloquea, para que el frontend pueda
// dar warning inline. NO devuelve los regex literales (eso ayuda a evadir),
// solo descripciones humanas.
export const getModerationRules = async (req, res) => {
  res.json({
    rules: MODERATION_RULES.map(r => ({ id: r.id, label: r.label })),
    examples_blocked: [
      'Tarifa: $50 por hora',
      'WhatsApp: +1 809...',
      'Calle Duarte #5, Santo Domingo',
      'Ofrezco oral y completo',
    ],
    examples_allowed: [
      'Busco conexión auténtica con personas open-minded',
      'Me gusta el café, los viajes, y la buena conversación',
      'Disponible noches y fines de semana',
    ],
  });
};

// ── GET /api/fucknow/admin/moderation-queue ────────────────────────────
// Admin-only. Devuelve los últimos N intentos de publish + filtrar por
// outcome. También devuelve "soft flags" — bios que NO matchearon regex
// pero tienen N+ palabras sospechosas (heurística secundaria).
export const getAdminModerationQueue = async (req, res) => {
  try {
    // Gating admin: solo orbys85@gmail.com (matchea security_rules)
    const adminEmail = process.env.ADMIN_EMAIL || 'orbys85@gmail.com';
    if (req.user?.email !== adminEmail) {
      return res.status(403).json({ error: 'Solo admin' });
    }

    const { outcome = 'all', limit = '100' } = req.query;
    let q = supabase
      .from('fucknow_moderation_log')
      .select(`
        id, user_id, field, raw_value, outcome, rule_matched, created_at,
        user:profiles!user_id(full_name, avatar_url, fucknow_publisher, fucknow_expires_at)
      `)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, parseInt(limit) || 100));
    if (outcome !== 'all') q = q.eq('outcome', outcome);

    const { data, error } = await q;
    if (error) throw error;

    // Heurística secundaria — detectar "soft flags": bios accepted con N+
    // palabras sospechosas (sin matchear regex literal).
    const SUSPICIOUS_WORDS = [
      'noche', 'encuentro', 'visita', 'recibo', 'voy', 'salida',
      'discreto', 'discreta', 'privacidad', 'hotel', 'cita',
      'pagas', 'reembolso', 'tip', 'propina',
    ];

    const enriched = (data || []).map(row => {
      let softFlags = [];
      if (row.outcome === 'accepted' && row.raw_value) {
        const lower = row.raw_value.toLowerCase();
        softFlags = SUSPICIOUS_WORDS.filter(w => lower.includes(w));
      }
      return {
        ...row,
        soft_flags: softFlags,
        is_borderline: softFlags.length >= 2,
      };
    });

    res.json({ logs: enriched });
  } catch (err) {
    console.error('[fucknow:adminQueue]', err.message);
    res.status(500).json({ error: 'No se pudo cargar queue' });
  }
};

// ── POST /api/fucknow/admin/force-unpublish ────────────────────────────
// Admin quita un publisher manualmente (por revisión humana de soft flag,
// reporte, etc). Envía email explicando por qué.
export const adminForceUnpublish = async (req, res) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'orbys85@gmail.com';
    if (req.user?.email !== adminEmail) {
      return res.status(403).json({ error: 'Solo admin' });
    }
    const { user_id, reason } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id requerido' });

    await supabase
      .from('profiles')
      .update({ fucknow_publisher: false })
      .eq('id', user_id);

    // Log de la acción del admin
    await supabase.from('fucknow_moderation_log').insert({
      user_id,
      field: 'bio',
      raw_value: `[ADMIN unpublish] ${reason || 'sin razón especificada'}`,
      outcome: 'rejected',
      rule_matched: 'admin_review',
    });

    import('../lib/emailService.js')
      .then(m => m.sendSpotlightModeratedEmail?.(user_id, reason || 'revisión manual'))
      .catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('[fucknow:adminForceUnpublish]', err.message);
    res.status(500).json({ error: 'No se pudo desactivar' });
  }
};

// ── GET /api/fucknow/directory ─────────────────────────────────────────
// Devuelve solo publishers con suscripción activa. Filtros opcionales.
export const getDirectory = async (req, res) => {
  try {
    const {
      city, gender, online, body_type, ethnicity,
      languages: langCsv, intent, sort = 'recent', limit = '60',
    } = req.query;

    let q = supabase
      .from('profiles')
      .select(`
        id, full_name, avatar_url, age, country, is_verified, is_premium,
        fucknow_bio, fucknow_looking_for, fucknow_intent, fucknow_city,
        fucknow_interests, fucknow_availability, fucknow_published_at,
        fucknow_expires_at, last_active,
        height_cm, body_type, ethnicity, languages,
        creator_subscription_price, has_video_calls, has_custom_content,
        has_subscription, has_ppv, gender
      `)
      .eq('fucknow_publisher', true)
      .gt('fucknow_expires_at', new Date().toISOString())
      .limit(Math.min(120, parseInt(limit) || 60));

    if (city)       q = q.ilike('fucknow_city', `%${city}%`);
    if (gender)     q = q.eq('gender', gender);
    if (body_type)  q = q.eq('body_type', body_type);
    if (ethnicity)  q = q.eq('ethnicity', ethnicity);
    if (intent)     q = q.eq('fucknow_intent', intent);
    if (online === 'true') {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      q = q.gte('last_active', fiveMinAgo);
    }
    if (langCsv) {
      const arr = String(langCsv).split(',').filter(Boolean);
      if (arr.length > 0) q = q.overlaps('languages', arr);
    }

    if (sort === 'recent')  q = q.order('fucknow_published_at', { ascending: false });
    else if (sort === 'online') q = q.order('last_active', { ascending: false });
    else if (sort === 'popular') q = q.order('creator_subscription_price', { ascending: false });
    else if (sort === 'new') q = q.order('fucknow_published_at', { ascending: false });

    const { data, error } = await q;
    if (error) throw error;
    res.json({ creators: data || [] });
  } catch (err) {
    console.error('[fucknow:directory]', err.message);
    res.status(500).json({ error: 'No se pudo cargar directorio' });
  }
};
