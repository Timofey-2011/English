import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 1. Добавили base, чтобы не было белого экрана
    base: './', 
    plugins: [react(), tailwindcss()],
    define: {
      // 2. Исправили название ключа, чтобы он брался из твоих Secrets
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: {
        overlay: false,
      }
    },
  };
});
