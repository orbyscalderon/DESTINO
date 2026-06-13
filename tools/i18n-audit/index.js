#!/usr/bin/env node
// Audit script: localiza strings ES hardcodeadas en frontend/src/pages/*.jsx
// que NO están pasando por t() o useTranslation. No detecta TODAS las strings
// (algunas son dinámicas) pero da una baseline de cobertura por archivo.
//
// Uso: node tools/i18n-audit/index.js
//      node tools/i18n-audit/index.js --page Reels
//      node tools/i18n-audit/index.js --json > report.json

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const PAGES_DIR = join(process.cwd(), 'frontend/src/pages');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const filterIdx = args.indexOf('--page');
const filterPage = filterIdx >= 0 ? args[filterIdx + 1] : null;

// Detecta strings literales sospechosas:
//   - dentro de JSX: >Texto en español</
//   - en props: label="Cancelar", placeholder='Mensaje', title={`...`}
//   - en toast.success/error('...'), confirm('...'), etc.
const HARDCODE_PATTERNS = [
  // JSX text content con tildes o eñes (señal fuerte de ES)
  />\s*([A-ZÁÉÍÓÚÑÜ][^<>{}\n]{2,80}[a-záéíóúñüA-Z0-9.!?…])\s*</g,
  // toast.success/error/loading('texto') con caracteres ES
  /toast\.(?:success|error|loading|info)\(\s*['"`]([^'"`\n]{3,120})['"`]/g,
  // confirm/alert('texto')
  /\b(?:confirm|alert|prompt)\(\s*['"`]([^'"`\n]{3,120})['"`]/g,
  // placeholder='texto' / title='texto' / label='texto' / aria-label='texto'
  /(?:placeholder|title|label|aria-label)=\{?["'`]([^"'`{}\n]{3,80})["'`]\}?/g,
];

const STOPWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'function',
  'className', 'onClick', 'children', 'div', 'span',
]);

function looksLikeSpanish(s) {
  if (!s || s.length < 3) return false;
  if (STOPWORDS.has(s)) return false;
  // Tiene tildes/eñe O patrón claro de palabras en ES
  if (/[áéíóúñüÁÉÍÓÚÑÜ¿¡]/.test(s)) return true;
  // Palabras ES típicas
  if (/\b(el|la|los|las|de|del|en|con|para|por|que|tu|tus|mi|mis|este|esta|estos|aún|sin|más|cómo|qué)\b/i.test(s)) return true;
  // CTAs típicos ES
  if (/\b(Cancelar|Aceptar|Guardar|Cerrar|Volver|Enviar|Editar|Crear|Borrar|Eliminar|Ver|Buscar|Compartir|Continuar|Confirmar|Activar|Desactivar)\b/.test(s)) return true;
  return false;
}

function auditFile(filepath) {
  const src = readFileSync(filepath, 'utf8');
  const usesT = /\buseTranslation\b/.test(src) || /\bt\(['"]/.test(src);

  const findings = new Set();
  for (const re of HARDCODE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const s = (m[1] || '').trim();
      if (looksLikeSpanish(s)) findings.add(s);
    }
  }

  return {
    file: basename(filepath),
    uses_t: usesT,
    hardcoded_count: findings.size,
    samples: Array.from(findings).slice(0, 8),
  };
}

const files = readdirSync(PAGES_DIR)
  .filter(f => f.endsWith('.jsx'))
  .filter(f => !filterPage || f.toLowerCase().includes(filterPage.toLowerCase()))
  .map(f => join(PAGES_DIR, f));

const results = files.map(auditFile).sort((a, b) => b.hardcoded_count - a.hardcoded_count);

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const total = results.reduce((s, r) => s + r.hardcoded_count, 0);
const withT = results.filter(r => r.uses_t).length;
const offenders = results.filter(r => r.hardcoded_count > 0);

console.log(`\n📋 Auditoría i18n — ${results.length} páginas analizadas\n`);
console.log(`   useTranslation cableado:  ${withT}/${results.length}`);
console.log(`   strings ES hardcodeadas:  ${total}`);
console.log(`   páginas con hardcode:     ${offenders.length}\n`);
console.log('─'.repeat(72));
console.log('TOP 20 por hardcode count:\n');

for (const r of offenders.slice(0, 20)) {
  const status = r.uses_t ? '🟡 parcial' : '🔴 sin i18n';
  console.log(`  ${status}  ${r.file.padEnd(34)} ${String(r.hardcoded_count).padStart(4)} strings`);
  for (const s of r.samples.slice(0, 3)) {
    console.log(`              "${s.substring(0, 60)}${s.length > 60 ? '…' : ''}"`);
  }
}

console.log('\n' + '─'.repeat(72));
console.log(`\nPara reporte completo: node tools/i18n-audit/index.js --json > i18n-report.json`);
console.log(`Para una sola página: node tools/i18n-audit/index.js --page Reels\n`);
