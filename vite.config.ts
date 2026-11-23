import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // In production the renderer is served by Express from dist/,
    // so assets must use relative paths.
    base: isDev ? '/' : './',
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://127.0.0.1:3000',
        '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
