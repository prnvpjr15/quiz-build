import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Built into the directory Express already serves, so the production setup
  // stays single-origin and no CORS is involved.
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },

  server: {
    // In development Vite serves the UI and proxies the API to the Express
    // process, so relative /api paths work the same in both environments.
    // API_PORT is set by scripts/dev.js, which may have moved the API off its
    // default port because something else was already there.
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT || 3000}`,
      '/health': `http://localhost:${process.env.API_PORT || 3000}`,
    },
  },
});
