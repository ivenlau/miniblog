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
    // 浮动展开/收起组件：左下角按钮 + 面板（移动端/桌面端一致），滚动时高亮当前小节，
    // 不占用文章版面；深色主题（gallery）自动适配
    render: (ctx) => {
      const items = ctx.post.rendered.toc
      if (items.length === 0) return ''
      const links = items
        .map(
          (t) =>
            `<a href="#${escAttr(t.id)}" style="padding-left:${(t.level - 2) * 0.8 + 0.5}rem">${escHtml(t.text)}</a>`,
        )
        .join('')
      return `<button type="button" id="mb-toc-btn" aria-label="目录" aria-expanded="false"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg></button><div id="mb-toc-bd"></div><nav id="mb-toc" class="mb-toc-panel" aria-label="目录"><div class="mb-toc-h"><span>目录</span><button type="button" id="mb-toc-x" aria-label="关闭">×</button></div>${links}</nav><style>html{scroll-behavior:smooth}
#mb-toc-btn{position:fixed;left:1.25rem;bottom:1.25rem;z-index:60;width:2.6rem;height:2.6rem;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7ec;border-radius:50%;background:#fff;color:#555;cursor:pointer;box-shadow:0 4px 16px rgb(0 0 0/.14);transition:transform .15s ease,color .15s ease}
#mb-toc-btn:hover{color:var(--mb-accent);transform:scale(1.05)}
#mb-toc-bd{position:fixed;inset:0;z-index:59;display:none}
#mb-toc-bd.on{display:block}
.mb-toc-panel{position:fixed;left:1.1rem;bottom:4.4rem;z-index:61;width:min(19rem,calc(100vw - 2.2rem));max-height:min(62vh,26rem);overflow-y:auto;background:#fff;border:1px solid #e5e7ec;border-radius:14px;box-shadow:0 10px 34px rgb(16 24 40/.18);padding:.55rem;opacity:0;pointer-events:none;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease}
.mb-toc-panel.on{opacity:1;pointer-events:auto;transform:none}
.mb-toc-h{display:flex;align-items:center;justify-content:space-between;padding:.15rem .5rem .4rem;border-bottom:1px solid #f0f1f4;margin-bottom:.3rem}
.mb-toc-h span{font-size:.8rem;font-weight:600;color:#888}
#mb-toc-x{border:none;background:none;font-size:1.05rem;line-height:1;color:#aaa;cursor:pointer;padding:.15rem .3rem;border-radius:6px}
#mb-toc-x:hover{color:#555;background:#f1f3f6}
.mb-toc-panel a{display:block;padding:.34rem .55rem;border-radius:8px;color:#4b5563;font-size:.87rem;line-height:1.45;text-decoration:none}
.mb-toc-panel a:hover{background:#f1f3f6;color:var(--mb-accent)}
.mb-toc-panel a.cur{color:var(--mb-accent);font-weight:600;background:rgba(0,0,0,.045)}
body.theme-gallery #mb-toc-btn{background:#181d22;border-color:#2a313a;color:#c8cdd6}
body.theme-gallery .mb-toc-panel{background:#181d22;border-color:#2a313a}
body.theme-gallery .mb-toc-h{border-bottom-color:#232a31}
body.theme-gallery .mb-toc-h span{color:#8b93a3}
body.theme-gallery #mb-toc-x:hover{color:#c8cdd6;background:#232a31}
body.theme-gallery .mb-toc-panel a{color:#b9c0ca}
body.theme-gallery .mb-toc-panel a:hover{background:#232a31;color:var(--mb-accent)}
body.theme-gallery .mb-toc-panel a.cur{color:var(--mb-accent);background:#232a31}
</style><script>(function(){var p=document.getElementById('mb-toc'),b=document.getElementById('mb-toc-btn'),x=document.getElementById('mb-toc-x'),bd=document.getElementById('mb-toc-bd');if(!p||!b)return;var set=function(on){p.classList.toggle('on',on);bd.classList.toggle('on',on);b.setAttribute('aria-expanded',on?'true':'false')};var on=function(){return p.classList.contains('on')};b.addEventListener('click',function(){set(!on())});x&&x.addEventListener('click',function(){set(false)});bd.addEventListener('click',function(){set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});p.addEventListener('click',function(e){var t=e.target;if(t&&t.tagName==='A')set(false)});var ls=[].slice.call(p.querySelectorAll('a'));var hs=ls.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))}).filter(Boolean);if('IntersectionObserver' in window&&hs.length){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){ls.forEach(function(l){l.classList.toggle('cur',l.getAttribute('href')==='#'+en.target.id)})}})},{rootMargin:'-12% 0px -78% 0px'});hs.forEach(function(h){io.observe(h)})}})()</script>`
    },
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
