import { useTranslation } from 'react-i18next'
import { PluginsSection } from './settings/PluginsSection'

/** 插件（顶级页面）：声明式插件池启停与配置 */
export function PluginsPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="mb-1 text-lg font-semibold">{t('settings.sectionPlugins')}</h1>
      <p className="mb-5 text-[13px] text-muted">{t('plugins.hint')}</p>
      <PluginsSection />
    </div>
  )
}
