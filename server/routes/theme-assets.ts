import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { Errors } from '../lib/errors'

/** 模板主题静态资产：GET /themes/<id>/<path>（templates/*.liquid 源码不对外） */
export const themeAssets = new Hono<AppEnv>()

themeAssets.get('/themes/:id/*', async (c) => {
  const id = c.req.param('id')
  const rest = c.req.path.replace(/^\/themes\/[^/]+\//, '')
  if (!rest || rest.startsWith('templates/')) throw Errors.notFound()

  const obj = await c.env.R2.get(`themes/${id}/${rest}`)
  if (!obj) throw Errors.notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
