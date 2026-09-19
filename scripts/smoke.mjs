/**
 * Miniblog M0 冒烟测试：standalone 模式认证全链路。
 * 复用 minidriver 的伪造 WebAuthn 认证器方案（ES256 + 手写 CBOR）。
 * 运行：npm run smoke（需 wrangler dev + 本地迁移）
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

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
    check('公开页 SSR 渲染', page.status === 200 && html.includes('改过的正文') && html.includes('分钟阅读'), `status=${page.status}`)

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

  // 设备列表
  {
    const sessions = await call('GET', '/api/auth/sessions')
    check('设备列表含当前会话', (sessions.json?.sessions ?? []).some((s) => s.isCurrent))
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('测试崩溃：', err)
  process.exit(1)
})
