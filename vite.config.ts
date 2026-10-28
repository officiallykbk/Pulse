import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Pulse — Short videos. Ghanaian energy.',
        short_name: 'Pulse',
        description: 'A home for short videos, creators, and culture from Ghana and beyond.',
        theme_color: '#050505',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/pulse-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          video: ['hls.js'],
          virtual: ['@tanstack/react-virtual'],
        },
      },
    },
  },
});
