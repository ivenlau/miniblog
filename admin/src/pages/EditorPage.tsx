import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Save } from 'lucide-react'
import { api } from '../lib/api'
import type { PostDto } from '../lib/types'
import { Button, ConfirmDialog, Input, Spinner, cn } from '../components/ui'
import { AssetPanel } from './EditorPage.asset-panel'
import { useToast } from '../state/toast'

type Draft = {
  title: string
  slug: string
  summary: string
  contentMd: string
  coverUrl: string
  tags: string
  pinned: boolean
  slugEdited: boolean
}

const EMPTY: Draft = { title: '', slug: '', summary: '', contentMd: '', coverUrl: '', tags: '', pinned: false, slugEdited: false }

/** 文章编辑器：新建 / 编辑；预览走服务端同管线渲染 */
export function EditorPage() {
  const { id } = useParams()
  const isEdit = !!id && id !== 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saved, setSaved] = useState<Draft>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  useEffect(() => {
    if (!isEdit || !id) {
      setDraft(EMPTY)
      setSaved(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get<PostDto>(`/api/posts/${id}`)
      .then((p) => {
        const d: Draft = {
          title: p.title,
          slug: p.slug,
          summary: p.summary,
          contentMd: p.contentMd ?? '',
          coverUrl: p.coverUrl ?? '',
          tags: p.tags.join(', '),
          pinned: p.pinned,
          slugEdited: true,
        }
        setDraft(d)
        setSaved(d)
        setStatus(p.status)
        setLoading(false)
      })
      .catch(() => navigate('/admin/posts', { replace: true }))
  }, [id, isEdit, navigate])

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['posts'] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        title: draft.title,
        slug: draft.slug,
        summary: draft.summary,
        contentMd: draft.contentMd,
        coverUrl: draft.coverUrl || null,
        pinned: draft.pinned,
        tags: draft.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      }
      return isEdit && id ? { created: false, id, res: await api.put<PostDto>(`/api/posts/${id}`, body) } : { created: true, id: '', res: await api.post<PostDto>('/api/posts', body) }
    },
    onSuccess: (r) => {
      setSaved(draft)
      setStatus('draft')
      invalidate()
      toast('已保存', 'success')
      if (r.created && r.res) navigate(`/admin/posts/${r.res.id}`, { replace: true })
    },
    onError: () => toast('保存失败', 'error'),
  })

  const del = async () => {
    if (!isEdit || !id) return
    await api.del(`/api/posts/${id}`)
    invalidate()
    navigate('/admin/posts', { replace: true })
  }

  const doPreview = async () => {
    const res = await api.post<{ html: string }>('/api/preview', { contentMd: draft.contentMd })
    setPreviewHtml(res.html)
    setShowPreview(true)
  }

  const insertAsset = (markdown: string) => set({ contentMd: `${draft.contentMd}${draft.contentMd.endsWith('\n') || !draft.contentMd ? '' : '\n'}${markdown}` })

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/admin/posts')} className="cursor-pointer rounded-lg p-2 text-muted hover:bg-surface2">
          ←
        </button>
        <Input
          placeholder="文章标题"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold shadow-none"
          value={draft.title}
          onChange={(e) =>
            set({
              title: e.target.value,
              ...(draft.slugEdited
                ? {}
                : { slug: e.target.value.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() }),
            })
          }
        />
        <span className={cn('text-[12px]', dirty ? 'text-accent' : 'text-muted')}>{dirty ? '● 未保存' : '已保存'}</span>
        {status === 'published' && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] text-emerald-600">已发布</span>
        )}
        <Button size="sm" onClick={() => void doPreview()}>
          <Eye size={15} />
          预览
        </Button>
        <Button size="sm" variant="primary" disabled={!dirty || saveMutation.isPending || !draft.title} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Spinner size={14} /> : <Save size={15} />}
          保存
        </Button>
        {isEdit && (
          <Button size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
            删除
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input placeholder="slug（留空自动生成）" value={draft.slug} onChange={(e) => set({ slug: e.target.value, slugEdited: true })} />
          <Input placeholder="摘要" value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
          <Input placeholder="封面图直链" value={draft.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} />
          <Input placeholder="标签（逗号分隔）" value={draft.tags} onChange={(e) => set({ tags: e.target.value })} />
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={draft.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
            置顶
          </label>
          <textarea
            value={draft.contentMd}
            onChange={(e) => set({ contentMd: e.target.value })}
            placeholder="Markdown 正文…"
            spellCheck={false}
            className="h-[42dvh] w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[13.5px] leading-relaxed text-text outline-none focus:border-accent md:text-[13px]"
          />
          <AssetPanel onInsert={insertAsset} />
        </div>
        <div
          className={cn(
            'hidden max-h-[80dvh] overflow-y-auto rounded-xl border border-line bg-surface p-5 md:block',
            !showPreview && 'opacity-40',
          )}
          onClick={() => void doPreview()}
        >
          {previewHtml === null ? (
            <p className="text-[13px] text-muted">点击此处加载实时预览（服务端同管线渲染）。</p>
          ) : (
            <article className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="删除文章"
        message="将永久删除该文章（外链引用会失效），确认？"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void del()}
      />
    </div>
  )
}
