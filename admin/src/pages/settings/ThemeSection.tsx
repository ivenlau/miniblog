import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import type { ThemeSettings } from '../../lib/types'
import { Button, Spinner, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

const THEME_CARDS = [
  { id: 'magazine', nameKey: 'settings.theme.magazine', descKey: 'settings.theme.magazineDesc' },
  { id: 'classic', nameKey: 'settings.theme.classic', descKey: 'settings.theme.classicDesc' },
  { id: 'gallery', nameKey: 'settings.theme.gallery', descKey: 'settings.theme.galleryDesc' },
] as const

/** 博客主题（公开站）：内置三主题 + Design Tokens */
export function ThemeSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/api/settings') })
  const [theme, setTheme] = useState<ThemeSettings>({ mode: 'builtin', id: 'magazine', tokens: {} })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const data = settingsQuery.data as { theme?: ThemeSettings } | undefined
    if (data?.theme && !loaded) {
      setTheme(data.theme)
      setLoaded(true)
    }
  }, [settingsQuery.data, loaded])

  const errText = (err: unknown) => t(`errors.${errCode(err)}`)
  const saveTheme = useMutation({
    mutationFn: () => api.put('/api/settings', { theme }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast(t('settings.theme.saved'), 'success')
    },
    onError: (err) => toast(errText(err), 'error'),
  })

  if (settingsQuery.isLoading) return <Spinner />

  return (
    <Card title={t('settings.theme.title')}>
      <div className="grid gap-2 sm:grid-cols-3">
        {THEME_CARDS.map(({ id, nameKey, descKey }) => (
          <button
            key={id}
            onClick={() => setTheme({ ...theme, mode: 'builtin', id })}
            className={cn(
              'cursor-pointer rounded-xl border p-3.5 text-left transition-colors',
              theme.id === id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface2',
            )}
          >
            <p className={cn('text-[13.5px] font-medium', theme.id === id ? 'text-accent' : 'text-text')}>
              {t(nameKey)}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">{t(descKey)}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 md:grid-cols-4">
        <label className="text-[12px] text-muted">
          {t('settings.theme.accent')}
          <input
            type="color"
            className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-line bg-surface"
            value={theme.tokens.accent ?? '#5b5bd6'}
            onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, accent: e.target.value } })}
          />
        </label>
        <label className="text-[12px] text-muted">
          {t('settings.theme.radius', { count: theme.tokens.radius ?? 12 })}
          <input
            type="range"
            min={0}
            max={24}
            className="mt-3 w-full accent-accent"
            value={theme.tokens.radius ?? 12}
            onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, radius: Number(e.target.value) } })}
          />
        </label>
        <label className="text-[12px] text-muted">
          {t('settings.theme.width', { count: theme.tokens.width ?? 46 })}
          <input
            type="range"
            min={34}
            max={68}
            className="mt-3 w-full accent-accent"
            value={theme.tokens.width ?? 46}
            onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, width: Number(e.target.value) } })}
          />
        </label>
        <label className="text-[12px] text-muted">
          {t('settings.theme.font')}
          <select
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-text"
            value={theme.tokens.font ?? 'sans'}
            onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, font: e.target.value as 'sans' | 'serif' } })}
          >
            <option value="sans">{t('settings.theme.fontSans')}</option>
            <option value="serif">{t('settings.theme.fontSerif')}</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="primary" size="sm" onClick={() => saveTheme.mutate()} disabled={saveTheme.isPending}>
          <Save size={14} />
          {t('settings.theme.save')}
        </Button>
      </div>
    </Card>
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
