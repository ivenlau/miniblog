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

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.use('*', originCheck)
app.onError(errorHandler)
// standalone 素材直链 /assets/:slug（在 /admin/* 转发之前注册）
app.route('/', assetsLink)
// 模板主题资产 /themes/<id>/*
app.route('/', themeAssets)
// /admin/*：Admin SPA —— 精确资产命中直接返回，未命中回退 index.html（手动 SPA 回退）
app.all('/admin/*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (res.status !== 404) return res
  const index = await c.env.ASSETS.fetch(new URL('/admin/index.html', c.req.url).toString())
  return new Response(index.body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})
app.notFound(notFoundHandler)

app.route('/api', auth)
app.route('/api', adminApi)
app.route('/api', themeAdmin)
app.route('/', publicSite)

export default {
  fetch: app.fetch,
}
