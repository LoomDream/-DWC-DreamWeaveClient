import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 7776,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true
      }
    }
  }
});
