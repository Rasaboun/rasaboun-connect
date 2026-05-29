/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Cross-Origin isolation is needed for multi-threaded WASM (SharedArrayBuffer).
// COEP `credentialless` (not `require-corp`) keeps SharedArrayBuffer working on
// Chromium/Firefox while still allowing Apple MapKit JS tiles (which lack CORP
// headers) to load. Safari doesn't support credentialless — the map degrades
// gracefully there, the rest of the app is unaffected.
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
    include: ['buffer'],
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  assetsInclude: ['**/*.onnx'],
  server: { headers: crossOriginHeaders },
  preview: { headers: crossOriginHeaders },
  // Tests build proxy URLs from VITE_NAVITIA_PROXY_URL; give it a stable value.
  test: { env: { VITE_NAVITIA_PROXY_URL: 'https://proxy.test' } },
})
