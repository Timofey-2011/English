import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Базовый путь: название твоего репозитория на GitHub
  base: './', 
  build: {
    // Эта настройка поможет правильно связать скрипты
    assetsDir: 'assets',
  },
  server: {
    // Чтобы на компьютере тоже всё работало
    fs: {
      strict: false
    }
  }
})
