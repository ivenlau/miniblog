import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// admin SPA：构建产物输出到 public/admin，由 Worker 的 ASSETS 绑定在 /admin/* 提供
export default defineConfig({
  root: 'admin',
  plugins: [react(), tailwindcss()],
  base: '/admin/',
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787' },
    },
  },
})
