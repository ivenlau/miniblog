import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * 截图博客关键页面，输出到 /tmp/mb-shots/。
 * 前提：wrangler dev 运行中 + 全新库（脚本会走完整的 setup UI 流程，
 * 用 CDP 虚拟认证器完成 Passkey 注册/登录）。
 */
const BASE = 'http://localhost:8787' // WebAuthn 绑定 origin，必须与 APP_PUBLIC_URL 同 host
mkdirSync('/tmp/mb-shots', { recursive: true })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

const page = await context.newPage()
// CDP 虚拟认证器（支持 resident key + 自动通过用户验证）。
// 注意：authenticator 绑定在创建它的 page 上，必须挂在真正执行 WebAuthn 的页面。
const cdp = await context.newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
})

// ---- Setup（全新库）----
await page.goto(`${BASE}/admin/setup`, { waitUntil: 'networkidle' })
await page.locator('input[type="password"]').first().fill('dev-setup-token')
await page.locator('button[type="submit"]').click()
// 等待恢复码页出现（等导航+动画）
await page.waitForSelector('div.font-mono span', { timeout: 20000 })
const codes = await page.$$eval('div.font-mono span', (els) => els.map((e) => e.textContent ?? ''))
console.log(`✓ setup 完成，恢复码 ${codes.length} 个`)
await page.screenshot({ path: '/tmp/mb-shots/00-setup-recovery.png' })
await page.getByRole('button', { name: /完成|Done/ }).click()
await page.waitForURL('**/admin/', { timeout: 15000 }).catch(() => {})

// ---- 准备一篇已发布文章 + 关于页 + 自定义导航（走 API，共享 context 会话）----
const H = { 'x-miniblog': '1', 'content-type': 'application/json' }
const pub = await context.request.post(`${BASE}/api/posts`, {
  headers: H,
  data: {
    title: '你好 Miniblog',
    slug: 'hello-miniblog',
    summary: '第一篇文章',
    contentMd:
      '# 你好\n\n这是**第一篇**文章，这里有一个[示例链接](https://example.com)。\n\n## 小标题\n\n- 列表项一\n- 列表项二\n\n> 引用\n\n```js\nconsole.log(1)\n```\n\n$$E=mc^2$$',
    tags: ['随笔'],
  },
})
if (pub.status() === 201) {
  const { id } = await pub.json()
  await context.request.post(`${BASE}/api/posts/${id}/publish`, { headers: { 'x-miniblog': '1' } })
  console.log('✓ 测试文章已发布')
}
await context.request.put(`${BASE}/api/pages/about`, {
  headers: H,
  data: {
    title: '关于本站',
    contentMd:
      '# 关于本站\n\n这是**关于页**，支持 [链接](https://example.com) 与列表：\n\n- 第一条\n- 第二条\n\n> 引用一句',
  },
})
await context.request.put(`${BASE}/api/settings`, {
  headers: H,
  data: {
    site: {
      name: '我的小站',
      description: '一个跑在 Workers 上的博客',
      footer: '',
      nav: [
        { label: '首页', href: '/' },
        { label: '归档', href: '/archive' },
        { label: '标签', href: '/tags' },
        { label: '关于', href: '/page/about' },
        { label: 'GitHub', href: 'https://github.com' },
      ],
    },
  },
})
console.log('✓ 关于页 + 自定义导航已配置')

const shots = async (list) => {
  for (const { url, name, full } of list) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/mb-shots/${name}.png`, fullPage: !!full })
    console.log(`✓ ${name}`)
  }
}

// ---- Admin（亮色）----
await shots([
  { url: '/admin/', name: '01-admin-dashboard' },
  { url: '/admin/posts', name: '02-admin-posts' },
  { url: '/admin/posts/new', name: '03-admin-editor' },
  { url: '/admin/blog', name: '04-admin-blog' },
  { url: '/admin/theme', name: '05-admin-theme' },
  { url: '/admin/plugins', name: '06-admin-plugins' },
  { url: '/admin/settings', name: '07-admin-security' },
])

// ---- Admin 暗色（主题页 + 编辑器）----
await page.addInitScript(() => localStorage.setItem('mb.theme', 'dark'))
await shots([
  { url: '/admin/theme', name: '08-admin-theme-dark' },
  { url: '/admin/posts/new', name: '09-admin-editor-dark' },
])
await page.addInitScript(() => localStorage.removeItem('mb.theme'))

// ---- 公开站（桌面 + 移动）----
await shots([
  { url: '/', name: '10-home' },
  { url: '/post/hello-miniblog', name: '11-post' },
  { url: '/tags', name: '12-tags' },
  { url: '/archive', name: '13-archive' },
  { url: '/page/about', name: '14-about' },
])

// 长页面滚动后「回顶部」按钮出现
await page.goto(`${BASE}/post/hello-miniblog`, { waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/mb-shots/15-post-scrolled.png' })
console.log('✓ 15-post-scrolled')

const mobile = await context.newPage()
await mobile.setViewportSize({ width: 375, height: 812 })
for (const { url, name } of [
  { url: '/admin/', name: 'm1-admin-dashboard' },
  { url: '/admin/theme', name: 'm2-admin-theme' },
  { url: '/', name: 'm3-home' },
  { url: '/post/hello-miniblog', name: 'm4-post' },
]) {
  await mobile.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(300)
  await mobile.screenshot({ path: `/tmp/mb-shots/${name}.png` })
  console.log(`✓ ${name}`)
}

await browser.close()
console.log('done')
