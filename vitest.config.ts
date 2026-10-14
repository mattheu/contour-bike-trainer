import { defineConfig } from 'vitest/config';

// Node environment: nothing outside src/ui touches the DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
