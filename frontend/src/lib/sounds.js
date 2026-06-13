// Sound design library — usa Web Audio API para sintetizar sonidos cortos
// sin assets externos. Opt-in: respeta el flag localStorage 'destino_sounds_enabled'.
//
// API:
//   isSoundsEnabled()           — bool
//   setSoundsEnabled(bool)      — persiste
//   playWhoosh()                — swipe en Discover
//   playPop()                   — match, like
//   playDing()                  — tip enviado, regalo
//   playClick()                 — tap suave en botones importantes
//   playSuccess()               — purchase, sub
//   playError()                 — error
//
// Las funciones devuelven inmediatamente. Si el contexto no se puede crear
// o el sound está disabled, son no-ops sin error.

const STORAGE_KEY = 'destino_sounds_enabled';

let audioCtx = null;

function getCtx() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

export function isSoundsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundsEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {}
}

// Helper: oscilador con envelope ADSR muy corto, swept frequency
function tone({ from, to, duration = 0.15, type = 'sine', volume = 0.12 }) {
  if (!isSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch {}
}

// Whoosh: sweep grave→agudo corto. Para swipe.
export function playWhoosh() {
  tone({ from: 220, to: 660, duration: 0.18, type: 'triangle', volume: 0.08 });
}

// Pop: ataque corto + decay. Para match, like.
export function playPop() {
  tone({ from: 880, to: 220, duration: 0.12, type: 'sine', volume: 0.12 });
}

// Ding: nota sostenida brillante. Para tip, regalo.
export function playDing() {
  tone({ from: 1320, to: 1320, duration: 0.22, type: 'sine', volume: 0.14 });
  setTimeout(() => tone({ from: 1760, to: 1760, duration: 0.18, type: 'sine', volume: 0.10 }), 60);
}

// Click: tap muy suave.
export function playClick() {
  tone({ from: 1500, to: 800, duration: 0.05, type: 'square', volume: 0.04 });
}

// Success: arpegio ascendente.
export function playSuccess() {
  tone({ from: 523, to: 523, duration: 0.10, type: 'sine', volume: 0.10 });
  setTimeout(() => tone({ from: 659, to: 659, duration: 0.10, type: 'sine', volume: 0.10 }), 80);
  setTimeout(() => tone({ from: 784, to: 784, duration: 0.16, type: 'sine', volume: 0.12 }), 160);
}

// Error: nota grave breve.
export function playError() {
  tone({ from: 200, to: 100, duration: 0.20, type: 'sawtooth', volume: 0.08 });
}
