/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ── Color tokens ────────────────────────────────────────────
      // brand (rose/pink) es el primario. accent (magenta) para gradients.
      // Las escalas completas (50-900) permiten matices consistentes.
      colors: {
        brand: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        accent: {
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
        },
        dark: {
          900: '#0a0a0f',
          800: '#111118',
          700: '#1a1a2e',
          600: '#16213e',
          500: '#1f2937',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // ── Spacing helpers ─────────────────────────────────────────
      spacing: {
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      // ── Box shadows con glow brand ──────────────────────────────
      boxShadow: {
        'glow-sm':    '0 0 12px rgba(244, 63, 94, 0.25)',
        'glow':       '0 0 24px rgba(244, 63, 94, 0.35)',
        'glow-lg':    '0 0 48px rgba(244, 63, 94, 0.4)',
        'glow-accent':'0 0 24px rgba(217, 70, 239, 0.4)',
        'inset-soft': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      },
      // ── Easings ────────────────────────────────────────────────
      transitionTimingFunction: {
        'out-back':    'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'out-expo':    'cubic-bezier(0.19, 1, 0.22, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      animation: {
        'swipe-left':   'swipeLeft 0.4s ease-out forwards',
        'swipe-right':  'swipeRight 0.4s ease-out forwards',
        'pop-in':       'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'fade-up':      'fadeUp 0.4s ease-out',
        'shimmer':      'shimmer 2s linear infinite',
        'glow-pulse':   'glowPulse 2.4s ease-in-out infinite',
        'float':        'float 3s ease-in-out infinite',
        'scale-bounce': 'scaleBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        swipeLeft: {
          '0%':   { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'translateX(-150%) rotate(-20deg)', opacity: 0 },
        },
        swipeRight: {
          '0%':   { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'translateX(150%) rotate(20deg)', opacity: 0 },
        },
        popIn: {
          '0%':   { transform: 'scale(0.8)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        fadeUp: {
          '0%':   { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        // Shimmer para skeletons con brillo deslizante
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Glow pulsante sutil para "en vivo", "trending", etc.
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(244, 63, 94, 0.4)' },
          '50%':      { boxShadow: '0 0 28px rgba(244, 63, 94, 0.7)' },
        },
        // Float lento para empty states e iconos vacíos
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        scaleBounce: {
          '0%':   { transform: 'scale(0.9)', opacity: 0 },
          '60%':  { transform: 'scale(1.05)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
      },
      backgroundImage: {
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
        'brand-gradient': 'linear-gradient(135deg, #f43f5e 0%, #d946ef 100%)',
        'mesh-dark': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(244,63,94,0.15), transparent), radial-gradient(ellipse 60% 40% at 70% 110%, rgba(217,70,239,0.12), transparent)',
      },
      backgroundSize: {
        'shimmer-bg': '200% 100%',
      },
    },
  },
  plugins: [],
};
