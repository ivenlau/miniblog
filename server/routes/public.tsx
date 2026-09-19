import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { getCached, putCached, purgeBlogCache } from '../lib/cache'
import { renderMarkdown } from '../render/markdown'
import { renderMount } from '../plugins/registry'
import type { PluginConfig } from '../plugins/registry'
import { getBuiltinTheme, resolveTokens, type SiteInfo, type ThemeTokens } from '../render/themes/registry'

/** 公开站 SSR：首页 / 文章 / 归档 / 标签 / 页面 / RSS / sitemap（主题渲染） */
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

type SiteInfoT = { name: string; description: string; footer: string }

const DEFAULT_SITE: SiteInfoT = { name: 'Miniblog', description: '', footer: '' }

async function siteInfo(db: AppEnv['Bindings']['DB']): Promise<SiteInfoT> {
  const s = await db.prepare("SELECT value FROM blog_settings WHERE key = 'site'").first<{ value: string }>()
  if (!s) return DEFAULT_SITE
  try {
    const parsed = JSON.parse(s.value) as Partial<SiteInfoT>
    return { name: parsed.name || DEFAULT_SITE.name, description: parsed.description ?? '', footer: parsed.footer ?? '' }
  } catch {
    return DEFAULT_SITE
  }
}

/** 读取主题与插件配置 */
async function resolveTheme(db: AppEnv['Bindings']['DB']): Promise<{
  render: (ctx: { site: SiteInfoT; title: string; tokens: ThemeTokens; headHtml?: string; footerHtml?: string }, body: any) => any
  tokens: ThemeTokens
  plugins: PluginConfig[]
}> {
  const row = await db.prepare("SELECT value FROM blog_settings WHERE key = 'theme'").first<{ value: string }>()
  let id = 'magazine'
  let userTokens: Partial<ThemeTokens> | undefined
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { mode?: string; id?: string; tokens?: Partial<ThemeTokens> }
      if (parsed.id) id = parsed.id
      userTokens = parsed.tokens
    } catch {
      /* 设置损坏则用默认主题 */
    }
  }
  const theme = getBuiltinTheme(id)
  const tokens = resolveTokens(theme, userTokens)
  const pluginsRow = await db.prepare("SELECT value FROM blog_settings WHERE key = 'plugins'").first<{ value: string }>()
  let plugins: PluginConfig[] = []
  if (pluginsRow) {
    try {
      plugins = JSON.parse(pluginsRow.value) as PluginConfig[]
    } catch {
      plugins = []
    }
  }
  return { render: (ctx, body) => theme.render({ ...ctx, tokens }, body), tokens, plugins }
}

