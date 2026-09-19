import { useTranslation } from 'react-i18next'
import { BlogSection } from './settings/BlogSection'

/** 博客设置（顶级页面）：站点信息 / 导航链接 / 关于页 */
export function BlogSettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="mb-5 text-lg font-semibold">{t('settings.sectionBlog')}</h1>
      <BlogSection />
    </div>
  )
}
