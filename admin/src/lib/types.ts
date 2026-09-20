export type PostDto = {
  id: string
  slug: string
  title: string
  summary: string
  contentMd?: string
  coverUrl: string | null
  status: 'draft' | 'published'
  pinned: boolean
  views: number
  publishedAt: number | null
  createdAt: number
  updatedAt: number
  tags: string[]
}

/** GET /api/auth/me */
export type Me = {
  userId: string
  email: string
  displayName: string
  hasPassword: boolean
  totpEnabled: boolean
  passkeyCount: number
  recoveryCodesLeft: number
}

/** GET /api/bootstrap */
export type Bootstrap = {
  initialized: boolean
  authMethods: { password: boolean; totp: boolean }
  /** 配置了 AUTH_COOKIE_DOMAIN（两应用共享登录）时为 true——安全设置页据此显示联动提示 */
  ssoEnabled: boolean
  me?: { userId: string; email: string; displayName: string } & Partial<Me>
}

/** GET /api/auth/credentials */
export type CredentialDto = {
  id: string
  name: string
  backedUp: boolean
  lastUsedAt: number | null
  createdAt: number
}

/** GET /api/auth/sessions */
export type SessionDto = {
  id: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  userAgent: string | null
  ipCountry: string | null
  isCurrent: boolean
}

/** 公开站导航链接（site.nav） */
export type NavItem = { label: string; href: string }

/** blog_settings.site */
export type SiteSettings = { name: string; description: string; footer: string; nav?: NavItem[] }

/** blog_settings.theme */
export type ThemeSettings = {
  mode: 'builtin'
  id: string
  tokens: { accent?: string; radius?: number; width?: number; font?: 'sans' | 'serif'; fontSize?: number }
}

/** blog_settings.plugins */
export type PluginConfig = { id: string; enabled: boolean; config?: Record<string, string> }

/** GET /api/preview */
export type RenderedPost = { html: string; toc: { id: string; text: string; level: number }[]; readingMinutes: number; excerpt: string }

/** GET /api/pages/:slug */
export type PageDto = { slug: string; title: string; contentMd: string; updatedAt: number }
