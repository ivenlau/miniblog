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

/**
 * 清除公开页缓存。站点级变更（设置/主题/插件）会连带清所有文章页——
 * 否则插件开关、主题换色后文章页仍命中旧 HTML。
 */
export async function purgeBlogCache(
  env: Env,
  opts: { slug?: string; tagSlugs?: string[]; pageSlug?: string } = {},
): Promise<void> {
  const paths = ['/', '/archive', '/tags', '/rss.xml', '/sitemap.xml']
  if (opts.slug) paths.push(`/post/${opts.slug}`)
  for (const t of opts.tagSlugs ?? []) paths.push(`/tag/${t}`)
  if (opts.pageSlug) paths.push(`/page/${opts.pageSlug}`)
  const { results } = await env.DB.prepare("SELECT slug FROM blog_posts WHERE status = 'published'").all<{
    slug: string
  }>()
  for (const r of results ?? []) paths.push(`/post/${r.slug}`)
  await Promise.all(paths.map((p) => caches.default.delete(key(env, p))))
}
