/**
 * Miniblog M0 冒烟测试：standalone 模式认证全链路。
 * 复用 minidriver 的伪造 WebAuthn 认证器方案（ES256 + 手写 CBOR）。
 * 运行：npm run smoke（需 wrangler dev + 本地迁移）
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787'
const SETUP_TOKEN = process.env.SMOKE_SETUP_TOKEN ?? readDevVars().SETUP_TOKEN ?? 'dev-setup-token'

// RP/Origin 解析：显式 env > .dev.vars 的 APP_PUBLIC_URL（standalone=本域）> BASE 同源
let RP_ID = process.env.SMOKE_RP_ID ?? new URL(BASE).hostname
let ORIGIN = process.env.SMOKE_ORIGIN ?? new URL(BASE).origin
{
  const dv = readDevVars()
  const configured = dv.APP_PUBLIC_URL && !dv.APP_PUBLIC_URL.includes('<')
  if (!process.env.SMOKE_RP_ID && configured) {
    RP_ID = new URL(dv.APP_PUBLIC_URL).hostname
    const allowed = (dv.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    ORIGIN = process.env.SMOKE_ORIGIN ?? allowed.find((o) => new URL(o).hostname === RP_ID) ?? dv.APP_PUBLIC_URL
  }
}

function readDevVars() {
  try {
    return Object.fromEntries(
      readFileSync('.dev.vars', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  } catch {
    return {}
  }
}

let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name} ${extra}`)
  }
}

// ---------------------------------------------------------------- Cookie jar

class Jar {
  cookies = new Map()
  absorb(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      if (/expires=Thu, 01 Jan 1970/i.test(line) || /max-age=0/i.test(line)) {
        this.cookies.delete(name)
      } else {
        this.cookies.set(name, pair.slice(eq + 1).trim())
      }
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  names() {
    return [...this.cookies.keys()]
  }
}
const jar = new Jar()

async function call(method, path, { body, raw, origin, csrfHeader = true, cookie = true } = {}) {
  const headers = {}
  if (method !== 'GET' && method !== 'HEAD') {
    if (csrfHeader) headers['x-miniblog'] = '1'
    if (origin) headers.origin = origin
    if (body !== undefined && !raw) headers['content-type'] = 'application/json'
  }
  if (cookie && jar.header()) headers.cookie = jar.header()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    signal: AbortSignal.timeout(15000),
    body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  jar.absorb(res)
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { res, json }
}

// ---------------------------------------------------------------- 伪造认证器

const subtle = crypto.subtle
function b64u(buf) {
  return Buffer.from(buf).toString('base64url')
}
function u8(buf) {
  return new Uint8Array(buf)
}
async function sha256(data) {
  return u8(await subtle.digest('SHA-256', data))
}
function cborHead(major, val) {
  if (val < 24) return new Uint8Array([(major << 5) | val])
  if (val < 256) return new Uint8Array([(major << 5) | 24, val])
  if (val < 65536) return new Uint8Array([(major << 5) | 25, val >> 8, val & 0xff])
  return new Uint8Array([(major << 5) | 26, val >>> 24, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff])
}
function concat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
function cborEncode(value) {
  if (typeof value === 'string') {
    const b = new TextEncoder().encode(value)
    return concat([cborHead(3, b.length), b])
  }
  if (typeof value === 'number') return value >= 0 ? cborHead(0, value) : cborHead(1, -value - 1)
  if (value instanceof Uint8Array) return concat([cborHead(2, value.length), value])
  if (Array.isArray(value)) return concat([cborHead(4, value.length), ...value.map(cborEncode)])
  const entries = Object.entries(value)
  return concat([
    cborHead(5, entries.length),
    ...entries.flatMap(([k, v]) => {
      const num = Number(k)
      return [Number.isFinite(num) && String(num) === k ? cborEncode(num) : cborEncode(k), cborEncode(v)]
    }),
  ])
}
function randomBytes(len) {
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, len)))
  return out
}
function rawToDer(raw) {
  const half = raw.length / 2
  const trim = (arr) => {
    let i = 0
    while (i < arr.length - 1 && arr[i] === 0) i++
    let v = arr.slice(i)
    if (v[0] & 0x80) v = new Uint8Array([0, ...v])
    return v
  }
  const r = trim(raw.slice(0, half))
  const s = trim(raw.slice(half))
  return new Uint8Array([0x30, r.length + s.length + 4, 0x02, r.length, ...r, 0x02, s.length, ...s])
}

class FakeAuthenticator {
  async makeCredential(rpId) {
    this.kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const pub = u8(await subtle.exportKey('raw', this.kp.publicKey))
    const coseKey = cborEncode({ 1: 2, 3: -7, '-1': 1, '-2': pub.slice(1, 33), '-3': pub.slice(33, 65) })
    this.credentialId = randomBytes(32)
    const authData = concat([
      await sha256(new TextEncoder().encode(rpId)),
      new Uint8Array([0x41]),
      new Uint8Array(4),
      new Uint8Array(16),
      new Uint8Array([0, this.credentialId.length]),
      this.credentialId,
      coseKey,
    ])
    return { fmt: 'none', attStmt: {}, authData }
  }
  async assert(rpId) {
    this.counter++
    const counterBytes = new Uint8Array(4)
    new DataView(counterBytes.buffer).setUint32(0, this.counter)
    return concat([await sha256(new TextEncoder().encode(rpId)), new Uint8Array([0x05]), counterBytes])
  }
  async sign(authData, clientDataJSON) {
    const clientHash = await sha256(new TextEncoder().encode(clientDataJSON))
    const sigRaw = u8(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.kp.privateKey, concat([authData, clientHash])))
    return rawToDer(sigRaw)
  }
}
const authr = new FakeAuthenticator()

function registrationResponse(attestationObject, challenge) {
  const clientDataJSON = JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN })
  return {
    id: b64u(authr.credentialId),
    rawId: b64u(authr.credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: b64u(new TextEncoder().encode(clientDataJSON)),
      attestationObject: b64u(cborEncode(attestationObject)),
      transports: ['internal'],
      clientExtensionResults: {},
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  }
}
async function assertionResponse(challenge) {
  const clientDataJSON = JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN })
  const authData = await authr.assert(RP_ID)
  return {
    id: b64u(authr.credentialId),
    rawId: b64u(authr.credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: b64u(new TextEncoder().encode(clientDataJSON)),
      authenticatorData: b64u(authData),
      signature: b64u(await authr.sign(authData, clientDataJSON)),
      userHandle: null,
    },
    clientExtensionResults: {},
  }
}

function computeTotp(secretB32, atMs = Date.now()) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secretB32.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let acc = 0
  let bits = 0
  const bytes = []
  for (const ch of clean) {
    acc = (acc << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >>> bits) & 0xff)
    }
  }
  const counter = Math.floor(atMs / 1000 / 30)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', Buffer.from(bytes)).update(msg).digest()
  const off = mac[mac.length - 1] & 0x0f
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

// ---------------------------------------------------------------- 测试

async function main() {
  console.log(`\n▶ Miniblog M0 冒烟测试 @ ${BASE}（${readDevVars().DEPLOY_MODE ?? 'standalone'} 模式）\n`)

  {
    const { res, json } = await call('GET', '/api/health')
    check('health 200', res.status === 200 && json?.ok === true)
    const boot = await call('GET', '/api/bootstrap')
    check('bootstrap: 未初始化', boot.json?.initialized === false)
    check('bootstrap: 部署模式', typeof boot.json?.deployMode === 'string')
    const home = await fetch(`${BASE}/`)
    check('SSR 首页 200', home.status === 200 && (await home.text()).includes('Miniblog'))
  }

  // 鉴权边界
  {
    const noAuth = await call('GET', '/api/auth/sessions')
    check('未登录 → 401', noAuth.res.status === 401)
    const noCsrf = await call('POST', '/api/auth/logout', { csrfHeader: false })
    check('缺 CSRF 头 → 403', noCsrf.res.status === 403)
    const badOrigin = await call('POST', '/api/auth/logout', { origin: 'https://evil.example' })
    check('伪造 Origin → 403', badOrigin.res.status === 403)
  }

  // Setup
  let recoveryCodes = []
  {
    const opt = await call('GET', '/api/auth/webauthn/setup/options?email=owner@miniblog.test')
    check('setup options 下发 challenge', typeof opt.json?.challenge === 'string')
    const att = await authr.makeCredential(RP_ID)
    const setup = await call('POST', '/api/setup', {
      body: { setupToken: SETUP_TOKEN, email: 'owner@miniblog.test', name: 'Smoke key', credential: registrationResponse(att, opt.json.challenge) },
    })
    check('初始化成功', setup.res.status === 200, JSON.stringify(setup.json))
    recoveryCodes = setup.json?.recoveryCodes ?? []
    check('返回 10 个恢复码', recoveryCodes.length === 10)
    const again = await call('GET', '/api/auth/webauthn/setup/options')
    check('初始化后关闭 setup', again.res.status === 403)
    const me = await call('GET', '/api/auth/me')
    check('当前用户信息', me.json?.displayName === 'Owner' && me.json?.passkeyCount === 1)
  }

  // 会话 Cookie 形态（部署模式语义）
  {
    const expectedStandalone = jar.names().some((n) => n === '__Host-md-session')
    const expectedLinked = jar.names().some((n) => n === '__Secure-md-session')
    check('会话 Cookie 符合部署模式', expectedStandalone !== expectedLinked, jar.names().join(','))
  }

  // 登出 + Passkey 重登录
  {
    const out = await call('POST', '/api/auth/logout')
    const meAfter = await call('GET', '/api/auth/me')
    check('登出后 → 401', out.res.status === 200 && meAfter.res.status === 401)

    const opt = await call('GET', '/api/auth/webauthn/login/options')
    check('登录挑战（discoverable）', typeof opt.json?.challenge === 'string')
    const login = await call('POST', '/api/auth/webauthn/login', { body: { credential: await assertionResponse(opt.json.challenge) } })
    check('Passkey 登录成功', login.res.status === 200, JSON.stringify(login.json))
    const me = await call('GET', '/api/auth/me')
    check('会话可用', me.json?.displayName === 'Owner')
  }

  // 密码 + TOTP
  {
    const pw = await call('PUT', '/api/auth/password', { body: { newPassword: 'testpass123' } })
    check('设置密码', pw.res.status === 200)
    const wrongPw = await call('POST', '/api/auth/password/login', { body: { password: 'wrong' } })
    check('错误密码 → 401', wrongPw.res.status === 401)

    const totpSetup = await call('POST', '/api/auth/totp/setup')
    check('TOTP 密钥下发', typeof totpSetup.json?.secret === 'string')
    const confirm = await call('POST', '/api/auth/totp/confirm', { body: { code: computeTotp(totpSetup.json.secret) } })
    check('TOTP 启用', confirm.res.status === 200)

    const step1 = await call('POST', '/api/auth/password/login', { body: { password: 'testpass123' } })
    check('密码登录 → 需要 TOTP', step1.json?.needTotp === true, JSON.stringify(step1.json))
    await call('POST', '/api/auth/logout')
    await call('POST', '/api/auth/password/login', { body: { password: 'testpass123' } })
    const verify = await call('POST', '/api/auth/totp/verify', { body: { code: computeTotp(totpSetup.json.secret, Date.now() + 31000) } })
    check('TOTP 验证登录', verify.res.status === 200, JSON.stringify(verify.json))
  }

  // 恢复码
  {
    await call('POST', '/api/auth/logout')
    const rec = await call('POST', '/api/auth/recover', { body: { code: recoveryCodes[0] } })
    check('恢复码登录', rec.res.status === 200, JSON.stringify(rec.json))
    const reuse = await call('POST', '/api/auth/recover', { body: { code: recoveryCodes[0] }, cookie: false })
    check('恢复码一次性', reuse.res.status === 401)
  }

  // 博客文章：CRUD + 发布流 + SSR + 缓存
  {
    const created = await call('POST', '/api/posts', {
      body: { title: 'Hello Miniblog', contentMd: '# 你好\n\n这是**第一篇**文章。', tags: ['随笔', 'test'], summary: '第一篇' },
    })
    check('新建文章（草稿）', created.res.status === 201 && created.json?.status === 'draft', JSON.stringify(created.json))
    const postId = created.json?.id

    const dup = await call('POST', '/api/posts', { body: { title: 'Hello Miniblog' } })
    check('slug 自动去重', !!dup.json?.slug && dup.json.slug !== created.json?.slug)

    const unauth = await call('POST', '/api/posts', { body: { title: 'x' }, cookie: false })
    check('未登录建文 → 401', unauth.res.status === 401)

    const updated = await call('PUT', `/api/posts/${postId}`, { body: { contentMd: '# 改过的正文' } })
    check('更新文章', updated.res.status === 200 && updated.json?.contentMd === '# 改过的正文')

    const pub = await call('POST', `/api/posts/${postId}/publish`)
    check('发布', pub.res.status === 200)

    const page = await fetch(`${BASE}/post/hello-miniblog`)
    const html = await page.text()
    check('公开页 SSR 渲染', page.status === 200 && html.includes('改过的正文') && html.includes('次浏览'), `status=${page.status}`)

    const home = await fetch(`${BASE}/`)
    check('首页列出文章', home.status === 200 && (await home.text()).includes('Hello Miniblog'))

    const list = await call('GET', '/api/posts?status=published')
    check('已发布列表', list.json?.items?.length === 1)

    await call('PUT', `/api/posts/${postId}`, { body: { contentMd: '# 第二版' } })
    check('保存后缓存已清除', (await (await fetch(`${BASE}/post/hello-miniblog`)).text()).includes('第二版'))

    const unpub = await call('POST', `/api/posts/${postId}/unpublish`)
    check('转草稿后公开页 404', unpub.res.status === 200 && (await fetch(`${BASE}/post/hello-miniblog`)).status === 404)

    const del = await call('DELETE', `/api/posts/${postId}`)
    check('删除文章', del.res.status === 200)
  }

  // 站点设置 + 关于页 + 归档/标签/RSS/sitemap
  {
    const settings = await call('PUT', '/api/settings', {
      body: { site: { name: '我的小站', description: '测试博客', footer: 'powered by miniblog' } },
    })
    check('保存站点设置', settings.res.status === 200)

    const about = await call('PUT', '/api/pages/about', { body: { title: '关于本站', contentMd: '# 关于\n\n这里是的介绍。' } })
    check('保存关于页', about.res.status === 200)

    const post = await call('POST', '/api/posts', {
      body: { title: '标签测试文', contentMd: '内容', tags: ['旅行'], summary: '' },
    })
    const pub = await call('POST', `/api/posts/${post.json?.id}/publish`)
    check('发布带标签文章', pub.res.status === 200)

    const home = await fetch(`${BASE}/`)
    check('首页显示站点名', home.status === 200 && (await home.text()).includes('我的小站'))

    const archive = await fetch(`${BASE}/archive`)
    check('归档页', archive.status === 200 && (await archive.text()).includes('标签测试文'))

    const tagPage = await fetch(`${BASE}/tag/旅行`)
    check('标签页（CJK slug）', tagPage.status === 200 && (await tagPage.text()).includes('标签测试文'))

    const aboutPage = await fetch(`${BASE}/page/about`)
    check('关于页 SSR', aboutPage.status === 200 && (await aboutPage.text()).includes('这里是的介绍'))

    const rss = await fetch(`${BASE}/rss.xml`)
    const rssText = await rss.text()
    check(
      'RSS 输出',
      rss.status === 200 && rssText.includes('<rss version="2.0">') && rssText.includes('标签测试文') && rss.headers.get('content-type')?.includes('rss+xml'),
    )

    const sitemap = await fetch(`${BASE}/sitemap.xml`)
    const smText = await sitemap.text()
    check('sitemap 输出', sitemap.status === 200 && smText.includes('/post/标签测试文') && smText.includes('/page/about'))
    check('sitemap 含 /tags', smText.includes('/tags'))

    const tagsPage = await fetch(`${BASE}/tags`)
    check('标签索引页', tagsPage.status === 200 && (await tagsPage.text()).includes('/tag/旅行'))

    // TOC 只收录 H2/H3，用例需含 H2 才能断言 toc
    const preview = await call('POST', '/api/preview', { body: { contentMd: '# 大标题\n\n## 小标题\n\n正文**加粗**。' } })
    check(
      '预览接口（服务端同管线）',
      preview.res.status === 200 && (preview.json?.html ?? '').includes('<h1') && (preview.json?.toc?.length ?? 0) >= 1,
    )

    // 公开站导航：默认导航（首页/归档/标签/关于）渲染进页头
    const navHome = await fetch(`${BASE}/`)
    const navHtml = await navHome.text()
    check('公开站页头导航', navHome.status === 200 && navHtml.includes('site-nav') && navHtml.includes('/archive') && navHtml.includes('/page/about'))
    const backHtml = await (await fetch(`${BASE}/post/标签测试文`)).text()
    check('无返回链接（改为回顶部按钮）', !backHtml.includes('class="back"') && backHtml.includes('id="mb-top"') && backHtml.includes('rel="icon"'))
  }

  // 主题系统：切换主题 + tokens 即时生效
  {
    const setTheme = await call('PUT', '/api/settings', {
      body: { theme: { mode: 'builtin', id: 'gallery', tokens: { accent: '#0e7490', radius: 16, font: 'serif' } } },
    })
    check('保存主题配置', setTheme.res.status === 200)

    const home = await fetch(`${BASE}/`)
    const html = await home.text()
    check(
      '主题切换生效（tokens 写入 CSS）',
      home.status === 200 && html.includes('--mb-accent:#0e7490') && html.includes('--mb-radius:16px') && html.includes('theme-gallery'),
      `status=${home.status}`,
    )
    const badId = await call('PUT', '/api/settings', { body: { theme: { mode: 'builtin', id: '不存在' } } })
    const badHome = await fetch(`${BASE}/`)
    check('未知主题回退默认', badId.res.status === 200 && (await badHome.text()).includes('--mb-accent:#5b5bd6'))
  }

  // 插件池：启用后挂载点输出进页面（含 lightbox / katex / footer-links / toc 实现）
  {
    // 目录插件需要含标题的文章
    const tocPost = await call('POST', '/api/posts', {
      body: { title: '目录测试文', contentMd: '# T\n\n## 小标题A\n\n正文\n\n## 小标题B\n\n正文B' },
    })
    await call('POST', `/api/posts/${tocPost.json?.id}/publish`)

    await call('PUT', '/api/settings', {
      body: {
        plugins: [
          { id: 'reading-time', enabled: true },
          { id: 'toc', enabled: true },
          { id: 'highlight', enabled: true, config: { theme: 'github' } },
          { id: 'lightbox', enabled: true },
          { id: 'katex', enabled: true },
          { id: 'footer-links', enabled: true, config: { links: 'GitHub|https://github.com; 站内|/about; 坏的|javascript:alert(1)' } },
        ],
      },
    })
    const page = await fetch(`${BASE}/post/标签测试文`)
    const html = await page.text()
    check('插件 head 注入（highlight 脚本）', html.includes('highlight.min.js'))
    check('插件 meta 挂载（约 N 分钟）', html.includes('约') && html.includes('分钟'))
    check('lightbox 插件注入', html.includes('mb-lightbox'))
    check('katex 插件注入', html.includes('katex.min.css'))
    check(
      'footer-links 渲染并过滤非法 href',
      html.includes('href="https://github.com"') && html.includes('>站内<') && !html.includes('javascript:alert'),
    )
    // 目录为浮动展开/收起组件，仅一份（内置目录已移除，唯一来源是 toc 插件）
    const tocHtml = await (await fetch(`${BASE}/post/目录测试文`)).text()
    check(
      '目录仅一份（浮动组件）',
      (tocHtml.match(/id="mb-toc"/g) ?? []).length === 1 && tocHtml.includes('mb-toc-btn') && !tocHtml.includes('class="toc"'),
    )

    // 全部关闭后，插件输出（含缓存中的旧 HTML）必须从文章页消失
    await call('PUT', '/api/settings', { body: { plugins: [] } })
    const off = await (await fetch(`${BASE}/post/目录测试文`)).text()
    check(
      '关闭插件即时生效（文章页缓存已清）',
      !off.includes('mb-toc-panel') && !off.includes('>· 约') && !off.includes('分钟阅读') && !off.includes('mb-lightbox'),
    )
  }

  // 模板主题（v2）：zip 上传 → 激活 custom → Liquid 渲染 → 资产服务 → 回退内置
  {
    const zip = zipSync({
      'theme.json': strToU8(JSON.stringify({ id: 'mytheme', name: '我的自定义主题' })),
      'templates/index.liquid': strToU8(
        '<html><body><h1>{{ site.name }} — CUSTOM</h1>{% for p in posts %}<div>{{ p.title }}</div>{% endfor %}</body></html>',
      ),
      'templates/post.liquid': strToU8(
        '<html><body><h1>POST:{{ post.title }}</h1><div>{{ post.html }}</div></body></html>',
      ),
      'assets/style.css': strToU8('body{color:#123}'),
    })
    const up = await call('POST', '/api/themes', { raw: true, body: zip })
    check('主题包上传', up.res.status === 201 && up.json?.id === 'mytheme', JSON.stringify(up.json))

    const activate = await call('PUT', '/api/settings', {
      body: { theme: { mode: 'custom', id: 'mytheme' } },
    })
    check('激活自定义主题', activate.res.status === 200)

    const home = await fetch(`${BASE}/`)
    const homeHtml = await home.text()
    check('首页 Liquid 渲染', home.status === 200 && homeHtml.includes('— CUSTOM') && homeHtml.includes('标签测试文'))

    const postPage = await fetch(`${BASE}/post/标签测试文`)
    check('文章页 Liquid 渲染', postPage.status === 200 && (await postPage.text()).includes('POST:标签测试文'))

    const css = await fetch(`${BASE}/themes/mytheme/assets/style.css`)
    check('主题资产服务', css.status === 200 && (await css.text()).includes('#123'))
    const tplLeak = await fetch(`${BASE}/themes/mytheme/templates/index.liquid`)
    check('模板源码不对外', tplLeak.status === 404)

    // 回退内置主题
    await call('PUT', '/api/settings', { body: { theme: { mode: 'builtin', id: 'magazine' } } })
    const back = await fetch(`${BASE}/`)
    check('切回内置主题', back.status === 200 && (await back.text()).includes('--mb-accent'))

    // 素材直链（M2 回归）：上传后本域直链可访问
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    const up2 = await call('POST', `/api/upload?name=${encodeURIComponent('pixel.png')}&mime=image/png`, { raw: true, body: png })
    check('上传素材', up2.res.status === 201 && up2.json?.url?.includes('/assets/'), JSON.stringify(up2.json))
    const slug2 = up2.json?.url?.split('/assets/')[1]
    const direct = await fetch(`${BASE}/assets/${slug2}`)
    check('素材直链（无鉴权+缓存+CORS）', direct.status === 200 && direct.headers.get('content-type') === 'image/png' && (direct.headers.get('cache-control') ?? '').includes('public'))
    const noauth = await fetch(`${BASE}/api/assets`)
    check('素材列表需登录', noauth.status === 401)
  }

  // 素材联动（standalone：LocalAssetStore + 本域直链）
  {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    const up2 = await call('POST', `/api/upload?name=${encodeURIComponent('pixel.png')}&mime=${encodeURIComponent('image/png')}`, {
      raw: true,
      body: png,
    })
    check('上传素材', up2.res.status === 201 && up2.json?.url?.includes('/assets/'), JSON.stringify(up2.json))
    const slug2 = up2.json?.url?.split('/assets/')[1]

    const list = await call('GET', '/api/assets?mime=image/%')
    check('素材列表', list.json?.items?.some((i) => i.url === up2.json?.url))

    const direct = await fetch(`${BASE}/assets/${slug2}`)
    const buf = new Uint8Array(await direct.arrayBuffer())
    check(
      '素材直链（无鉴权+缓存+CORS）',
      direct.status === 200 && direct.headers.get('content-type') === 'image/png' && (direct.headers.get('cache-control') ?? '').includes('public') && buf[1] === 0x50,
      `status=${direct.status} ct=${direct.headers.get('content-type')}`,
    )

    const noauth = await fetch(`${BASE}/api/assets`)
    check('素材列表需登录', noauth.status === 401)
  }

  // 设备列表
  {
    const sessions = await call('GET', '/api/auth/sessions')
    const cur = (sessions.json?.sessions ?? []).find((s) => s.isCurrent)
    check('设备列表含当前会话', !!cur)
    check('设备列表字段 camelCase', !!cur && typeof cur.createdAt === 'number' && typeof cur.lastSeenAt === 'number' && !('created_at' in cur))
  }

  // Admin 安全响应头：仅 /admin/* HTML 携带 CSP；公开 SSR 页不携带（插件需注入 CDN script）
  {
    // /admin/ 为静态精确命中（run_worker_first 保证仍过 Worker）；/admin/login 为 SPA 回退
    const admin = await fetch(`${BASE}/admin/`)
    const fallback = await fetch(`${BASE}/admin/login`)
    const home = await fetch(`${BASE}/`)
    check(
      'admin 页安全头（直出+回退）',
      admin.status === 200 &&
        fallback.status === 200 &&
        (admin.headers.get('content-security-policy') ?? '').includes("script-src 'self'") &&
        (fallback.headers.get('content-security-policy') ?? '').includes("script-src 'self'") &&
        admin.headers.get('x-frame-options') === 'DENY',
    )
    check(
      '公开页不带 CSP',
      home.status === 200 && admin.headers.get('content-security-policy') !== null && home.headers.get('content-security-policy') === null,
    )
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('测试崩溃：', err)
  process.exit(1)
})
