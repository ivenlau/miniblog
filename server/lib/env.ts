import type { Hono } from 'hono'

export type Env = {
  DB: D1Database
  R2: R2Bucket
  ASSETS: Fetcher
  /**
   * 规范对外地址（Passkey RP、CSRF Origin、素材直链、缓存键的权威来源）。
   * 以 Cloudflare Secret 形式配置一次（部署永不覆盖）；留空或为占位符时，
   * 自动回退到当前请求的来源（单域名零配置）。多域名并存时必须填写。
   */
  APP_PUBLIC_URL: string
  /** 允许的来源，逗号分隔；为空则默认 APP_PUBLIC_URL（或请求来源） */
  ALLOWED_ORIGINS?: string
  SESSION_ENC_KEY: string
  SETUP_TOKEN: string
  /** SSO 联动：认证 RP ID（如根域）。设置后 Passkey 可跨子域应用共享；未设置 = 各自主机名 */
  AUTH_RP_ID?: string
  /** SSO 联动：会话 Cookie 域（父域）。设置后会话在根域子域间通用；未设置 = host-only */
  AUTH_COOKIE_DOMAIN?: string
}

export type Vars = { userId: string }

export type AppEnv = { Bindings: Env; Variables: Vars }
export type App = Hono<AppEnv>

function isConfigured(url: string | undefined): boolean {
  return !!url && !url.includes('<')
}

/** 规范来源：优先配置值，否则回退到当前请求的来源 */
export function publicOrigin(env: Env, requestUrl: string): string {
  return isConfigured(env.APP_PUBLIC_URL) ? env.APP_PUBLIC_URL : new URL(requestUrl).origin
}

export function allowedOrigins(env: Env, requestUrl?: string): string[] {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list : [publicOrigin(env, requestUrl ?? '')]
}

/** WebAuthn RP ID：AUTH_RP_ID 优先（联动部署统一根域），否则完整主机名 */
export function rpID(env: Env, requestUrl?: string): string {
  return env.AUTH_RP_ID?.trim() || new URL(publicOrigin(env, requestUrl ?? 'http://localhost')).hostname
}
