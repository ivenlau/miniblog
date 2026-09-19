import MarkdownIt from 'markdown-it'

/**
 * Markdown 渲染管线（服务端）：
 * - html: true —— 单作者可信内容，允许内嵌 HTML（与静态站点生成器语义一致）
 * - 标题自动 slug + TOC 提取；阅读时长估算
 */

export type TocItem = { id: string; text: string; level: number }
export type RenderedPost = { html: string; toc: TocItem[]; readingMinutes: number; excerpt: string }

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

// 外链默认新窗口
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  const href = String(token.attrGet('href') ?? '')
  if (/^https?:\/\//.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noreferrer noopener')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// TOC 收集器：规则常驻，渲染时挂载收集目标
let activeToc: TocItem[] | null = null
let activeUsed: Map<string, number> | null = null

function slugify(text: string): string {
  const used = activeUsed ?? new Map<string, number>()
  let base = text
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 's'
  const n = (used.get(base) ?? 0) + 1
  used.set(base, n)
  return n > 1 ? `${base}-${n}` : base
}

md.core.ruler.push('mb_toc', (state) => {
  if (!activeToc || !activeUsed) return
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    if (!open || open.type !== 'heading_open') continue
    const level = Number(open.tag.slice(1))
    const inline = tokens[i + 1]
    const text = (inline?.content ?? '').trim()
    if (!text) continue
    const id = slugify(text)
    open.attrSet('id', id)
    if (level >= 2 && level <= 3) activeToc.push({ id, text, level })
  }
})

function countReadingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ')
  const cjk = (text.match(/[一-龥]/g) ?? []).length
  const latin = (text.match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil((cjk + latin) / 400))
}

export function renderMarkdown(source: string): RenderedPost {
  const toc: TocItem[] = []
  activeToc = toc
  activeUsed = new Map()
  const html = md.render(source)
  activeToc = null
  activeUsed = null

  const textOnly = html.replace(/<[^>]+>/g, ' ')
  const readingMinutes = countReadingMinutes(html)
  const excerpt = textOnly.replace(/\s+/g, ' ').trim().slice(0, 160)
  return { html, toc, readingMinutes, excerpt }
}

/** 由标题推导 slug；纯 CJK 标题退化为短随机 */
export function slugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length >= 3) return ascii.slice(0, 64)
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `p-${rand}`
}
