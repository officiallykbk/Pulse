import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Edge functions use Deno's "npm:" import prefix; map it to the local
      // package so the function logic can run under vitest.
      'npm:@supabase/supabase-js@2.57.4': fileURLToPath(
        new URL('./node_modules/@supabase/supabase-js', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15000,
  },
});
