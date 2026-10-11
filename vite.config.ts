import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], resolve: { preserveSymlinks: true }, optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: Number(process.env.VITE_DEV_PORT) || 5173, strictPort: process.env.VITE_DEV_STRICT_PORT === '1', proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false } } } });
