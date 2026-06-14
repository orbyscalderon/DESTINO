// Paleta distinta a Destino TV (que usa rose/pink).
// Aquí usamos amber/orange + zinc oscuro para no compartir branding visual.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50:  '#fff7ed',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        zinc: {
          900: '#0a0a0a',
          850: '#131313',
          800: '#1a1a1a',
          700: '#222222',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
