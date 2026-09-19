import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Input, Spinner, cn } from '../components/ui'
import { useToast } from '../state/toast'

const DEFS = [
  { id: 'reading-time', name: '阅读时长', desc: '文章元信息条显示预计阅读时间', config: [] as string[] },
  { id: 'toc', name: '目录', desc: '文首生成标题目录', config: [] as string[] },
  { id: 'highlight', name: '代码高亮', desc: 'highlight.js 客户端高亮', config: ['theme'] },
  { id: 'lightbox', name: '图片灯箱', desc: '点击图片放大（预留）', config: [] as string[] },
  { id: 'katex', name: '数学公式', desc: 'KaTeX 渲染（预留）', config: [] as string[] },
  { id: 'giscus', name: 'giscus 评论', desc: '基于 GitHub Discussions', config: ['repo', 'repoId', 'category', 'categoryId'] },
  { id: 'footer-links', name: '页脚链接', desc: '页脚自定义链接（预留）', config: [] as string[] },
]

type PluginConfig = { id: string; enabled: boolean; config?: Record<string, string> }

export function PluginsPage() {
  const toast = useToast()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/api/settings') })
  const [plugins, setPlugins] = useState<PluginConfig[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const data = settingsQuery.data as { plugins?: PluginConfig[] } | undefined
    if (data?.plugins && !loaded) {
      setPlugins(data.plugins)
      setLoaded(true)
    } else if (settingsQuery.data && !loaded) {
      setLoaded(true)
    }
  }, [settingsQuery.data, loaded])

  const save = async () => {
    await api.put('/api/settings', { plugins })
    toast('插件配置已保存，公开页即刻生效', 'success')
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
  const dirty = JSON.stringify(plugins) !== JSON.stringify(settingsQuery.data?.plugins ?? [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">插件</h1>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
          保存配置
        </Button>
      </div>
      <div className="space-y-2">
        {DEFS.map((def) => {
          const on = enabledOf(def.id)
          return (
            <div key={def.id} className={cn('rounded-2xl border border-line bg-surface p-4', on && 'border-accent/50')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{def.name}</p>
                  <p className="text-[12px] text-muted">{def.desc}</p>
                </div>
                <button
                  onClick={() => toggle(def.id)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
                    on ? 'bg-accent' : 'bg-surface3',
                  )}
                  aria-label={def.name}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                      on ? 'left-[22px]' : 'left-0.5',
                    )}
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
