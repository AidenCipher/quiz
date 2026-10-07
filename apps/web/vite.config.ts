import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  // Three.js is a deliberately lazy chunk (home page only); phones joining a game never load it.
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: { environment: 'jsdom' },
});
