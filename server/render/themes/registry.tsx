/** 站点信息（Admin 站点设置） */
export type SiteInfo = { name: string; description: string; footer: string }

/** 主题 Design Tokens（用户可在 Admin 覆盖） */
export type ThemeTokens = { accent: string; radius: number; width: number; font: 'sans' | 'serif' }
export type ThemeContext = {
  site: SiteInfo
  title: string
  tokens: ThemeTokens
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

const BASE_CSS = (t: ThemeTokens, extra: string) => `
:root{--mb-accent:${t.accent};--mb-radius:${t.radius}px;--mb-width:${t.width}rem}
*{box-sizing:border-box}
body{margin:0;background:#f7f7f9;color:#1b1c1f;line-height:1.75;
  font-family:${t.font === 'serif' ? SERIF : SANS}}
a{color:inherit;text-decoration:none}a:hover{color:var(--mb-accent)}
header.site{border-bottom:1px solid #e8e8ec;background:#ffffffcc;backdrop-filter:blur(8px);position:sticky;top:0;z-index:10}
header.site .inner{max-width:var(--mb-width);margin:0 auto;padding:.9rem 1.25rem;display:flex;align-items:baseline;gap:1rem}
header.site .desc{color:#777;font-size:.85rem;margin:0}
main{max-width:var(--mb-width);margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1,h2,h3{line-height:1.35}
footer.site{max-width:var(--mb-width);margin:2rem auto 0;padding:1.25rem;color:#888;font-size:.85rem;border-top:1px solid #e8e8ec}
.post{margin-bottom:2.75rem}.post h2{margin:0 0 .3rem;font-size:1.3rem}
.meta{color:#888;font-size:.85rem}
.page-title{font-size:1.5rem;margin:0 0 1.5rem}
article h1{font-size:1.85rem;margin:.2rem 0 1rem}
article img{max-width:100%;border-radius:var(--mb-radius)}
article pre{overflow-x:auto;padding:1rem;background:#1d212b;color:#e7e9ee;border-radius:var(--mb-radius);font-size:.9rem}
article code{background:#ececf1;padding:.1em .35em;border-radius:6px;font-size:.92em}
article pre code{background:none;padding:0}
article blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:3px solid var(--mb-accent);color:#555}
.toc{background:#fff;border:1px solid #e8e8ec;border-radius:var(--mb-radius);padding:1rem;margin:1.5rem 0}
.toc a{display:block;padding:.15rem 0;font-size:.9rem}${extra}
`

async function shell(ctx: ThemeContext, extraCss: string, bodyCls: string, body: unknown): Promise<unknown> {
  const { site, title, tokens } = ctx
  const year = new Date().getFullYear()
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{BASE_CSS(tokens, extraCss)}</style>
        {ctx.headHtml ? <div dangerouslySetInnerHTML={{ __html: ctx.headHtml }} /> : null}
      </head>
      <body class={bodyCls}>
        <header class="site">
          <div class="inner">
            <a href="/" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {site.name}
            </a>
            {site.description && <p class="desc">{site.description}</p>}
          </div>
        </header>
        <main>{body}</main>
        <footer class="site">
          {site.footer || `© ${year} ${site.name}`}
          {ctx.footerHtml ? <div dangerouslySetInnerHTML={{ __html: ctx.footerHtml }} /> : null}
        </footer>
      </body>
    </html>
  )
}

/** 极简杂志：单栏大标题，强调内容 */
const magazine: BuiltinTheme = {
  id: 'magazine',
  name: '极简杂志',
  defaultTokens: { accent: '#5b5bd6', radius: 12, width: 46, font: 'sans' },
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
  defaultTokens: { accent: '#8a6d3b', radius: 6, width: 42, font: 'serif' },
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
  defaultTokens: { accent: '#0e7490', radius: 16, width: 60, font: 'sans' },
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
