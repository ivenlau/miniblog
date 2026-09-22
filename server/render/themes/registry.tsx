/** 公开站导航链接（site.nav；空 = 服务端按内容给默认值） */
export type NavItem = { label: string; href: string }

/** 站点信息（Admin 站点设置） */
export type SiteInfo = { name: string; description: string; footer: string; nav?: NavItem[] }

/** 主题 Design Tokens（用户可在 Admin 覆盖） */
export type ThemeTokens = { accent: string; radius: number; width: number; font: 'sans' | 'serif'; fontSize: number }
export type ThemeContext = {
  site: SiteInfo
  title: string
  tokens: ThemeTokens
  /** 当前路径（用于导航高亮） */
  path?: string
  /** 搜索页回填的关键词 */
  searchQ?: string
  /** 插件挂载点：head 额外资源（script/link） */
  headHtml?: string
  /** 插件挂载点：页脚附加内容 */
  footerHtml?: string
}
export type BuiltinTheme = {
  id: string
  name: string
  defaultTokens: ThemeTokens
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  render(ctx: ThemeContext, body: any): any
}

const SANS = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif"
const SERIF = "'Songti SC', Georgia, 'Noto Serif SC', serif"

/** 站点图标：圆角方块 + 笔与书写线（与 Admin Logo / favicon 同源） */
export const SITE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#5B5BD6"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(5.4 5.3) scale(0.585)"><path d="M12 20h9" opacity=".85"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></g></svg>'
const SITE_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(SITE_ICON_SVG)}`

/** 页头小图标（颜色跟随主题 accent） */
export function SiteIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }} aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--mb-accent)" />
      <g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(5.4 5.3) scale(0.585)">
        <path d="M12 20h9" opacity=".85" />
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
      </g>
    </svg>
  )
}

/** 「回顶部」浮动按钮（长页面滚动后出现；零依赖内联脚本） */
const BACK_TO_TOP_JS =
  '(function(){var b=document.getElementById("mb-top");if(!b)return;if(document.getElementById("mb-fav-btn"))b.classList.add("has-fav");var f=function(){b.classList.toggle("on",window.scrollY>320)};window.addEventListener("scroll",f,{passive:true});f();b.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"})})})()'

const BASE_CSS = (t: ThemeTokens, extra: string) => `
:root{--mb-accent:${t.accent};--mb-radius:${t.radius}px;--mb-width:${t.width}rem}
*{box-sizing:border-box}
body{margin:0;background:#f7f7f9;color:#1b1c1f;line-height:1.75;
  font-family:${t.font === 'serif' ? SERIF : SANS}}
