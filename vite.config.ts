import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** dev API 的公开 origin（.dev.vars 的 APP_PUBLIC_URL；服务端 originCheck 以它为信任基准） */
function devApiOrigin(): string {
  try {
    const vars = Object.fromEntries(
      readFileSync('.dev.vars', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
    return new URL(vars.APP_PUBLIC_URL).origin
  } catch {
    return 'http://localhost:8787'
  }
}

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
      '/api': {
        target: 'http://127.0.0.1:8787',
        // 代理默认透传浏览器 Origin（http://localhost:5174），会被服务端
        // originCheck 拒绝（ORIGIN_NOT_ALLOWED）。dev 代理下改写为 API 同源；
        // 注意 WebAuthn 流程绑定真实页面 origin，仍需直接走 :8787 验证。
        configure: (proxy) => {
          const origin = devApiOrigin()
          proxy.on('proxyReq', (proxyReq) => {
            if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', origin)
          })
        },
      },
    },
  },
})
