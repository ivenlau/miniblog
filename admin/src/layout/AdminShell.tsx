import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText, LayoutDashboard, LogOut, Plus, Settings, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { useBootstrap } from '../state/auth'
import type { Bootstrap, Me } from '../lib/types'
import { formatNumber } from '../lib/format'
import { Button, Dropdown, Splash, cn } from '../components/ui'
import { LangToggle, ThemeToggle } from '../components/ThemeLang'
import { Logo } from '../components/Logo'

export type AdminShellContext = {
  me: Me
  deployMode: Bootstrap['deployMode']
  signOut: () => Promise<void>
}

export function useAdminShell(): AdminShellContext {
  return useOutletContext<AdminShellContext>()
}

const NAV = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard', end: true },
  { to: '/posts', icon: FileText, key: 'nav.posts', end: false },
  { to: '/settings', icon: Settings, key: 'nav.settings', end: false },
] as const

const MOBILE_NAV = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard', end: true },
  { to: '/posts', icon: FileText, key: 'nav.posts', end: false },
] as const

/** 布局路由：鉴权守卫 + 壳。me/deployMode 通过 Outlet context 下发 */
export function AdminShell() {
  const location = useLocation()
  const { data, isLoading, isFetching } = useBootstrap()
  // 缓存是登录前的旧数据且正在重取时，先展示 Splash 而不是误判未登录弹回登录页
  if (isLoading || (isFetching && !data?.me)) return <Splash />
  if (!data?.initialized) return <Navigate to="/setup" replace />
  if (!data.me) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <ShellInner me={data.me as Me} deployMode={data.deployMode} />
}

function ShellInner({ me, deployMode }: { me: Me; deployMode: Bootstrap['deployMode'] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const signOut = async () => {
    await api.post('/api/auth/logout').catch(() => {})
    qc.clear()
    navigate('/login', { replace: true })
  }

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
      isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-text',
    )
  const bottomLinkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors',
      isActive ? 'text-accent' : 'text-muted',
    )

  return (
    <div className="flex h-dvh bg-bg text-text">
      {/* 侧栏（桌面） */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <Logo size={32} />
          <span className="text-[15px] font-semibold tracking-tight">{t('common.appName')}</span>
        </div>
        <nav className="mt-2 space-y-0.5 px-3">
          {NAV.map(({ to, icon: Icon, key, end }) => (
            <NavLink key={to} to={to} end={end} className={navLinkCls}>
              <Icon size={18} />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 space-y-2 px-3">
          <Button variant="primary" className="w-full justify-center" onClick={() => navigate('/posts/new')}>
            <Plus size={16} />
            {t('nav.newPost')}
          </Button>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
          >
            <ExternalLink size={15} />
            {t('nav.viewSite')}
          </a>
        </div>
        <div className="mt-auto px-3 pb-3">
          <BlogMeter />
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-5">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={28} />
            <span className="text-sm font-semibold">{t('common.appName')}</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-0.5">
            <ThemeToggle />
            <LangToggle />
            <Dropdown
              trigger={
                <button
                  aria-label={t('nav.settings')}
                  className="ml-0.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent transition-colors hover:brightness-95"
                >
                  <UserRound size={17} />
                </button>
              }
              items={[
                { label: t('nav.settings'), icon: <Settings size={15} />, onSelect: () => navigate('/settings') },
                { label: t('nav.viewSite'), icon: <ExternalLink size={15} />, onSelect: () => window.open('/', '_blank') },
                { label: t('common.signOut'), icon: <LogOut size={15} />, danger: true, onSelect: () => void signOut() },
              ]}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet context={{ me, deployMode, signOut } satisfies AdminShellContext} />
        </main>

        {/* 底部导航（移动）：中央为「写作」 */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {MOBILE_NAV.map(({ to, icon: Icon, key, end }) => (
            <NavLink key={to} to={to} end={end} className={bottomLinkCls}>
              <Icon size={21} />
              {t(key)}
            </NavLink>
          ))}
          <NavLink to="/posts/new" className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white shadow-card">
              <Plus size={19} />
            </span>
            {t('nav.write')}
          </NavLink>
          <NavLink to="/settings" end={false} className={bottomLinkCls}>
            <Settings size={21} />
            {t('nav.settings')}
          </NavLink>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted"
          >
            <ExternalLink size={21} />
            {t('nav.viewSite')}
          </a>
        </nav>
      </div>
    </div>
  )
}

/** 侧栏底部：文章数 / 浏览量速览（复用文章列表查询，无独立端点） */
function BlogMeter() {
  const { t, i18n } = useTranslation()
  const { data } = useQuery({
    queryKey: ['posts'],
    queryFn: () => api.get<{ items: { views: number; status: string }[] }>('/api/posts'),
  })
  const items = data?.items ?? []
  const published = items.filter((p) => p.status === 'published').length
  const views = items.reduce((sum, p) => sum + p.views, 0)
  return (
    <div className="rounded-xl bg-surface2 px-3.5 py-3">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>{t('nav.posts')}</span>
        <span className="font-medium text-text">
          {formatNumber(published, i18n.language)} / {formatNumber(items.length, i18n.language)}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {t('dashboard.totalViews')} · <span className="font-medium text-text">{formatNumber(views, i18n.language)}</span>
      </p>
    </div>
  )
}
