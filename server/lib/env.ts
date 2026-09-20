import type { Hono } from 'hono'

export type Env = {
  DB: D1Database
  R2: R2Bucket
  ASSETS: Fetcher
  APP_PUBLIC_URL: string
  /** SSO 联动：认证 RP ID（如根域）。留空 = APP_PUBLIC_URL 主机名 */
  AUTH_RP_ID?: string
  /** SSO 联动：SSO Cookie 域（父域）。设置后会话 Cookie 变 __Secure- + Domain，两应用共享登录 */
  AUTH_COOKIE_DOMAIN?: string
  ALLOWED_ORIGINS?: string
  SESSION_ENC_KEY: string
  SETUP_TOKEN: string
}

export type Vars = { userId: string }

export type AppEnv = { Bindings: Env; Variables: Vars }
export type App = Hono<AppEnv>

export function rpID(env: Env, _requestUrl?: string): string {
  return env.AUTH_RP_ID?.trim() || new URL(env.APP_PUBLIC_URL).hostname
}

export function allowedOrigins(env: Env, _requestUrl?: string): string[] {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list : [publicOrigin(env)]
}

function publicOrigin(env: Env): string {
  return new URL(env.APP_PUBLIC_URL).origin
}
