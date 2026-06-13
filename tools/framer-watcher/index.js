#!/usr/bin/env node
/**
 * Framer Templates Watcher
 *
 * Hace polling a https://www.framer.com/marketplace/templates/, detecta
 * templates nuevos (por slug), guarda el set "visto" en seen.json, y opcionalmente
 * envía email vía Resend cuando aparecen nuevos.
 *
 * Categorías scrapeadas:
 *   - business / creative / community / style / free-website-templates
 *   - root (todos los recientes)
 *
 * Uso:
 *   node tools/framer-watcher/index.js              # check, log a stdout
 *   node tools/framer-watcher/index.js --notify     # check + email si hay nuevos
 *   node tools/framer-watcher/index.js --reset      # borrar seen.json (empieza de cero)
 *
 * Env vars (opcionales, solo para --notify):
 *   RESEND_API_KEY=re_...
 *   WATCHER_NOTIFY_EMAIL=orbys85@gmail.com
 *   WATCHER_FROM_EMAIL=watcher@destino.app   (default: onboarding@resend.dev)
 *
 * Salida JSON estructurada via --json flag (para consumir en otros scripts).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// En CI (GitHub Actions) los certs CA están bien configurados.
// En Windows local podés tener self-signed CA — el flag opta-in lo permite.
if (process.env.WATCHER_INSECURE_TLS === '1' && !process.env.CI) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEN_PATH = path.join(__dirname, 'seen.json');

const CATEGORIES = [
  { slug: 'root',       url: 'https://www.framer.com/marketplace/templates/' },
  { slug: 'business',   url: 'https://www.framer.com/marketplace/templates/category/business/' },
  { slug: 'creative',   url: 'https://www.framer.com/marketplace/templates/category/creative/' },
  { slug: 'community',  url: 'https://www.framer.com/marketplace/templates/category/community/' },
  { slug: 'style',      url: 'https://www.framer.com/marketplace/templates/category/style/' },
  { slug: 'free',       url: 'https://www.framer.com/marketplace/templates/category/free-website-templates/' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const args = new Set(process.argv.slice(2));
const FLAG_NOTIFY = args.has('--notify');
const FLAG_RESET  = args.has('--reset');
const FLAG_JSON   = args.has('--json');

const log = (...a) => { if (!FLAG_JSON) console.log(...a); };

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

function parseTemplateSlugs(html) {
  // Templates aparecen como <a href="/marketplace/templates/<slug>/">
  // Excluyo /category/, /author/, / (root)
  const matches = html.matchAll(/href="\/marketplace\/templates\/([a-z0-9][a-z0-9-]+)\/"/g);
  const slugs = new Set();
  for (const m of matches) {
    const slug = m[1];
    if (slug && slug !== 'category' && slug !== 'author') slugs.add(slug);
  }
  return slugs;
}

function parseTemplateMeta(html, slug) {
  // Framer pone en cada template un alt como:
  //   "Thumbnail 1 for <Name>, a Framer Marketplace template by <Author>."
  // Parseo eso para extraer name + author limpios.
  const escaped = slug.replace(/-/g, '[- ]?');
  const altMatch = html.match(new RegExp(`alt="([^"]*${escaped}[^"]*)"`, 'i'));
  let name = null;
  let author = null;

  if (altMatch?.[1]) {
    const alt = altMatch[1];
    // Pattern: "Thumbnail N for <NAME>, a Framer Marketplace template by <AUTHOR>."
    const m = alt.match(/Thumbnail \d+ for (.+?), a Framer Marketplace template by (.+?)\.?$/i);
    if (m) {
      name = m[1].trim();
      author = m[2].trim();
    } else {
      name = alt.trim();
    }
  }

  if (!name) {
    // Fallback: humanizar el slug
    name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return {
    slug,
    name,
    author,
    url: `https://www.framer.com/marketplace/templates/${slug}/`,
  };
}

function loadSeen() {
  if (FLAG_RESET) return { templates: {}, firstSeen: null, lastChecked: null };
  if (!fs.existsSync(SEEN_PATH)) return { templates: {}, firstSeen: null, lastChecked: null };
  try {
    return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf-8'));
  } catch {
    return { templates: {}, firstSeen: null, lastChecked: null };
  }
}

function saveSeen(state) {
  fs.writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2));
}

async function sendNotification(newTemplates) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.WATCHER_NOTIFY_EMAIL || 'orbys85@gmail.com';
  const from   = process.env.WATCHER_FROM_EMAIL || 'Framer Watcher <onboarding@resend.dev>';
  if (!apiKey) {
    log('RESEND_API_KEY no configurada — skip notification');
    return false;
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;max-width:600px;margin:auto">
      <h1 style="font-size:24px;margin:0 0 8px;background:linear-gradient(135deg,#f43f5e 0%,#d946ef 100%);-webkit-background-clip:text;background-clip:text;color:transparent">
        🎨 ${newTemplates.length} ${newTemplates.length === 1 ? 'nuevo template' : 'nuevos templates'} en Framer
      </h1>
      <p style="color:#71717a;font-size:14px;margin:0 0 24px">${new Date().toLocaleString('es')}</p>
      <ul style="list-style:none;padding:0;margin:0">
        ${newTemplates.map(t => `
          <li style="background:#111118;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin-bottom:8px">
            <a href="${t.url}" style="color:#fb7185;text-decoration:none;font-weight:600;font-size:16px">${t.name}</a>
            ${t.author ? `<div style="color:#a1a1aa;font-size:12px;margin-top:4px">por ${t.author}</div>` : ''}
            <div style="color:#71717a;font-size:11px;margin-top:4px;font-family:monospace">${t.slug}</div>
          </li>
        `).join('')}
      </ul>
      <p style="margin-top:24px;color:#52525b;font-size:12px">
        Framer Watcher · agregado el ${new Date().toISOString().slice(0, 10)}
      </p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from, to,
      subject: `🎨 Framer · ${newTemplates.length} ${newTemplates.length === 1 ? 'template nuevo' : 'templates nuevos'}`,
      html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    log(`Resend error: ${res.status} ${errText}`);
    return false;
  }
  return true;
}

async function main() {
  const state = loadSeen();
  const allSlugs = new Set();
  const errors = [];

  for (const cat of CATEGORIES) {
    try {
      const html = await fetchHtml(cat.url);
      const slugs = parseTemplateSlugs(html);
      for (const s of slugs) allSlugs.add(s);
      log(`✓ ${cat.slug.padEnd(10)} → ${slugs.size} templates`);
    } catch (err) {
      log(`✗ ${cat.slug.padEnd(10)} → ${err.message}`);
      errors.push({ category: cat.slug, error: err.message });
    }
  }

  // Diff contra state
  const newSlugs = [];
  for (const slug of allSlugs) {
    if (!state.templates[slug]) newSlugs.push(slug);
  }

  // Para los nuevos, parsear meta del root HTML (más rico)
  const newTemplates = [];
  if (newSlugs.length > 0) {
    let rootHtml = '';
    try { rootHtml = await fetchHtml(CATEGORIES[0].url); } catch {}
    for (const slug of newSlugs) {
      newTemplates.push(parseTemplateMeta(rootHtml, slug));
    }
  }

  // Update state
  const now = new Date().toISOString();
  if (!state.firstSeen) state.firstSeen = now;
  state.lastChecked = now;
  for (const t of newTemplates) {
    state.templates[t.slug] = { name: t.name, author: t.author || null, firstSeen: now };
  }
  saveSeen(state);

  // Output
  if (FLAG_JSON) {
    console.log(JSON.stringify({
      total: allSlugs.size,
      new: newTemplates,
      lastChecked: now,
      firstRun: !state.firstSeen || state.firstSeen === now,
      errors,
    }, null, 2));
  } else {
    log('');
    log(`Total únicos: ${allSlugs.size}`);
    log(`Nuevos en este run: ${newTemplates.length}`);
    if (newTemplates.length > 0) {
      log('');
      log('🎨 NUEVOS TEMPLATES:');
      for (const t of newTemplates) {
        log(`  • ${t.name}${t.author ? ` — by ${t.author}` : ''}`);
        log(`    ${t.url}`);
      }
    }
  }

  // Notify
  if (FLAG_NOTIFY && newTemplates.length > 0) {
    const isFirstRun = state.firstSeen === now;
    if (isFirstRun) {
      log('Primera corrida — skip notification (todos serían "nuevos")');
    } else {
      const sent = await sendNotification(newTemplates);
      if (sent) log(`✓ Email enviado a ${process.env.WATCHER_NOTIFY_EMAIL || 'orbys85@gmail.com'}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
