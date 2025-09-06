import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // For frontend testing
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '*.config.js',
        '**/*.d.ts',
        '**/*.test.{js,jsx}',
        '**/*.spec.{js,jsx}',
        '**/index.js',
      ],
    },
    include: [
      '**/*.{test,spec}.{js,jsx}',
    ],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './backend'),
      '@worker': path.resolve(__dirname, './worker'),
    },
  },
});