import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  // Let Vite discover and prebundle the UI dependencies. Disabling dependency
  // discovery forced the browser to load the full Recharts/Lucide module graph
  // one file at a time, which could leave the app on its startup screen.
  optimizeDeps: { include: ['react', 'react-dom/client', 'recharts', 'lucide-react'] },
  server: {
    watch: { ignored: ['**/release-fixed/**', '**/release/**', '**/outputs/**', '**/data/**', '**/backups/**'] },
    host: '127.0.0.1',
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    strictPort: process.env.VITE_DEV_STRICT_PORT === '1',
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
});
