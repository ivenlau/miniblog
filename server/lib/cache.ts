import type { Env } from './env'

import { publicOrigin } from './env'

/** 公开页缓存（Cache API）：键为规范来源（APP_PUBLIC_URL 或请求来源）下的完整 URL */

function key(env: Env, path: string, requestUrl: string): string {
  return new URL(path, publicOrigin(env, requestUrl)).toString()
}

export async function getCached(env: Env, path: string, requestUrl: string): Promise<Response | undefined> {
  return caches.default.match(key(env, path, requestUrl))
}

export async function putCached(env: Env, path: string, res: Response, requestUrl: string): Promise<void> {
  await caches.default.put(key(env, path, requestUrl), res.clone())
}

/**
 * 清除公开页缓存。站点级变更（设置/主题/插件）会连带清所有文章页——
 * 否则插件开关、主题换色后文章页仍命中旧 HTML。
 */
export async function purgeBlogCache(
  env: Env,
  opts: { slug?: string; tagSlugs?: string[]; pageSlug?: string } = {},
  requestUrl: string,
): Promise<void> {
  const paths = ['/', '/archive', '/tags', '/rss.xml', '/sitemap.xml']
  // 首页分页键（/?page=N，与无限滚动片段共用清除；个人规模 50 页封顶）
  for (let n = 2; n <= 50; n++) paths.push(`/?page=${n}`)
  if (opts.slug) paths.push(`/post/${opts.slug}`)
  for (const t of opts.tagSlugs ?? []) paths.push(`/tag/${t}`)
  if (opts.pageSlug) paths.push(`/page/${opts.pageSlug}`)
  const { results } = await env.DB.prepare("SELECT slug FROM blog_posts WHERE status = 'published'").all<{
    slug: string
  }>()
  for (const r of results ?? []) paths.push(`/post/${r.slug}`)
  await Promise.all(paths.map((p) => caches.default.delete(key(env, p, requestUrl))))
}
