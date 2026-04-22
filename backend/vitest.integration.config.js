import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
