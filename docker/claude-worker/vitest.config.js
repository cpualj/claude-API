import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        '**/*.test.js',
        '**/*.config.js'
      ]
    },
    testTimeout: 10000,
    mockReset: true,
    clearMocks: true,
    restoreMocks: true
  }
});