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
    id: 'lightbox',
    name: '图片灯箱',
    mount: 'head',
    render: () => `<style>.mb-lightbox{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.88);cursor:zoom-out}.mb-lightbox img{max-width:92vw;max-height:92vh;border-radius:6px}.mb-lightbox.on{display:flex}</style><script>(function(){var d=document.createElement('div');d.className='mb-lightbox';d.innerHTML='<img alt="">';document.addEventListener('DOMContentLoaded',function(){document.body.appendChild(d);var im=d.querySelector('img');document.addEventListener('click',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&!d.contains(t)&&t.closest('article,.post')){im.src=t.currentSrc||t.src;d.classList.add('on')}else if(d.classList.contains('on')){d.classList.remove('on');im.src=''}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){d.classList.remove('on');im.src=''}})})})()</script>`,
  },
  {
    id: 'katex',
    name: '数学公式',
    mount: 'head',
    render: (ctx) => {
      // 允许自建/镜像 CDN；默认 jsdelivr。仅渲染 $$…$$ 与 \(…\)/\[…\]，避免单个 $ 误判
      const cdn = ((ctx.config?.cdn as string) || 'https://cdn.jsdelivr.net/npm/katex@0.16.22').replace(/\/$/, '')
      if (!/^https?:\/\//.test(cdn)) return ''
      return `<link rel="stylesheet" href="${escAttr(cdn)}/katex.min.css"><script defer src="${escAttr(cdn)}/katex.min.js"></script><script defer src="${escAttr(cdn)}/contrib/auto-render.min.js"></script><script>window.addEventListener('DOMContentLoaded',function(){function go(){if(!window.renderMathInElement)return;window.renderMathInElement(document.querySelector('article,main')||document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}],throwOnError:false})}window.katex?go():document.querySelector('script[src$="katex.min.js"]')?.addEventListener('load',go)})</script>`
    },
  },
  {
    id: 'footer-links',
    name: '页脚链接',
    mount: 'footer',
    render: (ctx) => {
      // 配置格式：`名称|https://链接;名称2|https://链接2`（分号分隔项，竖线分隔名称与链接）
      const raw = (ctx.config?.links as string) ?? ''
      const items = raw
        .split(/[;；]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const idx = item.indexOf('|')
          if (idx <= 0) return null
          const label = item.slice(0, idx).trim()
          const href = item.slice(idx + 1).trim()
          if (!label || !(/^(https?:\/\/|\/)/.test(href))) return null
          return { label, href }
        })
        .filter((x): x is { label: string; href: string } => !!x)
        .slice(0, 10)
      if (items.length === 0) return ''
      return `<nav class="mb-footer-links">${items
        .map((i) => `<a href="${escAttr(i.href)}"${i.href.startsWith('/') ? '' : ' target="_blank" rel="noreferrer noopener"'}>${escHtml(i.label)}</a>`)
        .join('<span class="mb-fl-sep">·</span>')}</nav><style>.mb-footer-links{margin-top:.5rem;display:flex;flex-wrap:wrap;gap:.35rem .75rem;align-items:center}.mb-footer-links a{color:inherit;text-decoration:none}.mb-footer-links a:hover{color:var(--mb-accent)}.mb-fl-sep{opacity:.5}</style>`
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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
