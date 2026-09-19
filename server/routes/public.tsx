import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { getCached, putCached } from '../lib/cache'
import { renderMarkdown } from '../render/markdown'

/** 公开站 SSR（首页/文章页；归档、标签、RSS 在 M1-2） */
export const publicSite = new Hono<AppEnv>()

type PostRow = {
  id: string
  slug: string
  title: string
  summary: string
  content_md: string
  cover_url: string | null
  pinned: number
  views: number
  published_at: number | null
  updated_at: number
}

async function siteName(db: AppEnv['Bindings']['DB']): Promise<string> {
  const s = await db.prepare("SELECT value FROM blog_settings WHERE key = 'site'").first<{ value: string }>()
  if (!s) return 'Miniblog'
  try {
    return (JSON.parse(s.value) as { name?: string }).name ?? 'Miniblog'
  } catch {
    return 'Miniblog'
  }
}

function page(title: string, body: unknown) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>
          {`body{font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;margin:0;background:#f6f7f9;color:#17181c;line-height:1.7}
main{max-width:46rem;margin:0 auto;padding:3rem 1.25rem}
a{color:inherit;text-decoration:none}a:hover{color:#5b5bd6}
.post{margin-bottom:2.5rem}.post h2{margin:0 0 .25rem;font-size:1.35rem}.meta{color:#667085;font-size:.85rem}
article h1{font-size:1.9rem}article img{max-width:100%;border-radius:12px}article pre{overflow-x:auto;padding:1rem;background:#1d212b;color:#e7e9ee;border-radius:12px}
article code{background:#eceef2;padding:.1em .35em;border-radius:6px}article pre code{background:none;padding:0}
.toc{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:1rem;margin:1.5rem 0}.toc a{display:block;padding:.15rem 0;font-size:.9rem}`}
        </style>
      </head>
      <body>
        <main>
          <header style={{ marginBottom: '2.5rem' }}>
            <a href="/" style={{ fontWeight: 600 }}>
              Miniblog
            </a>
          </header>
          {body}
        </main>
      </body>
    </html>
  )
}

publicSite.get('/', async (c) => {
  const cached = await getCached(c.env, '/')
  if (cached) return cached

  const { results } = await c.env.DB.prepare(
    `SELECT slug, title, summary, cover_url, pinned, published_at FROM blog_posts
     WHERE status = 'published' ORDER BY pinned DESC, published_at DESC LIMIT 50`,
  ).all<PostRow>()
  const posts = results ?? []
  const name = await siteName(c.env.DB)

  const res = await c.html(
    page(
      name,
      <div>
        {posts.length === 0 && <p style={{ color: '#667085' }}>还没有文章。</p>}
        {posts.map((p) => (
          <div class="post">
            <a href={`/post/${p.slug}`}>
              <h2>
                {p.pinned ? '📌 ' : ''}
                {p.title}
              </h2>
            </a>
            {p.summary && <p style={{ color: '#667085', margin: '.25rem 0' }}>{p.summary}</p>}
            <time class="meta">{new Date(p.published_at ?? p.updated_at).toLocaleDateString('zh-CN')}</time>
          </div>
        ))}
      </div>,
    ),
  )
  await putCached(c.env, '/', res)
  return res
})

publicSite.get('/post/:slug', async (c) => {
  const path = `/post/${c.req.param('slug')}`
  const cached = await getCached(c.env, path)
  if (cached) return cached

  const row = await c.env.DB.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'")
    .bind(c.req.param('slug'))
    .first<PostRow>()
  if (!row) return c.html(page('404', <p>文章不存在或未发布。</p>), 404)

  await c.env.DB.prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?').bind(row.id).run()
  const rendered = renderMarkdown(row.content_md)
  const name = await siteName(c.env.DB)

  const res = await c.html(
    page(
      `${row.title} · ${name}`,
      <article>
        <h1>{row.title}</h1>
        <p class="meta">
          {new Date(row.published_at ?? row.updated_at).toLocaleDateString('zh-CN')} · {rendered.readingMinutes} 分钟阅读 ·{' '}
          {row.views + 1} 次浏览
        </p>
        {rendered.toc.length > 0 && (
          <nav class="toc">
            {rendered.toc.map((t) => (
              <a href={`#${t.id}`} style={{ paddingLeft: `${(t.level - 2) * 1}rem` }}>
                {t.text}
              </a>
            ))}
          </nav>
        )}
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </article>,
    ),
  )
  await putCached(c.env, path, res)
  return res
})
