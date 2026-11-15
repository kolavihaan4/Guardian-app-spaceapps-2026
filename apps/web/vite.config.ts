import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { reticle } from '@reticlehq/vite-plugin';
// In development the browser talks only to Vite (5173); /api is proxied to the Node backend so
// cookies stay first-party. The backend's secrets never reach this bundle.
export default defineConfig({
  plugins: [reticle({ port: 4400 }), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
} as Parameters<typeof defineConfig>[0])
