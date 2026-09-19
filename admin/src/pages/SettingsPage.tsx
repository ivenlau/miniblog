import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Input, Spinner, cn } from '../components/ui'
import { useToast } from '../state/toast'

type SiteSettings = { name: string; description: string; footer: string }
type AboutPage = { title: string; contentMd: string }
type ThemeSettings = { mode: 'builtin'; id: string; tokens: { accent?: string; radius?: number; width?: number; font?: 'sans' | 'serif' } }

const THEME_CARDS = [
  { id: 'magazine', name: '极简杂志' },
  { id: 'classic', name: '经典博客' },
  { id: 'gallery', name: '相册封面' },
]

export function SettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, never>>('/api/settings') })
  const aboutQuery = useQuery({ queryKey: ['page-about'], queryFn: () => api.get<AboutPage>('/api/pages/about') })

  const [site, setSite] = useState<SiteSettings>({ name: 'Miniblog', description: '', footer: '' })
  const [about, setAbout] = useState<AboutPage>({ title: '关于', contentMd: '' })
  const [theme, setTheme] = useState<ThemeSettings>({ mode: 'builtin', id: 'magazine', tokens: {} })
  const [siteLoaded, setSiteLoaded] = useState(false)

  useEffect(() => {
    const data = settingsQuery.data as { site?: SiteSettings; theme?: ThemeSettings } | undefined
    if (data?.site && !siteLoaded) {
      setSite({ name: data.site.name ?? 'Miniblog', description: data.site.description ?? '', footer: data.site.footer ?? '' })
    }
    if (data?.theme) setTheme(data.theme)
    setSiteLoaded(true)
  }, [settingsQuery.data, siteLoaded])
  useEffect(() => {
    if (aboutQuery.data?.title) setAbout({ title: aboutQuery.data.title, contentMd: aboutQuery.data.contentMd })
  }, [aboutQuery.data])

  const saveSite = useMutation({
    mutationFn: () => api.put('/api/settings', { site }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast('站点设置已保存', 'success')
    },
    onError: () => toast('保存失败', 'error'),
  })
  const saveAbout = useMutation({
    mutationFn: () => api.put('/api/pages/about', about),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['page-about'] })
      toast('关于页已保存', 'success')
    },
    onError: () => toast('保存失败', 'error'),
  })
  const saveTheme = useMutation({
    mutationFn: () => api.put('/api/settings', { theme }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast('主题已保存，公开页即刻生效', 'success')
    },
    onError: () => toast('保存失败', 'error'),
  })

  if (settingsQuery.isLoading || aboutQuery.isLoading) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <h1 className="text-lg font-semibold">站点设置</h1>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">主题</h2>
        <div className="grid grid-cols-3 gap-2">
          {THEME_CARDS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme({ ...theme, mode: 'builtin', id: t.id })}
              className={cn(
                'cursor-pointer rounded-xl border py-3 text-[13px] transition-colors',
                theme.id === t.id ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line text-muted hover:bg-surface2',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="text-[12px] text-muted">
            强调色
            <input
              type="color"
              className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-line"
              value={theme.tokens.accent ?? '#5b5bd6'}
              onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, accent: e.target.value } })}
            />
          </label>
          <label className="text-[12px] text-muted">
            圆角 {theme.tokens.radius ?? 12}px
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
            版心宽度 {theme.tokens.width ?? 46}rem
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
            字体
            <select
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-text"
              value={theme.tokens.font ?? 'sans'}
              onChange={(e) => setTheme({ ...theme, tokens: { ...theme.tokens, font: e.target.value as 'sans' | 'serif' } })}
            >
              <option value="sans">无衬线</option>
              <option value="serif">衬线</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => saveTheme.mutate()} disabled={saveTheme.isPending}>
            <Save size={14} />
            保存主题
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">站点信息</h2>
        <Input placeholder="站点名称" value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} />
        <Input placeholder="一句话描述（显示在标题下方）" value={site.description} onChange={(e) => setSite({ ...site, description: e.target.value })} />
        <Input placeholder="页脚文字（留空自动生成版权）" value={site.footer} onChange={(e) => setSite({ ...site, footer: e.target.value })} />
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => saveSite.mutate()} disabled={saveSite.isPending}>
            <Save size={14} />
            保存站点信息
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">关于页（/page/about）</h2>
        <Input placeholder="页面标题" value={about.title} onChange={(e) => setAbout({ ...about, title: e.target.value })} />
        <textarea
          placeholder="Markdown…"
          value={about.contentMd}
          onChange={(e) => setAbout({ ...about, contentMd: e.target.value })}
          spellCheck={false}
          className={cn(
            'h-64 w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-accent',
          )}
        />
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => saveAbout.mutate()} disabled={saveAbout.isPending}>
            <Save size={14} />
            保存关于页
          </Button>
        </div>
      </section>
    </div>
  )
}
