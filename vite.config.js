import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Run `vercel dev` on 3000 to serve /api locally, or point this at any API host.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
