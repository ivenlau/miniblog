import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { Errors } from '../lib/errors'
import { ulid } from '../lib/ids'
import { requireAuth } from '../middleware'
import { purgeBlogCache } from '../lib/cache'
import { renderMarkdown, slugFromTitle } from '../render/markdown'
import { readJson } from '../lib/validate'

/** Admin API（全部需会话）：博客文章 CRUD / 发布流 / 标签 / 预览 */
export const adminApi = new Hono<AppEnv>().use('*', requireAuth)

type PostRow = {
  id: string
  slug: string
  title: string
  summary: string
  content_md: string
  cover_url: string | null
  status: 'draft' | 'published'
  pinned: number
  views: number
  published_at: number | null
  created_at: number
  updated_at: number
}

type TagRow = { id: string; name: string; slug: string }

const LIST_COLS = 'id, slug, title, summary, cover_url, status, pinned, views, published_at, created_at, updated_at'

function toDto(r: PostRow, tags: string[] = []) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    coverUrl: r.cover_url,
    contentMd: (r as { content_md?: string }).content_md,
    status: r.status,
    pinned: !!r.pinned,
    views: r.views,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tags,
  }
}

async function postTags(db: AppEnv['Bindings']['DB'], postId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT t.name FROM blog_tags t JOIN blog_post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name')
    .bind(postId)
    .all<{ name: string }>()
  return (results ?? []).map((r) => r.name)
}

async function setPostTags(db: AppEnv['Bindings']['DB'], postId: string, tags: string[]): Promise<void> {
  await db.prepare('DELETE FROM blog_post_tags WHERE post_id = ?').bind(postId).run()
  for (const name of tags.slice(0, 10)) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const slug = slugFromTitle(trimmed)
    let tag = await db.prepare('SELECT id FROM blog_tags WHERE slug = ?').bind(slug).first<{ id: string }>()
    if (!tag) {
      const id = ulid()
      try {
        await db.prepare('INSERT INTO blog_tags (id, name, slug) VALUES (?,?,?)').bind(id, trimmed, slug).run()
      } catch (err) {
        console.error('[sql] INSERT blog_tags:', (err as Error).message, (err as { cause?: { message?: string } }).cause?.message)
        throw err
      }
      tag = { id }
    }
    try {
      await db
        .prepare('INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?,?)')
        .bind(postId, tag.id)
        .run()
    } catch (err) {
      console.error('[sql] INSERT blog_post_tags:', (err as Error).message, (err as { cause?: { message?: string } }).cause?.message)
      throw err
    }
  }
}

async function uniquePostSlug(db: AppEnv['Bindings']['DB'], base: string, excludeId?: string): Promise<string> {
  let slug = base
  let n = 2
  for (;;) {
    const hit = await db
      .prepare('SELECT 1 FROM blog_posts WHERE slug = ? AND id != ?')
      .bind(slug, excludeId ?? '')
      .first()
    if (!hit) return slug
    slug = `${base}-${n++}`
  }
}

async function tagSlugsOfPost(db: AppEnv['Bindings']['DB'], postId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT t.slug FROM blog_tags t JOIN blog_post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ?')
    .bind(postId)
    .all<{ slug: string }>()
  return (results ?? []).map((r) => r.slug)
}

async function getPost(db: AppEnv['Bindings']['DB'], id: string): Promise<PostRow> {
  const row = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(id).first<PostRow>()
  if (!row) throw Errors.notFound('POST_NOT_FOUND')
  return row
}

// ---------------------------------------------------------------- 路由

/** 渲染预览（与正式渲染同管线，保证所见即所得） */
adminApi.post('/preview', async (c) => {
  const body = await readJson(c)
  return c.json(renderMarkdown(typeof body.contentMd === 'string' ? body.contentMd : ''))
})

adminApi.get('/posts', async (c) => {
  const status = c.req.query('status') === 'draft' ? 'draft' : c.req.query('status') === 'published' ? 'published' : null
  const { results } = status
    ? await c.env.DB.prepare(`SELECT ${LIST_COLS} FROM blog_posts WHERE status = ? ORDER BY updated_at DESC LIMIT 200`).bind(status).all<PostRow>()
    : await c.env.DB.prepare(`SELECT ${LIST_COLS} FROM blog_posts ORDER BY updated_at DESC LIMIT 200`).all<PostRow>()
  const items = []
  for (const r of results ?? []) items.push(toDto(r, await postTags(c.env.DB, r.id)))
  return c.json({ items })
})

adminApi.post('/posts', async (c) => {
  const body = await readJson(c)
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : ''
  if (!title) throw Errors.badRequest('TITLE_REQUIRED')
  const base = typeof body.slug === 'string' && body.slug.trim() ? slugFromTitle(body.slug) : slugFromTitle(title)
  const slug = await uniquePostSlug(c.env.DB, base)
  const id = ulid()
  const now = Date.now()
  const contentMd = typeof body.contentMd === 'string' ? body.contentMd : ''
  try {
    await c.env.DB.prepare(
      'INSERT INTO blog_posts (id, slug, title, summary, content_md, cover_url, status, pinned, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        slug,
        title,
        typeof body.summary === 'string' ? body.summary.slice(0, 300) : '',
        contentMd,
        typeof body.coverUrl === 'string' ? body.coverUrl : null,
        'draft',
        body.pinned === true ? 1 : 0,
        now,
        now,
      )
      .run()
  } catch (err) {
    console.error('[sql] INSERT blog_posts:', (err as Error).message, (err as { cause?: { message?: string } }).cause?.message)
    throw err
  }
  if (Array.isArray(body.tags)) {
    try {
      await setPostTags(c.env.DB, id, body.tags as string[])
    } catch (err) {
      console.error('[sql] setPostTags:', (err as Error).message, (err as { cause?: { message?: string } }).cause?.message)
      throw err
    }
  }
  const row = await getPost(c.env.DB, id)
  return c.json(toDto(row, await postTags(c.env.DB, id)), 201)
})

