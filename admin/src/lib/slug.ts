/**
 * slug 派生 —— 与服务端 server/render/markdown.ts 的 slugFromTitle 逐字对齐。
 * 保留中文（一-龥）；结果为空时用 p-<8 位随机> 兜底，保证公开链接可用。
 */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length >= 1) return slug.slice(0, 64)
  return `p-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}
