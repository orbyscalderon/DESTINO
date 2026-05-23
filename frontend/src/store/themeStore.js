import { create } from 'zustand';

const THEME_KEY = 'destino_theme';

export const useThemeStore = create((set) => ({
  isDark: localStorage.getItem(THEME_KEY) !== 'light',
  toggle: () =>
    set((s) => {
      const next = !s.isDark;
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      document.documentElement.classList.toggle('light', !next);
      return { isDark: next };
    }),
  init: () => {
    const isDark = localStorage.getItem(THEME_KEY) !== 'light';
    document.documentElement.classList.toggle('light', !isDark);
    set({ isDark });
  },
}));
