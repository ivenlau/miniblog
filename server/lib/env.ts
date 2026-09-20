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

/** 常见多级公共后缀（个人场景够用；完整 PSL 不内置） */
const MULTI_LABEL_SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'ac.cn',
  'co.uk', 'org.uk', 'com.au', 'co.jp', 'com.hk', 'com.tw', 'com.sg',
])

/** 主机名的可注册根域（eTLD+1；仅支持常见后缀，PSL 托管域不适用） */
export function rootDomain(host: string): string {
  const labels = host.split('.').filter(Boolean)
  const last2 = labels.slice(-2).join('.')
  if (MULTI_LABEL_SUFFIXES.has(labels.slice(-2).join('.'))) return labels.slice(-3).join('.')
  return last2
}

/**
 * 跨子域共享认证开启时的根域（BASE_DOMAIN_AUTH="true"）；未开启返回 undefined。
 * 根域从规范来源（APP_PUBLIC_URL 或请求域）推导，无需手填。
 */
export function sharedAuthDomain(env: Env, requestUrl: string): string | undefined {
  if (env.BASE_DOMAIN_AUTH !== 'true') return undefined
  return rootDomain(new URL(publicOrigin(env, requestUrl)).hostname)
}

/** WebAuthn RP ID：跨子域共享认证开启时统一根域，否则完整主机名 */
export function rpID(env: Env, requestUrl?: string): string {
  const origin = publicOrigin(env, requestUrl ?? 'http://localhost')
  return sharedAuthDomain(env, origin) ?? new URL(origin).hostname
}
