/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@flowforge/workflow-schema': fileURLToPath(
        new URL('./packages/workflow-schema/src/index.ts', import.meta.url),
      ),
      '@flowforge/node-sdk': fileURLToPath(
        new URL('./packages/node-sdk/src/index.ts', import.meta.url),
      ),
      '@flowforge/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
      '@flowforge/workflow-core': fileURLToPath(
        new URL('./packages/workflow-core/src/index.ts', import.meta.url),
      ),
      '@flowforge/cli': fileURLToPath(
        new URL('./packages/cli/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**', 'playwright.config.ts'],
  },
});
