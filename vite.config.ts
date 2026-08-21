import { defineConfig } from 'vite'

// Offline-first static build. No external CDN, no runtime network.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, strictPort: false },
})
