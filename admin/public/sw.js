/* Miniblog Service Worker：写作后台 PWA 安装的最小实现 + 静态资源离线缓存。
 * 作用域 /admin/：公开站页面与素材直链 /assets/<slug> 不经 SW（保持其缓存头语义）。 */
const VERSION = 'v1'
const SHELL_CACHE = `mb-shell-${VERSION}`
const ASSET_CACHE = `mb-assets-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add('/admin/index.html'))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k.startsWith('mb-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // 只处理同源 GET；API 与素材内容永不缓存
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return

  // 页面导航：网络优先，离线回退缓存的 index.html（SPA）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(event.request)
          const cache = await caches.open(SHELL_CACHE)
          cache.put('/admin/index.html', res.clone())
          return res
        } catch {
          const cached = (await caches.match('/admin/index.html')) || (await caches.match(event.request))
          return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        }
      })(),
    )
    return
  }

  // 带内容哈希的构建产物：不可变，缓存优先
  if (url.pathname.startsWith('/admin/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        const res = await fetch(event.request)
        if (res.ok) {
          const cache = await caches.open(ASSET_CACHE)
          cache.put(event.request, res.clone())
        }
        return res
      })(),
    )
    return
  }

  // 其余静态文件（sw 同级图标 / manifest / theme.js）：网络优先，失败回退缓存
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request)
        if (res.ok) {
          const cache = await caches.open(ASSET_CACHE)
          cache.put(event.request, res.clone())
        }
        return res
      } catch {
        const cached = await caches.match(event.request)
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })(),
  )
})
