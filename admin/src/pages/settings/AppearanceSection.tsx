import { useTranslation } from 'react-i18next'
import { LangPicker, ThemePicker } from '../../components/ThemeLang'

/** 后台界面：亮暗主题 + 语言（仅影响 Admin，不影响公开站） */
export function AppearanceSection() {
  const { t } = useTranslation()
  return (
    <div>
      <Card title={t('settings.appearance.appTheme')}>
        <ThemePicker />
      </Card>
      <Card title={t('settings.appearance.language')}>
        <LangPicker />
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}
