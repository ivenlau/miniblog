import { Hono } from 'hono'
import { unzipSync } from 'fflate'
import type { AppEnv } from '../lib/env'
import { Errors } from '../lib/errors'
import { requireAuth } from '../middleware'

type ThemeMeta = { id?: string; name?: string }

/** 主题包管理：zip 上传（theme.json + templates/*.liquid + assets/*）→ R2 themes/<id>/ */
export const themeAdmin = new Hono<AppEnv>().use('*', requireAuth)

themeAdmin.post('/themes', async (c) => {
  const body = new Uint8Array(await c.req.arrayBuffer())
  if (body.byteLength > 5 * 1024 * 1024) throw Errors.badRequest('THEME_TOO_LARGE')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(body)
  } catch {
    throw Errors.badRequest('THEME_ZIP_INVALID')
  }

  let meta: ThemeMeta
  const metaFile = files['theme.json']
  if (!metaFile) throw Errors.badRequest('THEME_META_MISSING')
  try {
    meta = JSON.parse(new TextDecoder().decode(metaFile)) as ThemeMeta
  } catch {
    throw Errors.badRequest('THEME_META_INVALID')
  }
  if (!meta.name) throw Errors.badRequest('THEME_NAME_MISSING')
  const hasIndex = Object.keys(files).some((p) => /^templates\/index\.liquid$/.test(p))
  if (!hasIndex) throw Errors.badRequest('THEME_INDEX_MISSING')

  // 主题 id：theme.json 的 id 或名称推导，避免冲突
  const id =
    (meta.id ?? meta.name)
      .toLowerCase()
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `theme-${Date.now()}`

  await c.env.R2.delete(`themes/${id}`) // 重新上传即覆盖
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/')) continue
    await c.env.R2.put(`themes/${id}/${path}`, data)
  }
  return c.json({ id, name: meta.name, files: Object.keys(files).length }, 201)
})

themeAdmin.get('/themes', async (c) => {
  const listed = await c.env.R2.list({ prefix: 'themes/' })
  const ids = new Set<string>()
  for (const obj of listed.objects) {
    const m = /^themes\/([^/]+)\//.exec(obj.key)
    if (m?.[1]) ids.add(m[1])
  }
  const items = []
  for (const id of ids) {
    const meta = await c.env.R2.get(`themes/${id}/theme.json`)
    let name = id
    if (meta) {
      try {
        name = (JSON.parse(await meta.text()) as ThemeMeta).name ?? id
      } catch {
        /* 忽略损坏 meta */
      }
    }
    items.push({ id, name })
  }
  return c.json({ items })
})

themeAdmin.delete('/themes/:id', async (c) => {
  const id = c.req.param('id')
  const listed = await c.env.R2.list({ prefix: `themes/${id}/` })
  for (const obj of listed.objects) await c.env.R2.delete(obj.key)
  return c.json({ ok: true })
})

// 列出主题包（theme.json 中的 name 用于展示）
