import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Standalone build for the mobile PWA. It is served by the embedded bridge
// server (src/main/bridge/server.ts) from out/pwa, so assets are emitted with a
// relative base and the service worker / manifest land at the origin root.
export default defineConfig({
  root: __dirname,
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../src/shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../out/pwa'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 8789,
  },
})
