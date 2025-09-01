import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This allows the dev server to proxy API requests to your Vercel backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Default Vercel dev port
        changeOrigin: true,
      },
    },
  },
});