adminApi.get('/posts/:id', async (c) => {
  const row = await getPost(c.env.DB, c.req.param('id'))
  return c.json(toDto(row, await postTags(c.env.DB, row.id)))
})

adminApi.put('/posts/:id', async (c) => {
  const body = await readJson(c)
  const old = await getPost(c.env.DB, c.req.param('id'))

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : old.title
  let slug = old.slug
  if (typeof body.slug === 'string' && body.slug.trim() && slugFromTitle(body.slug) !== old.slug) {
    slug = await uniquePostSlug(c.env.DB, slugFromTitle(body.slug), old.id)
  }
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 300) : old.summary
  const contentMd = typeof body.contentMd === 'string' ? body.contentMd : old.content_md
  const coverUrl = typeof body.coverUrl === 'string' ? body.coverUrl : old.cover_url
  const pinned = typeof body.pinned === 'boolean' ? (body.pinned ? 1 : 0) : old.pinned

  await c.env.DB.prepare(
    'UPDATE blog_posts SET slug = ?, title = ?, summary = ?, content_md = ?, cover_url = ?, pinned = ?, updated_at = ? WHERE id = ?',
  )
    .bind(slug, title, summary, contentMd, coverUrl, pinned, Date.now(), old.id)
    .run()
  if (Array.isArray(body.tags)) await setPostTags(c.env.DB, old.id, body.tags as string[])

  // 已发布内容的缓存清理（slug 变更时新旧都清）
  if (old.status === 'published') {
    await purgeBlogCache(c.env, { slug: old.slug })
    if (slug !== old.slug) await purgeBlogCache(c.env, { slug })
  }
  const row = await getPost(c.env.DB, old.id)
  return c.json(toDto(row, await postTags(c.env.DB, row.id)))
})

adminApi.delete('/posts/:id', async (c) => {
  const row = await getPost(c.env.DB, c.req.param('id'))
  const tags = row.status === 'published' ? await tagSlugsOfPost(c.env.DB, row.id) : []
  await c.env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(row.id).run()
  if (row.status === 'published') await purgeBlogCache(c.env, { slug: row.slug, tagSlugs: tags })
  return c.json({ ok: true })
})

adminApi.post('/posts/:id/publish', async (c) => {
  const row = await getPost(c.env.DB, c.req.param('id'))
  const now = Date.now()
  await c.env.DB.prepare(
    'UPDATE blog_posts SET status = "published", published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?',
  )
    .bind(now, now, row.id)
    .run()
  await purgeBlogCache(c.env, { tagSlugs: await tagSlugsOfPost(c.env.DB, row.id) })
  return c.json({ ok: true })
})

adminApi.post('/posts/:id/unpublish', async (c) => {
  const row = await getPost(c.env.DB, c.req.param('id'))
  await c.env.DB.prepare('UPDATE blog_posts SET status = "draft", updated_at = ? WHERE id = ?').bind(Date.now(), row.id).run()
  await purgeBlogCache(c.env, { slug: row.slug, tagSlugs: await tagSlugsOfPost(c.env.DB, row.id) })
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- 页面（about 等）

adminApi.get('/pages/:slug', async (c) => {
  const slug = c.req.param('slug')
  const row = await c.env.DB.prepare('SELECT slug, title, content_md, updated_at FROM blog_pages WHERE slug = ?')
    .bind(slug)
    .first<{ slug: string; title: string; content_md: string; updated_at: number }>()
  if (!row) return c.json({ slug, title: '', contentMd: '', updatedAt: null })
  return c.json({ slug: row.slug, title: row.title, contentMd: row.content_md, updatedAt: row.updated_at })
})

adminApi.put('/pages/:slug', async (c) => {
  const slug = c.req.param('slug')
  const body = await readJson(c)
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : slug
  const contentMd = typeof body.contentMd === 'string' ? body.contentMd : ''
  const now = Date.now()
  await c.env.DB.prepare(
    "INSERT INTO blog_pages (id, slug, title, content_md, updated_at) VALUES (?,?,?,?,?) "
      + "ON CONFLICT(slug) DO UPDATE SET title = excluded.title, content_md = excluded.content_md, updated_at = excluded.updated_at",
  )
    .bind(ulid(), slug, title, contentMd, now)
    .run()
  await purgeBlogCache(c.env, { pageSlug: slug })
  return c.json({ slug, title, contentMd, updatedAt: now })
})

adminApi.delete('/pages/:slug', async (c) => {
  await c.env.DB.prepare('DELETE FROM blog_pages WHERE slug = ?').bind(c.req.param('slug')).run()
  await purgeBlogCache(c.env, { pageSlug: c.req.param('slug') })
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- 站点设置

adminApi.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM blog_settings').all<{ key: string; value: string }>()
  const out: Record<string, unknown> = {}
  for (const r of results ?? []) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      out[r.key] = r.value
    }
  }
  return c.json(out)
})

adminApi.put('/settings', async (c) => {
  const body = (await readJson(c)) as Record<string, unknown>
  for (const [key, value] of Object.entries(body)) {
    if (!['site', 'theme', 'plugins'].includes(key)) continue
    await c.env.DB.prepare(
      'INSERT INTO blog_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
      .bind(key, JSON.stringify(value))
      .run()
  }
  await purgeBlogCache(c.env)
  return c.json({ ok: true })
})
