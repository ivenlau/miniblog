import { Hono } from 'hono'
import type { AppEnv } from './lib/env'
import { originCheck, errorHandler, notFoundHandler } from './middleware'
import { auth } from './routes/auth'
import { publicSite } from './routes/public'

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.use('*', originCheck)
app.onError(errorHandler)
// /admin/*：Admin SPA（ASSETS 绑定，single-page-application 回退）
app.all('/admin/*', (c) => c.env.ASSETS.fetch(c.req.raw))
app.notFound(notFoundHandler)

app.route('/api', auth)
app.route('/', publicSite)

export default {
  fetch: app.fetch,
}
