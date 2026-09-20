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
  /**
   * 跨子域共享认证（SSO）：设为 "true" 时，Passkey RP 与会话 Cookie 自动统一到
   * APP_PUBLIC_URL（或请求域）的根域——两应用（与 minidriver）都开启且同根域即互通。
   * 常规根域自动推导（含 com.cn/co.uk 等常见多级后缀）；PSL 托管域（如 github.io）
   * 浏览器本身不允许跨子域，请保持关闭。
   */
  BASE_DOMAIN_AUTH?: string
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

/**
 * 跨子域共享认证开启时的共享域（BASE_DOMAIN_AUTH="true"）；未开启返回 undefined。
 * 共享域 = 主机名去掉第一段（a.b.c.d → b.c.d；不足三段回退自身）——
 * 部署域名即「根域 + 一段前缀」（如 f./b./blog.），公共后缀由使用者保证。
 */
export function sharedAuthDomain(env: Env, requestUrl: string): string | undefined {
  if (env.BASE_DOMAIN_AUTH !== 'true') return undefined
  const host = new URL(publicOrigin(env, requestUrl)).hostname
  const labels = host.split('.').filter(Boolean)
  return labels.length < 3 ? host : labels.slice(1).join('.')
}

/** WebAuthn RP ID：跨子域共享认证开启时统一根域，否则完整主机名 */
export function rpID(env: Env, requestUrl?: string): string {
  const origin = publicOrigin(env, requestUrl ?? 'http://localhost')
  return sharedAuthDomain(env, origin) ?? new URL(origin).hostname
}
