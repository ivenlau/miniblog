import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link2, Plus, Save, Trash2 } from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import type { NavItem, PageDto, SiteSettings } from '../../lib/types'
import { MarkdownField } from '../../components/MarkdownField'
import { Button, Input, Spinner } from '../../components/ui'
import { useToast } from '../../state/toast'

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

/**
 * 博客设置：站点信息（含导航链接 site.nav）+ 关于页。
 * 注意 PUT /api/settings 的 site 是整块 JSON，必须带完整对象回写，否则其他字段丢失。
 */
export function BlogSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/api/settings') })
  const aboutQuery = useQuery({ queryKey: ['page-about'], queryFn: () => api.get<PageDto>('/api/pages/about') })

  const [site, setSite] = useState<SiteSettings>({ name: 'Miniblog', description: '', footer: '' })
  const [about, setAbout] = useState<PageDto>({ slug: 'about', title: '关于', contentMd: '', updatedAt: 0 })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    const data = settingsQuery.data as { site?: SiteSettings } | undefined
    if (!data) return
    if (data.site) {
      setSite({
        name: data.site.name ?? 'Miniblog',
        description: data.site.description ?? '',
        footer: data.site.footer ?? '',
        nav: Array.isArray(data.site.nav) ? data.site.nav : [],
      })
    }
    setLoaded(true)
  }, [settingsQuery.data, loaded])

  useEffect(() => {
    if (!aboutQuery.data) return
    setAbout((prev) => ({ ...prev, title: aboutQuery.data.title, contentMd: aboutQuery.data.contentMd }))
  }, [aboutQuery.data])

  const errText = (err: unknown) => t(`errors.${errCode(err)}`)

  const saveSite = useMutation({
    mutationFn: () => api.put('/api/settings', { site }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast(t('settings.blog.savedSite'), 'success')
    },
    onError: (err) => toast(errText(err), 'error'),
  })
  const saveAbout = useMutation({
    mutationFn: () => api.put('/api/pages/about', { title: about.title, contentMd: about.contentMd }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['page-about'] })
      toast(t('settings.blog.savedAbout'), 'success')
    },
    onError: (err) => toast(errText(err), 'error'),
  })

  if (settingsQuery.isLoading || aboutQuery.isLoading) return <Spinner />

  const nav = site.nav ?? []
  const setNav = (items: NavItem[]) => setSite({ ...site, nav: items })

  return (
    <div>
      <Card title={t('settings.blog.siteInfo')}>
        <div className="space-y-3">
          <Input
            placeholder={t('settings.blog.siteName')}
            value={site.name}
            onChange={(e) => setSite({ ...site, name: e.target.value })}
          />
          <Input
            placeholder={t('settings.blog.siteDescription')}
            value={site.description}
            onChange={(e) => setSite({ ...site, description: e.target.value })}
          />
          <Input
            placeholder={t('settings.blog.siteFooter')}
            value={site.footer}
            onChange={(e) => setSite({ ...site, footer: e.target.value })}
          />
        </div>

        {/* 导航链接（site.nav）；空 = 公开站使用默认导航 */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            <Link2 size={14} className="text-muted" />
            {t('settings.blog.navLinks')}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{t('settings.blog.navLinksHint')}</p>
          <div className="mt-3 space-y-2">
            {nav.map((item, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="w-full shrink-0 sm:w-36"
                  placeholder={t('settings.blog.navLabel')}
                  value={item.label}
                  onChange={(e) => setNav(nav.map((n, j) => (j === i ? { ...n, label: e.target.value } : n)))}
                />
                <div className="min-w-0 flex-1">
                  <Input
                    placeholder={t('settings.blog.navHref')}
                    value={item.href}
                    onChange={(e) => setNav(nav.map((n, j) => (j === i ? { ...n, href: e.target.value } : n)))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 self-end text-danger sm:self-center"
                  onClick={() => setNav(nav.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          {nav.length < 8 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNav([...nav, { label: '', href: '' }])}>
              <Plus size={14} />
              {t('settings.blog.navAdd')}
            </Button>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => saveSite.mutate()} disabled={saveSite.isPending}>
            <Save size={14} />
            {t('common.save')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.blog.aboutPage')}>
        <div className="space-y-3">
          <Input
            placeholder={t('settings.blog.aboutTitle')}
            value={about.title}
            onChange={(e) => setAbout({ ...about, title: e.target.value })}
          />
          {/* 与文章编辑器同款：工具栏 + 服务端同管线实时预览（公开站 /page/about 用 markdown-it 渲染） */}
          <MarkdownField
            value={about.contentMd}
            onChange={(contentMd) => setAbout({ ...about, contentMd })}
            placeholder="Markdown…"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => saveAbout.mutate()} disabled={saveAbout.isPending}>
            <Save size={14} />
            {t('common.save')}
          </Button>
        </div>
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
