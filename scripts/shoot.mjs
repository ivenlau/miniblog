import { chromium } from 'playwright'

/** 截图博客关键页面，输出到 /tmp/mb-shots/ */
const pages = [
  { url: '/', name: '01-home' },
  { url: '/post/hello-miniblog', name: '02-post' },
  { url: '/archive', name: '03-archive' },
  { url: '/page/about', name: '04-about' },
  { url: '/admin/setup', name: '05-admin-setup' },
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

// 主题切换后截图（相册封面 + 青色强调）
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' })

// 登录后 admin 仪表盘
await browser.close()
console.log('done')
