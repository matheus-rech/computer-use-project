import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['src/main/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
