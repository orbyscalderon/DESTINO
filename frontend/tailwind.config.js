/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
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
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'swipe-left':  'swipeLeft 0.4s ease-out forwards',
        'swipe-right': 'swipeRight 0.4s ease-out forwards',
        'pop-in':      'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'fade-up':     'fadeUp 0.4s ease-out',
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
      },
    },
  },
  plugins: [],
};
