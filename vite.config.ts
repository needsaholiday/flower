import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // For local development with "sample-pipeline" pointing to localhost:4195
      '/api/proxy/sample-pipeline': {
        target: 'http://localhost:4195',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/sample-pipeline/, ''),
      },
      // If running the full Caddy stack locally on 8080:
      // '/api/proxy': {
      //   target: 'http://localhost:8080',
      //   changeOrigin: true,
      // },
      // '/targets.json': {
      //   target: 'http://localhost:8080',
      //   changeOrigin: true,
      // },
    },
  },
});