/** 组装挂载点 HTML */
function mounts(plugins: PluginConfig[], post?: { title: string; contentMd: string; rendered: ReturnType<typeof renderMarkdown> }) {
  const ctx = post
    ? { post: { title: post.title, contentMd: post.contentMd, rendered: post.rendered } }
    : { post: { title: '', contentMd: '', rendered: { html: '', toc: [], readingMinutes: 1, excerpt: '' } } }
  return {
    head: renderMount('head', plugins, ctx),
    postMeta: renderMount('post_meta', plugins, ctx),
    postHtml: renderMount('post_html', plugins, ctx),
    footer: renderMount('footer', plugins, ctx),
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------- 首页

publicSite.get('/', async (c) => {
  const cached = await getCached(c.env, '/')
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const { results } = await c.env.DB.prepare(
    `SELECT slug, title, summary, cover_url, pinned, published_at, updated_at FROM blog_posts
     WHERE status = 'published' ORDER BY pinned DESC, published_at DESC LIMIT 50`,
  ).all<PostRow>()
  const posts = results ?? []

  const res = await c.html(
    await theme.render(
      { site: info, title: info.name, tokens: theme.tokens },
      <div>
        {posts.length === 0 && <p style={{ color: '#888' }}>还没有文章。</p>}
        {posts.map((p) => (
          <div class="post">
            <a href={`/post/${p.slug}`}>
              <h2>
                {p.pinned ? '📌 ' : ''}
                {p.title}
              </h2>
            </a>
            {p.summary && <p style={{ color: '#888', margin: '.25rem 0' }}>{p.summary}</p>}
            <time class="meta">{new Date(p.published_at ?? p.updated_at).toLocaleDateString('zh-CN')}</time>
          </div>
        ))}
      </div>,
    ),
  )
  await putCached(c.env, '/', res)
  return res
})

// ---------------------------------------------------------------- 文章页

publicSite.get('/post/:slug', async (c) => {
  const path = `/post/${c.req.param('slug')}`
  const cached = await getCached(c.env, path)
  if (cached) return cached

  const row = await c.env.DB.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'")
    .bind(c.req.param('slug'))
    .first<PostRow>()
  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  if (!row) {
    return c.html(await theme.render({ site: info, title: '404', tokens: theme.tokens }, <p>文章不存在或未发布。</p>), 404)
  }

  await c.env.DB.prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?').bind(row.id).run()
  const rendered = renderMarkdown(row.content_md)

  const m = mounts(theme.plugins, { title: row.title, contentMd: row.content_md, rendered })
  const metaHtml = m.postMeta
  const postExtra = m.postHtml

  const res = await c.html(
    await theme.render(
      { site: info, title: `${row.title} · ${info.name}`, tokens: theme.tokens, headHtml: m.head, footerHtml: m.footer },
      <article>
        <h1>{row.title}</h1>
        <p class="meta">
          {new Date(row.published_at ?? row.updated_at).toLocaleDateString('zh-CN')} · {rendered.readingMinutes} 分钟阅读 ·{' '}
          {row.views + 1} 次浏览
          {metaHtml && <span dangerouslySetInnerHTML={{ __html: ` ${metaHtml}` }} />}
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
        {postExtra && <div dangerouslySetInnerHTML={{ __html: postExtra }} />}
      </article>,
    ),
  )
  await putCached(c.env, path, res)
  return res
})

// ---------------------------------------------------------------- 归档

publicSite.get('/archive', async (c) => {
  const cached = await getCached(c.env, '/archive')
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const { results } = await c.env.DB.prepare(
    "SELECT slug, title, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC",
  ).all<{ slug: string; title: string; published_at: number | null }>()
  const groups = new Map<string, { slug: string; title: string }[]>()
  for (const p of results ?? []) {
    const at = p.published_at ?? 0
    const label = new Date(at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push({ slug: p.slug, title: p.title })
  }

  const res = await c.html(
    await theme.render(
      { site: info, title: `归档 · ${info.name}`, tokens: theme.tokens },
      <div>
        <h1 class="page-title">归档</h1>
        {[...groups.entries()].map(([label, posts]) => (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.05rem' }}>{label}</h2>
            {posts.map((p) => (
              <div style={{ padding: '.2rem 0' }}>
                <a href={`/post/${p.slug}`}>{p.title}</a>
              </div>
            ))}
          </div>
        ))}
      </div>,
    ),
  )
  await putCached(c.env, '/archive', res)
  return res
})

// ---------------------------------------------------------------- 标签

publicSite.get('/tag/:slug', async (c) => {
  const tagSlug = c.req.param('slug')
  const path = `/tag/${tagSlug}`
  const cached = await getCached(c.env, path)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const tag = await c.env.DB.prepare('SELECT name FROM blog_tags WHERE slug = ?').bind(tagSlug).first<{ name: string }>()
  if (!tag) {
    return c.html(await theme.render({ site: info, title: '404', tokens: theme.tokens }, <p>标签不存在。</p>), 404)
  }
  const { results } = await c.env.DB.prepare(
    `SELECT p.slug, p.title, p.published_at FROM blog_posts p
     JOIN blog_post_tags pt ON pt.post_id = p.id JOIN blog_tags t ON t.id = pt.tag_id
     WHERE t.slug = ? AND p.status = 'published' ORDER BY p.published_at DESC`,
  )
    .bind(tagSlug)
    .all<{ slug: string; title: string; published_at: number | null }>()

  const res = await c.html(
    await theme.render(
      { site: info, title: `标签「${tag.name}」 · ${info.name}`, tokens: theme.tokens },
      <div>
        <h1 class="page-title">标签「{tag.name}」</h1>
        {(results ?? []).length === 0 && <p style={{ color: '#888' }}>没有文章。</p>}
        {(results ?? []).map((p) => (
          <div style={{ padding: '.2rem 0' }}>
            <a href={`/post/${p.slug}`}>{p.title}</a>
          </div>
        ))}
      </div>,
    ),
  )
  await putCached(c.env, path, res)
  return res
})

// ---------------------------------------------------------------- 独立页面

publicSite.get('/page/:slug', async (c) => {
  const pageSlug = c.req.param('slug')
  const path = `/page/${pageSlug}`
  const cached = await getCached(c.env, path)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const row = await c.env.DB.prepare('SELECT title, content_md FROM blog_pages WHERE slug = ?').bind(pageSlug).first<{
    title: string
    content_md: string
  }>()
  if (!row) {
    return c.html(await theme.render({ site: info, title: '404', tokens: theme.tokens }, <p>页面不存在。</p>), 404)
  }

  const rendered = renderMarkdown(row.content_md)
  const res = await c.html(
    await theme.render(
      { site: info, title: `${row.title} · ${info.name}`, tokens: theme.tokens },
      <article>
        <h1>{row.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </article>,
    ),
  )
  await putCached(c.env, path, res)
  return res
})

// ---------------------------------------------------------------- RSS / sitemap

const RSS_HEADERS = { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' }

publicSite.get('/rss.xml', async (c) => {
  const info = await siteInfo(c.env.DB)
  const base = new URL(c.env.APP_PUBLIC_URL).toString()
  const { results } = await c.env.DB.prepare(
    "SELECT slug, title, summary, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 20",
  ).all<{ slug: string; title: string; summary: string; published_at: number | null }>()
  const items = (results ?? [])
    .map(
      (p) =>
        `<item><title>${esc(p.title)}</title><link>${base}post/${p.slug}</link><guid>${base}post/${p.slug}</guid><pubDate>${new Date(
          p.published_at ?? 0,
        ).toUTCString()}</pubDate><description>${esc(p.summary)}</description></item>`,
    )
    .join('')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(info.name)}</title><link>${base}</link><description>${esc(
      info.description,
    )}</description>${items}</channel></rss>`,
    { headers: RSS_HEADERS },
  )
})

publicSite.get('/sitemap.xml', async (c) => {
  const base = new URL(c.env.APP_PUBLIC_URL).toString()
  const { results } = await c.env.DB.prepare("SELECT slug, updated_at FROM blog_posts WHERE status = 'published'").all<{
    slug: string
    updated_at: number
  }>()
  const { results: pages } = await c.env.DB.prepare('SELECT slug, updated_at FROM blog_pages').all<{
    slug: string
    updated_at: number
  }>()
  const urls = ['/', '/archive', ...((results ?? []).map((p) => `/post/${p.slug}`)), ...((pages ?? []).map((p) => `/page/${p.slug}`))]
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${base}${u.replace(/^\//, '')}</loc></url>`).join('') +
    `</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } })
})
