import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Точка и слэш заставляют пути быть относительными
  build: {
    outDir: 'dist',
  }
})
