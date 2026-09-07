import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../server/static',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5199,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:7860',
      '/preview': 'http://127.0.0.1:7860',
    },
  },
});
