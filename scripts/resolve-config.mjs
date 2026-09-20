/** 部署前把真实 D1 database_id / R2 桶名注入 wrangler.jsonc（构建环境内，不落 git） */
import { readFileSync, writeFileSync } from 'node:fs'

const CONFIG = 'wrangler.jsonc'
const src = readFileSync(CONFIG, 'utf8')
let out = src

const dbId = process.env.D1_DATABASE_ID?.trim()
if (!dbId) {
  console.log('[resolve-config] D1_DATABASE_ID 未设置，保持原样（本地开发无需真实 ID）')
} else if (!/^[0-9a-f-]{36}$/i.test(dbId)) {
  console.error('[resolve-config] D1_DATABASE_ID 不是合法 UUID')
  process.exit(1)
} else {
  out = out.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${dbId}$2`)
  console.log('[resolve-config] 已注入真实 D1 database_id')
}

const bucket = process.env.R2_BUCKET_NAME?.trim()
if (!bucket) {
  console.log('[resolve-config] R2_BUCKET_NAME 未设置，保持原样（本地开发无需真实桶名）')
} else if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  console.error('[resolve-config] R2_BUCKET_NAME 不是合法桶名')
  process.exit(1)
} else {
  out = out.replace(/("bucket_name"\s*:\s*")[^"]*(")/, `$1${bucket}$2`)
  console.log('[resolve-config] 已注入真实 R2 桶名')
}

writeFileSync(CONFIG, out)
