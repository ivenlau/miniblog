import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { AppEnv, Env } from './env'
import { randomToken, sha256Hex } from './ids'
import { sharedAuthDomain } from './env'

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
export const SESSION_ABS_MS = 90 * 24 * 3600 * 1000

/**
 * 会话 Cookie 按 BASE_DOMAIN_AUTH 区分（跨子域共享认证）：
 * - 未开启：`__Host-md-session`（host-only，各应用独立登录）
 * - 开启：`__Secure-md-session` + 根域 Domain（自动推导，两应用共享登录）
 */
export function sessionCookieName(env: Env, requestUrl: string): string {
  return sharedAuthDomain(env, requestUrl) ? '__Secure-md-session' : '__Host-md-session'
}

function sessionCookieOptions(env: Env, requestUrl: string) {
  const base = { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/' }
  const domain = sharedAuthDomain(env, requestUrl)
  return domain ? { ...base, domain } : base
}

/** WebAuthn 挑战 / TOTP 临时凭证用（本域 host-only，双模式一致） */
export function cookieOpts() {
  return { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/' }
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken(32)
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip_country) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(
      await sha256Hex(token),
      userId,
      now,
      now,
      now + SESSION_TTL_MS,
      c.req.header('User-Agent') ?? null,
      c.req.header('CF-IPCountry') ?? null,
    )
    .run()
  setCookie(c, sessionCookieName(c.env, c.req.url), token, sessionCookieOptions(c.env, c.req.url))
}

export async function destroyCurrentSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, sessionCookieName(c.env, c.req.url))
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  }
  clearSessionCookie(c)
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  // 删除时带上 Domain 属性（跨子域共享认证时），否则浏览器不会移除父域 Cookie
  deleteCookie(c, sessionCookieName(c.env, c.req.url), {
    path: '/',
    secure: true,
    ...(sharedAuthDomain(c.env, c.req.url) ? { domain: sharedAuthDomain(c.env, c.req.url) } : {}),
  })
}
