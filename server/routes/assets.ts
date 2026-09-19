import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { Errors } from '../lib/errors'

/** 解析 Range 头（与 minidriver 图床一致） */
function parseRange(header: string | null | undefined, size: number): { offset: number; length: number } | null {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, startStr, endStr] = m
  if (startStr === '' && endStr === '') return null
  if (startStr === '') {
    const suffix = Math.min(parseInt(endStr!, 10), size)
    if (suffix <= 0) return null
    return { offset: size - suffix, length: suffix }
  }
  const start = parseInt(startStr!, 10)
  if (start >= size) return null
  const end = endStr === '' ? size - 1 : Math.min(parseInt(endStr as string, 10), size - 1)
  if (end < start) return null
  return { offset: start, length: end - start + 1 }
}

/**
 * standalone 模式的素材直链：GET /assets/:slug
 * 语义与 minidriver 图床一致：无鉴权、public 长缓存、CORS 全开、ETag/304。
 */
export const assetsLink = new Hono<AppEnv>()

assetsLink.get('/assets/:slug', async (c) => {
  const row = await c.env.DB.prepare('SELECT r2_key, mime, size, name FROM blog_assets WHERE slug = ?')
    .bind(c.req.param('slug'))
    .first<{ r2_key: string; mime: string; size: number; name: string }>()
  if (!row) throw Errors.notFound()

  const range = parseRange(c.req.header('range'), row.size)
  const obj = await c.env.R2.get(row.r2_key, range ? { range } : undefined)
  if (!obj) throw Errors.notFound()

  const headers: Record<string, string> = {
    'Content-Type': row.mime,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    ETag: obj.httpEtag,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
  }
  if (c.req.header('if-none-match')?.split(',').map((s) => s.trim()).includes(obj.httpEtag)) {
    return new Response(null, { status: 304, headers })
  }
  if (range) {
    return new Response(obj.body, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size}`,
        'Content-Length': String(range.length),
      },
    })
  }
  return new Response(obj.body, { status: 200, headers: { ...headers, 'Content-Length': String(row.size) } })
})
