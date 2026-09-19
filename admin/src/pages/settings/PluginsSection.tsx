import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../../lib/api'
import type { PluginConfig } from '../../lib/types'
import { Button, Input, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

/** 插件定义（与服务端 server/plugins/registry.ts 对应；标记 reserved 的为预留位） */
const DEFS = [
  { id: 'reading-time', nameKey: 'plugins.items.reading-time.name', descKey: 'plugins.items.reading-time.desc', config: [] as string[] },
  { id: 'toc', nameKey: 'plugins.items.toc.name', descKey: 'plugins.items.toc.desc', config: [] as string[] },
  { id: 'highlight', nameKey: 'plugins.items.highlight.name', descKey: 'plugins.items.highlight.desc', config: ['theme'] },
  { id: 'lightbox', nameKey: 'plugins.items.lightbox.name', descKey: 'plugins.items.lightbox.desc', config: [] as string[] },
  { id: 'katex', nameKey: 'plugins.items.katex.name', descKey: 'plugins.items.katex.desc', config: ['cdn'] },
  { id: 'giscus', nameKey: 'plugins.items.giscus.name', descKey: 'plugins.items.giscus.desc', config: ['repo', 'repoId', 'category', 'categoryId'] },
  { id: 'footer-links', nameKey: 'plugins.items.footer-links.name', descKey: 'plugins.items.footer-links.desc', config: ['links'] },
] as const

/** 插件：声明式启停 + 配置（写 blog_settings.plugins，公开站即时生效） */
export function PluginsSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/api/settings') })
  const [plugins, setPlugins] = useState<PluginConfig[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    const data = settingsQuery.data as { plugins?: PluginConfig[] } | undefined
    if (!data) return
    setPlugins(data.plugins ?? [])
    setLoaded(true)
  }, [settingsQuery.data, loaded])

  const errText = (err: unknown) => t(`errors.${errCode(err)}`)

  const save = async () => {
    try {
      await api.put('/api/settings', { plugins })
      toast(t('plugins.saved'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }
  const toggle = (id: string) => {
    setPlugins((prev) => {
      const existing = prev.find((p) => p.id === id)
      if (existing) return prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
      return [...prev, { id, enabled: true, config: {} }]
    })
  }
  const setConfig = (id: string, key: string, value: string) => {
    setPlugins((prev) => {
      const existing = prev.find((p) => p.id === id)
      if (!existing) return [...prev, { id, enabled: true, config: { [key]: value } }]
      return prev.map((p) => (p.id === id ? { ...p, config: { ...(p.config ?? {}), [key]: value } } : p))
    })
  }
  const confOf = (id: string): Record<string, string> => plugins.find((p) => p.id === id)?.config ?? {}
  const enabledOf = (id: string): boolean => plugins.find((p) => p.id === id)?.enabled ?? false
  const dirty = JSON.stringify(plugins) !== JSON.stringify((settingsQuery.data as { plugins?: PluginConfig[] })?.plugins ?? [])

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void save()}>
          {t('plugins.save')}
        </Button>
      </div>
      <div className="space-y-2">
        {DEFS.map((def) => {
          const on = enabledOf(def.id)
          return (
            <div key={def.id} className={cn('rounded-2xl border border-line bg-surface p-4', on && 'border-accent/50')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(def.nameKey)}</p>
                  <p className="text-[12px] text-muted">{t(def.descKey)}</p>
                </div>
                <button
                  onClick={() => toggle(def.id)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
                    on ? 'bg-accent' : 'bg-surface3',
                  )}
                  aria-label={t(def.nameKey)}
                >
                  <span
                    className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')}
                  />
                </button>
              </div>
              {on && def.config.length > 0 && (
                <div className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-2">
                  {def.config.map((key) => (
                    <Input
                      key={key}
                      placeholder={key}
                      value={confOf(def.id)[key] ?? ''}
                      onChange={(e) => setConfig(def.id, key, e.target.value)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
