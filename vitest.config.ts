import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests share one DB per run and use resetDb(); keep them sequential to avoid cross-test interference.
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false },
    globalSetup: ['./tests/integration/vitest.global-setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

