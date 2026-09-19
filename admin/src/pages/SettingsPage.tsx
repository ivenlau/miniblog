import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Input, Spinner, cn } from '../components/ui'
import { useToast } from '../state/toast'

type SiteSettings = { name: string; description: string; footer: string }
type AboutPage = { title: string; contentMd: string }

export function SettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, never>>('/api/settings') })
  const aboutQuery = useQuery({ queryKey: ['page-about'], queryFn: () => api.get<AboutPage>('/api/pages/about') })

  const [site, setSite] = useState<SiteSettings>({ name: 'Miniblog', description: '', footer: '' })
  const [about, setAbout] = useState<AboutPage>({ title: '关于', contentMd: '' })
  const [siteLoaded, setSiteLoaded] = useState(false)

  useEffect(() => {
    const data = settingsQuery.data as { site?: SiteSettings } | undefined
    if (data?.site && !siteLoaded) {
      setSite({ name: data.site.name ?? 'Miniblog', description: data.site.description ?? '', footer: data.site.footer ?? '' })
      setSiteLoaded(true)
    }
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

  if (settingsQuery.isLoading || aboutQuery.isLoading) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <h1 className="text-lg font-semibold">站点设置</h1>

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
