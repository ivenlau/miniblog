/** 部署前把真实 D1 database_id 注入 wrangler.jsonc（构建环境内，不落 git） */
import { readFileSync, writeFileSync } from 'node:fs'

const CONFIG = 'wrangler.jsonc'
const id = process.env.D1_DATABASE_ID?.trim()

if (!id) {
  console.log('[resolve-config] D1_DATABASE_ID 未设置，保持原样（本地开发无需真实 ID）')
  process.exit(0)
}
if (!/^[0-9a-f-]{36}$/i.test(id)) {
  console.error('[resolve-config] D1_DATABASE_ID 不是合法 UUID')
  process.exit(1)
}
const src = readFileSync(CONFIG, 'utf8')
if (!/"database_id"\s*:\s*"/.test(src)) {
  console.error('[resolve-config] 找不到 database_id 字段')
  process.exit(1)
}
writeFileSync(CONFIG, src.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${id}$2`))
console.log('[resolve-config] 已注入真实 D1 database_id')
