import { chromium } from 'playwright'

/** 截图博客关键页面，输出到 /tmp/mb-shots/ */
const pages = [
  { url: '/', name: '01-home' },
  { url: '/post/标签测试文', name: '02-post' },
  { url: '/archive', name: '03-archive' },
  { url: '/tags', name: '04-tags' },
  { url: '/page/about', name: '05-about' },
  { url: '/admin/login', name: '06-admin-login' },
]

// 移动端视口（公开站导航换行 / Admin 底部导航）
const mobilePages = [
  { url: '/', name: 'm1-home' },
  { url: '/post/标签测试文', name: 'm2-post' },
  { url: '/admin/login', name: 'm3-admin-login' },
]

import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/mb-shots', { recursive: true })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()

for (const p of pages) {
  await page.goto(`http://127.0.0.1:8787${p.url}`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `/tmp/mb-shots/${p.name}.png`, fullPage: false })
  console.log(`✓ ${p.name}`)
}

// Admin 暗色模式（验证 theme.js 首帧应用 + 暗色 token）
await page.addInitScript(() => localStorage.setItem('mb.theme', 'dark'))
await page.goto('http://127.0.0.1:8787/admin/login', { waitUntil: 'networkidle' })
await page.screenshot({ path: '/tmp/mb-shots/07-admin-login-dark.png' })
console.log('✓ 07-admin-login-dark')

// 移动端
const mobile = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
for (const p of mobilePages) {
  await mobile.goto(`http://127.0.0.1:8787${p.url}`, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: `/tmp/mb-shots/${p.name}.png`, fullPage: false })
  console.log(`✓ ${p.name}`)
}

await browser.close()
console.log('done')