a{color:inherit;text-decoration:none}a:hover{color:var(--mb-accent)}
header.site{border-bottom:1px solid #e8e8ec;background:#ffffffcc;backdrop-filter:blur(8px);position:sticky;top:0;z-index:10}
header.site .inner{max-width:var(--mb-width);margin:0 auto;padding:.9rem 1.25rem;display:flex;align-items:baseline;gap:.5rem 1.25rem;flex-wrap:wrap}
header.site .brand{display:flex;align-items:baseline;gap:.75rem;min-width:0}
header.site .desc{color:#777;font-size:.85rem;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
nav.site-nav{display:flex;gap:1rem;margin-left:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
nav.site-nav::-webkit-scrollbar{display:none}
nav.site-nav a{font-size:.9rem;color:#666;white-space:nowrap;padding:.15rem 0}
nav.site-nav a:hover,nav.site-nav a.active{color:var(--mb-accent)}
nav.site-nav a.active{font-weight:600}
form.site-search{margin-left:auto;display:flex;align-self:center}
form.site-search input{width:8.5rem;padding:.3rem .75rem;border:1px solid #dcdfe4;border-radius:999px;background:#fffffff2;font-size:.85rem;color:inherit;outline:none;transition:border-color .15s ease,width .2s ease}
form.site-search input:focus{border-color:var(--mb-accent);width:11rem}
form.site-search input::placeholder{color:#9aa1ab}
main{max-width:var(--mb-width);margin:0 auto;padding:2.5rem 1.25rem 4rem;font-size:${t.fontSize}px}
#mb-top{position:fixed;right:1.25rem;bottom:1.25rem;z-index:50;width:2.6rem;height:2.6rem;display:flex;align-items:center;justify-content:center;
  border:none;border-radius:50%;background:var(--mb-accent);color:#fff;cursor:pointer;box-shadow:0 4px 16px rgb(0 0 0/.22);
  opacity:0;pointer-events:none;transform:translateY(6px);transition:opacity .2s ease,transform .2s ease}
#mb-top.on{opacity:1;pointer-events:auto;transform:none}
#mb-top:hover{filter:brightness(1.08)}
/* 收藏插件占用右下角主位时，「回顶部」自动上移一层 */
#mb-top.has-fav{bottom:4.4rem}
h1,h2,h3{line-height:1.35}
footer.site{max-width:var(--mb-width);margin:2rem auto 0;padding:1.25rem;color:#888;font-size:.85rem;border-top:1px solid #e8e8ec}
@media (max-width:640px){
  header.site .desc{display:none}
  nav.site-nav{margin-left:0;width:100%;order:3;padding-bottom:.25rem}
  form.site-search{margin-left:0;width:100%;order:4;padding-bottom:.25rem}
  form.site-search input{width:100%}
  main{padding:1.5rem 1rem 3rem}
  article h1{font-size:1.5rem}
  .page-title{font-size:1.25rem}
}
.post{margin-bottom:2.75rem}.post h2{margin:0 0 .3rem;font-size:1.3rem}
.mb-pager{display:flex;justify-content:space-between;gap:1rem;margin-top:2.75rem}
.mb-pager a{color:var(--mb-accent);text-decoration:none;border:1px solid #e8e8ec;border-radius:999px;padding:.45rem 1rem;font-size:.9rem}
.mb-pager a:hover{border-color:var(--mb-accent)}
.meta{color:#888;font-size:.85rem}
.page-title{font-size:1.5rem;margin:0 0 1.5rem}
article h1{font-size:1.85rem;margin:.2rem 0 1rem}
article img{max-width:100%;border-radius:var(--mb-radius)}
img.post-hero{display:block;width:100%;border-radius:var(--mb-radius);margin:.3rem 0 1.1rem}
.post-cover-link{display:block;margin-bottom:.6rem}
.post-cover-link img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:calc(var(--mb-radius) - 4px)}
article a{color:var(--mb-accent);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
article a:hover{opacity:.75}
body.theme-gallery form.site-search input{background:#181d22;border-color:#2a313a;color:#e8ebee}
article pre{overflow-x:auto;padding:1rem;background:#1d212b;color:#e7e9ee;border-radius:var(--mb-radius);font-size:.9rem}
article code{background:#ececf1;padding:.1em .35em;border-radius:6px;font-size:.92em}
article pre code{background:none;padding:0}
article blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:3px solid var(--mb-accent);color:#555}
.toc{background:#fff;border:1px solid #e8e8ec;border-radius:var(--mb-radius);padding:1rem;margin:1.5rem 0}
.toc a{display:block;padding:.15rem 0;font-size:.9rem}${extra}
`

async function shell(ctx: ThemeContext, extraCss: string, bodyCls: string, body: unknown): Promise<unknown> {
  const { site, title, tokens, path } = ctx
  const year = new Date().getFullYear()
  const nav = site.nav ?? []
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href={SITE_ICON_DATA_URI} />
        <style>{BASE_CSS(tokens, extraCss)}</style>
        {ctx.headHtml ? <div dangerouslySetInnerHTML={{ __html: ctx.headHtml }} /> : null}
      </head>
      <body class={bodyCls}>
        <header class="site">
          <div class="inner">
            <div class="brand">
              <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontWeight: 700, fontSize: '1.05rem' }}>
                <SiteIcon size={22} />
                {site.name}
              </a>
              {site.description && <p class="desc">{site.description}</p>}
            </div>
            {nav.length > 0 && (
              <nav class="site-nav">
                {nav.map((n) => (
                  <a href={n.href} class={path === n.href ? 'active' : undefined} aria-current={path === n.href ? 'page' : undefined}>
                    {n.label}
                  </a>
                ))}
              </nav>
            )}
            <form class="site-search" action="/search" method="get" role="search">
              <input type="search" name="q" placeholder="搜索文章…" aria-label="搜索文章" maxLength={64} value={ctx.searchQ} />
            </form>
          </div>
        </header>
        <main>{body}</main>
        <footer class="site">
          {site.footer || `© ${year} ${site.name}`}
          {ctx.footerHtml ? <div dangerouslySetInnerHTML={{ __html: ctx.footerHtml }} /> : null}
        </footer>
        {/* 长页面滚动后出现的「回顶部」按钮 */}
        <button type="button" id="mb-top" aria-label="回到顶部">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        <script dangerouslySetInnerHTML={{ __html: BACK_TO_TOP_JS }} />
      </body>
    </html>
  )
}

/** 极简杂志：单栏大标题，强调内容 */
const magazine: BuiltinTheme = {
  id: 'magazine',
  name: '极简杂志',
  defaultTokens: { accent: '#5b5bd6', radius: 12, width: 46, font: 'sans', fontSize: 16 },
  async render(ctx, body) {
    return shell({ ...ctx, tokens: ctx.tokens }, `
.post .meta{margin:.3rem 0 .1rem}
h1,h2{letter-spacing:-.01em}`, 'theme-magazine', body)
  },
}

/** 经典两栏感：衬线正文，传统博客 */
const classic: BuiltinTheme = {
  id: 'classic',
  name: '经典博客',
  defaultTokens: { accent: '#8a6d3b', radius: 6, width: 42, font: 'serif', fontSize: 17 },
  async render(ctx, body) {
    return shell({ ...ctx, tokens: ctx.tokens }, `
body{background:#faf8f4}
header.site{background:#faf8f4ee}
.post h2{font-size:1.25rem}`, 'theme-classic', body)
  },
}

/** 相册式：首页封面卡片网格 */
const gallery: BuiltinTheme = {
  id: 'gallery',
  name: '相册封面',
  defaultTokens: { accent: '#0e7490', radius: 16, width: 60, font: 'sans', fontSize: 16 },
  async render(ctx, body) {
    return shell({ ...ctx, tokens: ctx.tokens }, `
body{background:#101418;color:#e8ebee}
header.site{background:#101418cc;border-bottom-color:#232a31}
footer.site{border-top-color:#232a31}
a,p,h1,h2,h3,.meta,.desc{color:#e8ebee}
a:hover{color:var(--mb-accent)}
.post{background:#181d22;border-radius:var(--mb-radius);padding:1.1rem 1.2rem}
.post img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:calc(var(--mb-radius) - 4px)}
.toc,article code{background:#181d22}
article pre{background:#0b0e11}`, 'theme-gallery', body)
  },
}

export const BUILTIN_THEMES: Record<string, BuiltinTheme> = {
  magazine,
  classic,
  gallery,
}

export function getBuiltinTheme(id: string): BuiltinTheme {
  return BUILTIN_THEMES[id] ?? magazine
}

export type ThemeConfig = { mode: 'builtin'; id: string; tokens: Partial<ThemeTokens> }

/** 解析最终 tokens：用户覆盖值合并进主题默认值 */
export function resolveTokens(theme: BuiltinTheme, userTokens: Partial<ThemeTokens> | undefined): ThemeTokens {
  return { ...theme.defaultTokens, ...userTokens }
}
