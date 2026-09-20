/**
 * 从 admin/public/favicon.svg 生成 PWA PNG 图标（192/512/180 apple-touch-icon）。
 * 用 Playwright（devDependency）以无头 Chromium 光栅化 SVG——几何与 Logo 严格同源。
 * 运行：node scripts/gen-icons.mjs，产物写入 admin/public/（提交进 git，CI 无需运行）。
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SVG = resolve(HERE, '../admin/public/favicon.svg')
const OUT = resolve(HERE, '../admin/public')

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ deviceScaleFactor: 1 })
const page = await context.newPage()

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await page.setViewportSize({ width: size, height: size })
  await page.goto(`file://${SVG}`)
  // omitBackground：保留圆角方块外的透明区域
  await page.screenshot({
    path: resolve(OUT, name),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  console.log(`✓ admin/public/${name} (${size}x${size})`)
}

await browser.close()
