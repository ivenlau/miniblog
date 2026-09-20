import { Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Palette, ShieldCheck } from 'lucide-react'
import { useAdminShell } from '../../layout/AdminShell'
import { SecuritySection } from './SecuritySection'
import { AppearanceSection } from './AppearanceSection'
import { cn } from '../../components/ui'

type SettingsTab = 'security' | 'appearance'

/** 旧设置标签页 → 新顶级路由（/blog /theme /plugins） */
const LEGACY_TAB_REDIRECT: Record<string, string> = {
  blog: '/blog',
  theme: '/theme',
  plugins: '/plugins',
}

/** 设置页：账户安全 + 后台外观（博客/主题/插件已提升为顶级页面） */
export function SettingsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const legacy = params.get('tab')
  if (legacy && legacy in LEGACY_TAB_REDIRECT) {
    return <Navigate to={LEGACY_TAB_REDIRECT[legacy]!} replace />
  }
  const tab = (params.get('tab') as SettingsTab | null) ?? 'security'

  const tabs: { key: SettingsTab; label: string; icon: typeof ShieldCheck }[] = [
    { key: 'security', label: t('settings.sectionSecurity'), icon: ShieldCheck },
    { key: 'appearance', label: t('settings.sectionAppearance'), icon: Palette },
  ]

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
      <nav className="mb-scroll-x flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setParams(key === 'security' ? {} : { tab: key })}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
              tab === key ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-text',
            )}
          >
            <Icon size={17} />
            {label}
            {key === 'security' && <SecurityBadge />}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {tab === 'security' && <SecuritySection />}
        {tab === 'appearance' && <AppearanceSection />}
      </div>
    </div>
  )
}

/** 联动徽章：配置了 SSO 域（两应用共享登录与账号数据）时显示 */
export function SecurityBadge() {
  const { t } = useTranslation()
  const { ssoEnabled } = useAdminShell()
  if (!ssoEnabled) return null
  return (
    <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium leading-none text-warn">
      {t('settings.sharedModeBadge')}
    </span>
  )
}
