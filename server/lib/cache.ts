import type { Env } from './env'

/** 公开页缓存（Cache API）：键为 APP_PUBLIC_URL 下的完整 URL */

function key(env: Env, path: string): string {
  return new URL(path, env.APP_PUBLIC_URL).toString()
}

export async function getCached(env: Env, path: string): Promise<Response | undefined> {
  return caches.default.match(key(env, path))
}

export async function putCached(env: Env, path: string, res: Response): Promise<void> {
  await caches.default.put(key(env, path), res.clone())
}

/** 清除首页/归档/订阅与指定文章、标签页的缓存 */
export async function purgeBlogCache(env: Env, opts: { slug?: string; tagSlug?: string } = {}): Promise<void> {
  const paths = ['/', '/archive', '/rss.xml', '/sitemap.xml']
  if (opts.slug) paths.push(`/post/${opts.slug}`)
  if (opts.tagSlug) paths.push(`/tag/${opts.tagSlug}`)
  await Promise.all(paths.map((p) => caches.default.delete(key(env, p))))
}
