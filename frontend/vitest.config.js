import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests-unit/**/*.test.{js,jsx}'],
    exclude: ['tests/**', 'node_modules/**', 'dist/**'],
    globals: false,
  },
});
