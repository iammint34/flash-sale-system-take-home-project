import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // proxy api routes to the nest backend during dev
    proxy: {
      '/health': 'http://localhost:3000',
      '/sale': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
    },
  },
});
