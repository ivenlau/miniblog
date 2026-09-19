import { useTranslation } from 'react-i18next'
import { ThemeSection } from './settings/ThemeSection'

/** 主题（顶级页面）：内置主题 + Design Tokens + 实时预览 */
export function ThemeSettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="mb-5 text-lg font-semibold">{t('settings.sectionTheme')}</h1>
      <ThemeSection />
    </div>
  )
}
