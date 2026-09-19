import type { RenderedPost } from '../render/markdown'

/**
 * 声明式插件池：内置实现 + JSON 配置，按 blog_settings.plugins 顺序渲染。
 * 挂载点：head（额外资源）、post_meta（元信息条）、post_html（正文后处理）、footer。
 */

export type PluginConfig = { id: string; enabled: boolean; config?: Record<string, unknown> }

export type RenderCtx = {
  post: { title: string; contentMd: string; rendered: RenderedPost }
  config?: Record<string, unknown>
}

export type PluginDef = {
  id: string
  name: string
  mount: 'head' | 'post_meta' | 'post_html' | 'footer'
  /** 追加到挂载点的 HTML 片段（转义后的可信内置输出） */
  render?: (ctx: RenderCtx) => string
}

export const PLUGIN_DEFS: PluginDef[] = [
  {
    id: 'reading-time',
    name: '阅读时长',
    mount: 'post_meta',
    render: (ctx) => `<span>· 约 ${ctx.post.rendered.readingMinutes} 分钟</span>`,
  },
  {
    id: 'toc',
    name: '目录',
    mount: 'post_html',
    render: (ctx) =>
      ctx.post.rendered.toc.length > 0
        ? `<nav class="mb-toc-plugin"><h3>目录</h3>${ctx.post.rendered.toc
            .map((t) => `<a href="#${t.id}" style="padding-left:${(t.level - 2) * 1}rem">${t.text}</a>`)
            .join('')}</nav><style>.mb-toc-plugin{background:#fff;border:1px solid #e8e8ec;border-radius:10px;padding:1rem;margin:1.5rem 0}.mb-toc-plugin h3{margin:0 0 .5rem;font-size:.95rem}.mb-toc-plugin a{display:block;color:inherit;text-decoration:none;font-size:.9rem;padding:.15rem 0}.mb-toc-plugin a:hover{color:var(--mb-accent)}</style>`
        : '',
  },
  {
    id: 'highlight',
    name: '代码高亮（客户端）',
    mount: 'head',
    render: (ctx) => {
      const theme = (ctx.config?.theme as string) ?? 'github-dark'
      return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/${theme}.min.css"><script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script><script>window.addEventListener('DOMContentLoaded',()=>window.hljs&&window.hljs.highlightAll())</script>`
    },
  },
  {
    id: 'giscus',
    name: 'giscus 评论',
    mount: 'footer',
    render: (ctx) => {
      const repo = (ctx.config?.repo as string) ?? ''
      if (!repo) return ''
      return `<script src="https://giscus.app/client.js" data-repo="${escAttr(repo)}" data-repo-id="${escAttr(
        (ctx.config?.repoId as string) ?? '',
      )}" data-category="${escAttr((ctx.config?.category as string) ?? 'Announcements')}" data-category-id="${escAttr(
        (ctx.config?.categoryId as string) ?? '',
      )}" data-mapping="pathname" data-loading="lazy" crossorigin="anonymous" async></script>`
    },
  },
]

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 生成挂载点的合并 HTML（按启用插件顺序） */
export function renderMount(mount: PluginDef['mount'], plugins: PluginConfig[], ctx: RenderCtx): string {
  return plugins
    .filter((p) => p.enabled)
    .map((p) => {
      const def = PLUGIN_DEFS.find((d) => d.id === p.id)
      if (!def || def.mount !== mount) return ''
      try {
        return def.render?.({ ...ctx, config: p.config }) ?? ''
      } catch {
        return ''
      }
    })
    .join('\n')
}
