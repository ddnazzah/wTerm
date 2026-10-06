import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)

export default defineConfig({
  main: {
    plugins: [
      // The xterm packages ship CommonJS only. Left external they are loaded by
      // node's ESM loader, where `import { Terminal }` has no named export and
      // the main process dies on startup; bundling them lets Vite do the
      // interop. Everything else stays external (node-pty needs its binary).
      externalizeDepsPlugin({ exclude: ['@xterm/headless', '@xterm/addon-serialize'] }),
    ],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        // @xterm/headless advertises `module: lib/xterm.mjs` but ships no such
        // file, so Vite cannot resolve the package by name. require.resolve
        // takes the `main` field, which is the build that actually exists.
        '@xterm/headless': require.resolve('@xterm/headless'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    worker: { format: 'es' },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
        },
      },
    },
  },
})
