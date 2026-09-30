import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: '../plugin/goally/dashboard', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5177,
    proxy: { '/api': 'http://127.0.0.1:4777' },
  },
})
