/**
 * wrangler.jsonc 的 assets.directory 指向 public/（admin 构建产物在其中），
 * 但 public/ 被 gitignore —— 新克隆的机器上不存在，wrangler dev 会拒绝启动。
 * 开发时前端走 vite(5174)，wrangler 只需目录存在；npm run build 后是真实产物。
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'

mkdirSync('public/admin', { recursive: true })
if (!existsSync('public/admin/index.html')) {
  writeFileSync(
    'public/admin/index.html',
    '<!-- 开发占位：admin 请访问 vite dev 端口；npm run build 后此处为真实产物 -->',
  )
}
