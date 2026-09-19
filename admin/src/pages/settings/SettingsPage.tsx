import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe2, Palette, PencilRuler, ShieldCheck, Sparkles } from 'lucide-react'
import { useAdminShell } from '../../layout/AdminShell'
import { SecuritySection } from './SecuritySection'
import { BlogSection } from './BlogSection'
import { ThemeSection } from './ThemeSection'
import { AppearanceSection } from './AppearanceSection'
import { PluginsSection } from './PluginsSection'
import { cn } from '../../components/ui'

export type SettingsTab = 'security' | 'blog' | 'theme' | 'appearance' | 'plugins'

/** 设置页：标签页走 URL（?tab=），刷新/后退可用 */
export function SettingsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SettingsTab | null) ?? 'security'

  const tabs: { key: SettingsTab; label: string; icon: typeof ShieldCheck }[] = [
    { key: 'security', label: t('settings.sectionSecurity'), icon: ShieldCheck },
    { key: 'blog', label: t('settings.sectionBlog'), icon: Globe2 },
    { key: 'theme', label: t('settings.sectionTheme'), icon: PencilRuler },
    { key: 'appearance', label: t('settings.sectionAppearance'), icon: Palette },
    { key: 'plugins', label: t('settings.sectionPlugins'), icon: Sparkles },
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
        {tab === 'blog' && <BlogSection />}
        {tab === 'theme' && <ThemeSection />}
        {tab === 'appearance' && <AppearanceSection />}
        {tab === 'plugins' && <PluginsSection />}
      </div>
    </div>
  )
}

/** linked 部署徽章：账号与安全数据与 Minidriver 共库 */
export function SecurityBadge() {
  const { t } = useTranslation()
  const { deployMode } = useAdminShell()
  if (deployMode !== 'linked') return null
  return (
    <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium leading-none text-warn">
      {t('settings.sharedModeBadge')}
    </span>
  )
}
