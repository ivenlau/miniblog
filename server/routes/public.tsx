import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { getCached, putCached, purgeBlogCache } from '../lib/cache'
import { publicOrigin } from '../lib/env'
import { renderMarkdown } from '../render/markdown'
import { renderLiquid } from '../render/liquid'
import { renderMount } from '../plugins/registry'
import type { PluginConfig } from '../plugins/registry'
import { getBuiltinTheme, resolveTokens, type NavItem, type SiteInfo, type ThemeTokens } from '../render/themes/registry'

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

type SiteInfoT = SiteInfo

const DEFAULT_SITE: SiteInfoT = { name: 'Miniblog', description: '', footer: '' }

/** site.nav 校验：每项需非空 label + 合法 href（/ 开头或 http(s)://），最多 8 条 */
function validNav(raw: unknown): NavItem[] {
  if (!Array.isArray(raw)) return []
  const items: NavItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { label, href } = item as Partial<NavItem>
    if (typeof label !== 'string' || !label.trim()) continue
    if (typeof href !== 'string' || !(href.startsWith('/') || /^https?:\/\//.test(href))) continue
    items.push({ label: label.trim().slice(0, 24), href })
    if (items.length >= 8) break
  }
  return items
}

/** 站点信息 + 导航。未配置 nav 时按内容给默认值（有关于页才加「关于」） */
async function siteInfo(db: AppEnv['Bindings']['DB']): Promise<SiteInfoT> {
  const s = await db.prepare("SELECT value FROM blog_settings WHERE key = 'site'").first<{ value: string }>()
  let info = DEFAULT_SITE
  if (s) {
    try {
      const parsed = JSON.parse(s.value) as Partial<SiteInfoT>
      info = { name: parsed.name || DEFAULT_SITE.name, description: parsed.description ?? '', footer: parsed.footer ?? '' }
    } catch {
      /* 设置损坏则用默认站点信息 */
    }
  }
  const nav = validNav(s ? safeParse(s.value)?.nav : undefined)
  if (nav.length > 0) {
    info.nav = nav
    return info
  }
  // 默认导航：首页 / 归档 / 标签（/tags）+ 关于页存在时加「关于」
  const about = await db.prepare("SELECT 1 FROM blog_pages WHERE slug = 'about' LIMIT 1").first()
  info.nav = [{ label: '首页', href: '/' }, { label: '归档', href: '/archive' }, { label: '标签', href: '/tags' }]
  if (about) info.nav.push({ label: '关于', href: '/page/about' })
  return info
}

function safeParse(json: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 读取主题与插件配置 */
async function resolveTheme(db: AppEnv['Bindings']['DB']): Promise<{
  mode: 'builtin' | 'custom'
  themeId?: string
  render: (ctx: { site: SiteInfoT; title: string; tokens: ThemeTokens; path?: string; searchQ?: string; headHtml?: string; footerHtml?: string }, body: any) => any
  tokens: ThemeTokens
  plugins: PluginConfig[]
}> {
  const row = await db.prepare("SELECT value FROM blog_settings WHERE key = 'theme'").first<{ value: string }>()
  let mode: 'builtin' | 'custom' = 'builtin'
  let id = 'magazine'
  let userTokens: Partial<ThemeTokens> | undefined
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { mode?: 'builtin' | 'custom'; id?: string; tokens?: Partial<ThemeTokens> }
      if (parsed.mode === 'custom' && parsed.id) {
        mode = 'custom'
        id = parsed.id
      } else if (parsed.id) {
        id = parsed.id
      }
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
  return { mode, themeId: id, render: (ctx, body) => theme.render({ ...ctx, tokens }, body), tokens, plugins }
}

/** 组装挂载点 HTML。scope='all' 用于非文章页（仅渲染声明了 all 作用域的插件） */
function mounts(
  plugins: PluginConfig[],
  post?: { title: string; slug?: string; contentMd: string; rendered: ReturnType<typeof renderMarkdown> },
  scope: 'post' | 'all' = 'post',
) {
  const ctx = post
    ? { post: { title: post.title, slug: post.slug, contentMd: post.contentMd, rendered: post.rendered } }
    : { post: { title: '', contentMd: '', rendered: { html: '', toc: [], readingMinutes: 1, excerpt: '' } } }
  return {
    head: renderMount('head', plugins, ctx, scope),
    postMeta: renderMount('post_meta', plugins, ctx, scope),
    postHtml: renderMount('post_html', plugins, ctx, scope),
    footer: renderMount('footer', plugins, ctx, scope),
  }
}

/** 公开站日期统一按东八区显示（Workers Intl 默认 UTC，晚间发布会被归到前一天） */
const DISPLAY_TZ = 'Asia/Shanghai'
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN', { timeZone: DISPLAY_TZ })
}
function fmtYearMonth(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', timeZone: DISPLAY_TZ })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------- 首页

publicSite.get('/', async (c) => {
  const PAGE_SIZE = 10
  const page = Math.max(1, Math.min(200, parseInt(c.req.query('page') ?? '1', 10) || 1))
  const fragment = c.req.query('fragment') === '1'

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const { results } = await c.env.DB.prepare(
    `SELECT slug, title, summary, cover_url, pinned, published_at, updated_at FROM blog_posts
     WHERE status = 'published' ORDER BY pinned DESC, published_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<PostRow>()
  const posts = results ?? []
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM blog_posts WHERE status = 'published'").first<{ n: number }>()
  const hasMore = page * PAGE_SIZE < (total?.n ?? 0)
  // 封面卡片仅相册封面主题展示（杂志/经典保持内容优先的文字流）
  const showListCover = theme.mode === 'builtin' && theme.themeId === 'gallery'

  const cards = (
    <div id="mb-cards">
      {posts.length === 0 && <p style={{ color: '#888' }}>{page > 1 ? '—— 已经到底啦 ——' : '还没有文章。'}</p>}
      {posts.map((p) => (
        <div class="post">
          {showListCover && p.cover_url && (
            <a href={`/post/${p.slug}`} class="post-cover-link">
              <img src={p.cover_url} alt="" loading="lazy" />
            </a>
          )}
          <a href={`/post/${p.slug}`}>
            <h2>
              {p.pinned ? '📌 ' : ''}
              {p.title}
            </h2>
          </a>
          {p.summary && <p style={{ color: '#888', margin: '.25rem 0' }}>{p.summary}</p>}
          <time class="meta">{fmtDate(p.published_at ?? p.updated_at)}</time>
        </div>
      ))}
    </div>
  )

  // 片段模式：仅返回卡片 + 翻页游标，供前端无限滚动追加（卡片由同一套主题代码渲染）
  if (fragment) {
    return c.html(
      <>
        {cards}
        <span id="mb-sentinel" data-next={hasMore ? String(page + 1) : ''} />
      </>,
    )
  }

  // 模板主题：index.liquid 全页渲染
  if (theme.mode === 'custom' && theme.themeId) {
    const html = await renderLiquid(c.env, theme.themeId, 'index.liquid', {
      site: info,
      path: '/',
      posts: posts.map((p) => ({ ...p, url: `/post/${p.slug}`, date: p.published_at ?? p.updated_at })),
    })
    if (html !== null) {
      const res = new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      await putCached(c.env, c.req.url, res, c.req.url)
      return res
    }
  }

  // 无 JS 兜底分页；JS 可用时由下方脚本隐藏、改为无限滚动
  const pager = (
    <nav class="mb-pager">
      {page > 1 && <a href={`/?page=${page - 1}`}>← 上一页</a>}
      {hasMore && <a href={`/?page=${page + 1}`}>下一页 →</a>}
    </nav>
  )

  const m = mounts(theme.plugins, undefined, 'all')

  const res = await c.html(
    await theme.render(
      { site: info, title: info.name, tokens: theme.tokens, path: '/', headHtml: m.head, footerHtml: m.footer },
      <>
        {cards}
        {pager}
        {theme.mode === 'builtin' && hasMore && (
          <>
            <span id="mb-sentinel" data-next={String(page + 1)} />
            <script dangerouslySetInnerHTML={{ __html: HOME_SCROLL_JS }} />
          </>
        )}
      </>,
    ),
  )
  await putCached(c.env, c.req.url, res, c.req.url)
  return res
})

// 无限滚动：观察哨兵，接近底部时拉取下一页片段追加（builtin 主题注入）
const HOME_SCROLL_JS =
  '(function(){var s=document.getElementById("mb-sentinel");if(!s)return;var pg=document.querySelector(".mb-pager");if(pg)pg.style.display="none";var next=parseInt(s.getAttribute("data-next")||"",10);if(!next)return;var busy=false;function load(){if(busy||!next)return;busy=true;fetch("/?page="+next+"&fragment=1").then(function(r){return r.text()}).then(function(t){var d=document.createElement("div");d.innerHTML=t;var box=d.querySelector("#mb-cards"),target=document.getElementById("mb-cards");if(box&&target)target.insertAdjacentHTML("beforeend",box.innerHTML);var nm=d.querySelector("#mb-sentinel");next=nm?parseInt(nm.getAttribute("data-next")||"",10):0;s.setAttribute("data-next",next||"");if(!next){if(io)io.disconnect();return}busy=false;observe()}).catch(function(){busy=false;observe()})}var s2=null,io=null;function observe(){s2=document.getElementById("mb-sentinel");if(!s2||!("IntersectionObserver" in window)){return}io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)load()})},{rootMargin:"600px 0px"});io.observe(s2)}observe()})()'

// ---------------------------------------------------------------- 文章页

publicSite.get('/post/:slug', async (c) => {
  const path = `/post/${c.req.param('slug')}`
  const cached = await getCached(c.env, path, c.req.url)
  if (cached) return cached

  const row = await c.env.DB.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'")
    .bind(c.req.param('slug'))
    .first<PostRow>()
  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  if (!row) {
    return c.html(
      await theme.render({ site: info, title: '404', tokens: theme.tokens, path }, <p>文章不存在或未发布。</p>),
      404,
    )
  }

  await c.env.DB.prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?').bind(row.id).run()
  const rendered = renderMarkdown(row.content_md)

  // 模板主题：post.liquid 全页渲染
  if (theme.mode === 'custom' && theme.themeId) {
    const html = await renderLiquid(c.env, theme.themeId, 'post.liquid', {
      site: info,
      path,
      post: {
        title: row.title,
        cover: row.cover_url,
        html: renderMarkdown(row.content_md).html,
        date: fmtDate(row.published_at ?? row.updated_at),
        views: row.views + 1,
        readingMinutes: renderMarkdown(row.content_md).readingMinutes,
      },
    })
    if (html !== null) {
      const res = new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      await putCached(c.env, path, res, c.req.url)
      return res
    }
  }

  const m = mounts(theme.plugins, { title: row.title, slug: row.slug, contentMd: row.content_md, rendered })
  const metaHtml = m.postMeta
  const postExtra = m.postHtml

  const res = await c.html(
    await theme.render(
      { site: info, title: `${row.title} · ${info.name}`, tokens: theme.tokens, path, headHtml: m.head, footerHtml: m.footer },
      <article>
        <h1>{row.title}</h1>
        {row.cover_url && <img class="post-hero" src={row.cover_url} alt="" />}
        <p class="meta">
          {fmtDate(row.published_at ?? row.updated_at)} · {row.views + 1} 次浏览
          {metaHtml && <span dangerouslySetInnerHTML={{ __html: ` ${metaHtml}` }} />}
        </p>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        {postExtra && <div dangerouslySetInnerHTML={{ __html: postExtra }} />}
      </article>,
    ),
  )
  await putCached(c.env, path, res, c.req.url)
  return res
})

// ---------------------------------------------------------------- 搜索

/** 文章搜索：LIKE 子串匹配标题 + 正文（中文友好，无需分词器）；个人量级全扫亚秒级 */
publicSite.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 64)
  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)

  let rows: { slug: string; title: string; summary: string; published_at: number | null; updated_at: number }[] = []
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`
    const { results } = await c.env.DB.prepare(
      `SELECT slug, title, summary, published_at, updated_at FROM blog_posts
       WHERE status = 'published' AND (title LIKE ? ESCAPE '\\' OR content_md LIKE ? ESCAPE '\\')
       ORDER BY published_at DESC LIMIT 20`,
    )
      .bind(like, like)
      .all()
    rows = (results ?? []) as typeof rows
  }

  const res = await c.html(
    await theme.render(
      { site: info, title: `${q ? `“${q}” 的搜索结果` : '搜索'} · ${info.name}`, tokens: theme.tokens, path: '/search', searchQ: q },
      <div>
        <h1 class="page-title">{q ? `“${q}” 的搜索结果` : '搜索'}</h1>
        <p class="meta">{q ? `共 ${rows.length} 条结果（最多显示 20 条）` : '输入关键词，搜索已发布的全部文章。'}</p>
        {q && rows.length === 0 && <p style={{ color: '#888', marginTop: '1.5rem' }}>没有匹配的文章，换个关键词试试。</p>}
        <div style={{ marginTop: '1.25rem' }}>
          {rows.map((p) => (
            <div class="post">
              <a href={`/post/${p.slug}`}>
                <h2>{p.title}</h2>
              </a>
              {p.summary && <p style={{ color: '#888', margin: '.25rem 0' }}>{p.summary}</p>}
              <time class="meta">{fmtDate(p.published_at ?? p.updated_at)}</time>
            </div>
          ))}
        </div>
      </div>,
    ),
  )
  return res
})

// ---------------------------------------------------------------- 归档

publicSite.get('/archive', async (c) => {
  const cached = await getCached(c.env, '/archive', c.req.url)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const { results } = await c.env.DB.prepare(
    "SELECT slug, title, published_at, updated_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC",
  ).all<{ slug: string; title: string; published_at: number | null; updated_at: number }>()
  const groups = new Map<string, { slug: string; title: string }[]>()
  for (const p of results ?? []) {
    const at = p.published_at ?? p.updated_at
    const label = fmtYearMonth(at)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push({ slug: p.slug, title: p.title })
  }

  const res = await c.html(
    await theme.render(
      { site: info, title: `归档 · ${info.name}`, tokens: theme.tokens, path: '/archive' },
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
  await putCached(c.env, '/archive', res, c.req.url)
  return res
})

// ---------------------------------------------------------------- 标签

/** 标签索引：已发布文章的标签聚合（按文章数排序） */
publicSite.get('/tags', async (c) => {
  const cached = await getCached(c.env, '/tags', c.req.url)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const { results } = await c.env.DB.prepare(
    `SELECT t.slug, t.name, COUNT(pt.post_id) AS n FROM blog_tags t
     JOIN blog_post_tags pt ON pt.tag_id = t.id
     JOIN blog_posts p ON p.id = pt.post_id AND p.status = 'published'
     GROUP BY t.id ORDER BY n DESC, t.name LIMIT 100`,
  ).all<{ slug: string; name: string; n: number }>()
  const tags = results ?? []

  const res = await c.html(
    await theme.render(
      { site: info, title: `标签 · ${info.name}`, tokens: theme.tokens, path: '/tags' },
      <div>
        <h1 class="page-title">标签</h1>
        {tags.length === 0 && <p style={{ color: '#888' }}>还没有标签。</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          {tags.map((t) => (
            <a
              href={`/tag/${t.slug}`}
              style={{
                padding: '.3rem .85rem',
                border: '1px solid #e8e8ec',
                borderRadius: '999px',
                fontSize: '.9rem',
                background: '#ffffff88',
              }}
            >
              {t.name}
              <span style={{ color: '#999', fontSize: '.78rem', marginLeft: '.3rem' }}>{t.n}</span>
            </a>
          ))}
        </div>
      </div>,
    ),
  )
  await putCached(c.env, '/tags', res, c.req.url)
  return res
})

publicSite.get('/tag/:slug', async (c) => {
  const tagSlug = c.req.param('slug')
  const path = `/tag/${tagSlug}`
  const cached = await getCached(c.env, path, c.req.url)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const tag = await c.env.DB.prepare('SELECT name FROM blog_tags WHERE slug = ?').bind(tagSlug).first<{ name: string }>()
  if (!tag) {
    return c.html(await theme.render({ site: info, title: '404', tokens: theme.tokens, path }, <p>标签不存在。</p>), 404)
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
      { site: info, title: `标签「${tag.name}」 · ${info.name}`, tokens: theme.tokens, path },
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
  await putCached(c.env, path, res, c.req.url)
  return res
})

// ---------------------------------------------------------------- 独立页面

publicSite.get('/page/:slug', async (c) => {
  const pageSlug = c.req.param('slug')
  const path = `/page/${pageSlug}`
  const cached = await getCached(c.env, path, c.req.url)
  if (cached) return cached

  const info = await siteInfo(c.env.DB)
  const theme = await resolveTheme(c.env.DB)
  const row = await c.env.DB.prepare('SELECT title, content_md FROM blog_pages WHERE slug = ?').bind(pageSlug).first<{
    title: string
    content_md: string
  }>()
  if (!row) {
    return c.html(await theme.render({ site: info, title: '404', tokens: theme.tokens, path }, <p>页面不存在。</p>), 404)
  }

  const rendered = renderMarkdown(row.content_md)
  const res = await c.html(
    await theme.render(
      { site: info, title: `${row.title} · ${info.name}`, tokens: theme.tokens, path },
      <article>
        <h1>{row.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </article>,
    ),
  )
  await putCached(c.env, path, res, c.req.url)
  return res
})

// ---------------------------------------------------------------- RSS / sitemap

const RSS_HEADERS = { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' }

publicSite.get('/rss.xml', async (c) => {
  const info = await siteInfo(c.env.DB)
  const base = publicOrigin(c.env, c.req.url).replace(/\/$/, '') + '/'
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
  const base = publicOrigin(c.env, c.req.url).replace(/\/$/, '') + '/'
  const { results } = await c.env.DB.prepare("SELECT slug, updated_at FROM blog_posts WHERE status = 'published'").all<{
    slug: string
    updated_at: number
  }>()
  const { results: pages } = await c.env.DB.prepare('SELECT slug, updated_at FROM blog_pages').all<{
    slug: string
    updated_at: number
  }>()
  const urls = ['/', '/archive', '/tags', ...((results ?? []).map((p) => `/post/${p.slug}`)), ...((pages ?? []).map((p) => `/page/${p.slug}`))]
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${base}${u.replace(/^\//, '')}</loc></url>`).join('') +
    `</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } })
})
