import { Hono } from 'hono'
import type { AppEnv } from './lib/env'
import { originCheck, errorHandler, notFoundHandler } from './middleware'
import { auth } from './routes/auth'
import { adminApi } from './routes/admin-api'
import { assetsLink } from './routes/assets'
import { themeAdmin } from './routes/themes'
import { themeAssets } from './routes/theme-assets'
import { publicSite } from './routes/public'

const app = new Hono<AppEnv>()

/**
 * Admin 专用安全响应头（仅 text/html）：
 * theme.js / vite 产物均为外部文件，script-src 'self' 即可；
 * img-src 放开 https: 与 data:（图床直链缩略图 / TOTP 二维码）。
 */
const ADMIN_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

function withAdminHeaders(res: Response): Response {
  const ct = res.headers.get('Content-Type') ?? ''
  if (!ct.includes('text/html')) return res
  const h = new Headers()
  res.headers.forEach((v, k) => h.set(k, v))
  h.set('Content-Security-Policy', ADMIN_CSP)
  h.set('X-Frame-Options', 'DENY')
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'no-referrer')
  h.set('Permissions-Policy', 'publickey-credentials-get=(self)')
  return new Response(res.body, { status: res.status, headers: h })
}

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.use('*', originCheck)
app.onError(errorHandler)
// standalone 素材直链 /assets/:slug（在 /admin/* 转发之前注册）
app.route('/', assetsLink)
// 模板主题资产 /themes/<id>/*
app.route('/', themeAssets)
// /admin/*：Admin SPA —— 精确资产命中直接返回，未命中回退 index.html（手动 SPA 回退）。
// HTML 响应统一加安全头；公开 SSR 页不加 CSP（插件需注入 CDN script）。
app.all('/admin/*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (res.status !== 404) return withAdminHeaders(res)
  const index = await c.env.ASSETS.fetch(new URL('/admin/index.html', c.req.url).toString())
  return withAdminHeaders(
    new Response(index.body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  )
})
app.notFound(notFoundHandler)

app.route('/api', auth)
app.route('/api', adminApi)
app.route('/api', themeAdmin)
app.route('/', publicSite)

export default {
  fetch: app.fetch,
}
