import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puerto 5174 para convivir con el sistema escolar (5173) en desarrollo.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
