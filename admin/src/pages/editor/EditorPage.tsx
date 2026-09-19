import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, ExternalLink, RotateCw, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import type { PostDto } from '../../lib/types'
import { isImageFile, uploadImage } from '../../lib/assets'
import type { EditorCmd } from './EditorToolbar'
import { EditorToolbar } from './EditorToolbar'
import { PreviewPane } from './PreviewPane'
import { MetaPanel } from './MetaPanel'
import type { Draft } from './MetaPanel'
import { AssetPanel } from './AssetPanel'
import { AssetPickerModal } from './AssetPickerModal'
import { insertAtCursor, insertLink, surround } from '../../lib/markdown-commands'
import { useDirtyGuard } from '../../hooks/useDirtyGuard'
import { useAutosave } from '../../hooks/useAutosave'
import { formatDate } from '../../lib/format'
import { Button, ConfirmDialog, Input, SkeletonList, Spinner, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

const EMPTY: Draft = {
  title: '',
  slug: '',
  summary: '',
  contentMd: '',
  coverUrl: '',
  tags: [],
  pinned: false,
  slugEdited: false,
}

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

function draftOf(p: PostDto): Draft {
  return {
    title: p.title,
    slug: p.slug,
    summary: p.summary,
    contentMd: p.contentMd ?? '',
    coverUrl: p.coverUrl ?? '',
    tags: p.tags,
    pinned: p.pinned,
    slugEdited: true,
  }
}

/** 字数：CJK 字符逐字计，拉丁按词计 */
function countWords(md: string): number {
  const m = md.trim().match(/[\w'’-]+|[一-龥]/g)
  return m ? m.length : 0
}

/**
 * 文章编辑器：Markdown 源 + 工具栏 + 服务端同管线实时预览 + 自动保存 + 脏守卫。
 * 新建文章首次保存后落库并替换路由到 /posts/:id。
 */
export function EditorPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saved, setSaved] = useState<Draft>(EMPTY)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(!!id)
  const [view, setView] = useState<'write' | 'preview'>('write') // 移动端写作/预览切换
  const [showMeta, setShowMeta] = useState(false) // 移动端文章设置开关
  const [picker, setPicker] = useState<null | 'insert' | 'cover'>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const createdIdRef = useRef<string | null>(null)
  // 保存后跳转 / 删除后返回时临时放行脏守卫（blocker 函数在导航瞬间同步求值，
  // 此时 setSaved 引发的重渲染尚未发生，必须用 ref）
  const skipNavRef = useRef(false)
  const postId = id ?? createdIdRef.current

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), [])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  // ---------------------------------------------------------------- 加载
  useEffect(() => {
    if (!id) {
      setDraft(EMPTY)
      setSaved(EMPTY)
      setStatus('draft')
      setSlug('')
      setLoading(false)
      createdIdRef.current = null
      return
    }
    if (createdIdRef.current === id) return // 刚创建跳转而来，本地已是最新，避免回载覆盖
    setLoading(true)
    api
      .get<PostDto>(`/api/posts/${id}`)
      .then((p) => {
        const d = draftOf(p)
        setDraft(d)
        setSaved(d)
        setStatus(p.status)
        setSlug(p.slug)
        setLoading(false)
      })
      .catch(() => {
        toast(t('errors.POST_NOT_FOUND'), 'error')
        navigate('/posts', { replace: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---------------------------------------------------------------- 保存 / 发布 / 删除
  const buildBody = (d: Draft) => ({
    title: d.title,
    slug: d.slug,
    summary: d.summary,
    contentMd: d.contentMd,
    coverUrl: d.coverUrl || null,
    pinned: d.pinned,
    tags: d.tags,
  })

  /** 保存并返回文章 id（新建时创建后放行守卫并替换路由） */
  const save = useCallback(async (): Promise<string> => {
    const snapshot = draft
    if (id) {
      const res = await api.put<PostDto>(`/api/posts/${id}`, buildBody(snapshot))
      setSaved(snapshot)
      setSlug(res.slug)
      return id
    }
    const res = await api.post<PostDto>('/api/posts', buildBody(snapshot))
    createdIdRef.current = res.id
    setSaved(snapshot)
    setSlug(res.slug)
    skipNavRef.current = true
    navigate(`/posts/${res.id}`, { replace: true })
    return res.id
  }, [draft, id, navigate])

  const autosave = useAutosave({
    dirty: dirty && !!draft.title.trim(),
    enabled: !!postId,
    save,
  })

  const saveNow = async () => {
    if (!draft.title.trim()) {
      toast(t('errors.TITLE_REQUIRED'), 'error')
      return
    }
    autosave.markSaving()
    try {
      await save()
      autosave.markSaved()
      void qc.invalidateQueries({ queryKey: ['posts'] })
      toast(t('common.saved'), 'success')
    } catch (err) {
      autosave.markError()
      toast(t(`errors.${errCode(err)}`), 'error')
    }
  }

  // 发布/撤回作用于库中的行，必须先保存本地修改
  const publish = async (action: 'publish' | 'unpublish') => {
    try {
      const pid = await save()
      await api.post(`/api/posts/${pid}/${action}`)
      setStatus(action === 'publish' ? 'published' : 'draft')
      void qc.invalidateQueries({ queryKey: ['posts'] })
    } catch (err) {
      toast(t(`errors.${errCode(err)}`), 'error')
    }
  }

  const del = useMutation({
    mutationFn: () => api.del(`/api/posts/${id}`),
    onSuccess: () => {
      skipNavRef.current = true
      void qc.invalidateQueries({ queryKey: ['posts'] })
      navigate('/posts', { replace: true })
    },
    onError: (err) => toast(t(`errors.${errCode(err)}`), 'error'),
  })

  // 编程式放行后复位（路由稳定后恢复脏守卫）
  useEffect(() => {
    skipNavRef.current = false
  }, [id])

  const { blocked, discard, stay } = useDirtyGuard(() => !skipNavRef.current && dirty)

  // ---------------------------------------------------------------- 工具栏命令与快捷键
  const applyCmd = useCallback(
    (cmd: EditorCmd) => {
      const el = taRef.current
      if (!el) return
      const next = cmd({ value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd })
      set({ contentMd: next.value })
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(next.selectionStart, next.selectionEnd)
      })
    },
    [set],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    if (k === 'b') {
      e.preventDefault()
      applyCmd((s) => surround(s, '**'))
    } else if (k === 'i') {
      e.preventDefault()
      applyCmd((s) => surround(s, '*'))
    } else if (k === 'k') {
      e.preventDefault()
      applyCmd(insertLink)
    } else if (k === 's') {
      e.preventDefault()
      void saveNow()
    }
  }

  // ---------------------------------------------------------------- 图片：粘贴 / 拖拽 / 素材库，统一插入到光标处
  const uploadAndInsert = async (file: File) => {
    if (!isImageFile(file)) return
    try {
      const res = await uploadImage(file)
      applyCmd((s) => insertAtCursor(s, `![${file.name}](${res.url})`))
      void qc.invalidateQueries({ queryKey: ['assets'] })
    } catch (err) {
      toast(t(`errors.${errCode(err)}`), 'error')
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files ?? []).filter(isImageFile)
    if (files.length === 0) return
    e.preventDefault()
    for (const f of files) void uploadAndInsert(f)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files ?? []).filter(isImageFile)
    for (const f of files) void uploadAndInsert(f)
  }

  const previewEnabled = view === 'preview'

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <SkeletonList rows={6} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-5">
      {/* 头部：返回 / 标题 / 状态 / 保存指示 / 操作 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" title={t('common.back')} onClick={() => navigate('/posts')}>
          <ArrowLeft size={17} />
        </Button>
        <Input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t('editor.titlePlaceholder')}
          className="h-11 min-w-40 flex-1 border-0 bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
            status === 'published' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-surface2 text-muted',
          )}
        >
          {status === 'published' ? t('editor.statusPublished') : t('editor.statusDraft')}
        </span>
        <SaveIndicator state={autosave.state} onRetry={() => void saveNow()} />

        <div className="flex shrink-0 items-center gap-1.5">
          {/* 写作/预览切换（全端一致，宽度留给编辑器） */}
          <div className="flex rounded-xl border border-line bg-surface p-0.5">
            {(['write', 'preview'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] transition-colors',
                  view === v ? 'bg-accent-soft font-medium text-accent' : 'text-muted',
                )}
              >
                {v === 'write' ? t('editor.tabWrite') : t('editor.tabPreview')}
              </button>
            ))}
          </div>
          <Button
            variant={showMeta ? 'accentSoft' : 'ghost'}
            size="icon"
            title={t('editor.meta')}
            onClick={() => setShowMeta((v) => !v)}
          >
            <SlidersHorizontal size={16} />
          </Button>

          {status === 'published' && slug && (
            <Button variant="ghost" size="sm" onClick={() => window.open(`/post/${slug}`, '_blank')}>
              <ExternalLink size={14} />
              <span className="hidden md:inline">{t('editor.viewPublic')}</span>
            </Button>
          )}
          {status === 'published' ? (
            <Button variant="ghost" size="sm" onClick={() => void publish('unpublish')}>
              {t('editor.unpublish')}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void publish('publish')}>
              {t('editor.publish')}
            </Button>
          )}
          <Button size="sm" disabled={!dirty || !draft.title.trim()} onClick={() => void saveNow()}>
            {autosave.state.phase === 'saving' ? <Spinner size={13} /> : <Save size={14} />}
            {t('common.save')}
          </Button>
          {id && (
            <Button variant="ghost" size="icon" className="text-danger" title={t('common.delete')} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </Button>
          )}
        </div>
      </div>

      <div className={cn('grid gap-4', showMeta && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        {/* 编辑/预览（单栏全宽，切换展示） */}
        <div className="min-w-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <EditorToolbar run={applyCmd} onPickImage={() => setPicker('insert')} />
            </div>
            <span className="hidden shrink-0 text-[11.5px] text-muted md:block">
              {t('editor.words', { count: countWords(draft.contentMd) })}
            </span>
          </div>

          <div className="relative">
            <textarea
              ref={taRef}
              value={draft.contentMd}
              onChange={(e) => set({ contentMd: e.target.value })}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              placeholder="# Markdown"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={cn(
                'h-[52dvh] w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[16px] leading-relaxed text-text outline-none focus:border-accent md:text-[13.5px] lg:h-[calc(100dvh-15rem)]',
                view === 'preview' && 'hidden',
                dragging && 'border-accent ring-2 ring-accent/25',
              )}
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <span className="rounded-xl bg-accent-soft px-4 py-2 text-[13px] text-accent shadow-pop">
                  {t('editor.pasteDropHint')}
                </span>
              </div>
            )}
            {view === 'preview' && (
              <div className="min-h-0 h-[52dvh] overflow-y-auto rounded-xl border border-line bg-surface p-4 lg:h-[calc(100dvh-15rem)]">
                <PreviewPane contentMd={draft.contentMd} enabled={previewEnabled} />
              </div>
            )}
          </div>
        </div>

        {/* 文章设置 + 素材：开关控制；桌面端开启时作为右侧栏 */}
        {showMeta && (
          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-[13px] font-semibold">{t('editor.meta')}</h3>
              <MetaPanel draft={draft} set={set} onPickCover={() => setPicker('cover')} />
            </section>
            <AssetPanel onUpload={(f) => void uploadAndInsert(f)} onInsert={(md) => applyCmd((s) => insertAtCursor(s, md))} />
          </aside>
        )}
      </div>

      {/* 素材选择器：插入正文（多选）/ 选封面（单选） */}
      {picker && (
        <AssetPickerModal
          open
          multiple={picker === 'insert'}
          onClose={() => setPicker(null)}
          onPick={(assets) => {
            if (picker === 'cover') {
              if (assets[0]) set({ coverUrl: assets[0].url })
            } else {
              const md = assets.map((a) => `![${a.name}](${a.url})`).join('\n')
              applyCmd((s) => insertAtCursor(s, md))
            }
          }}
        />
      )}

      {/* 脏守卫：应用内导航被拦截时确认 */}
      <ConfirmDialog
        open={blocked}
        title={t('editor.leaveTitle')}
        message={t('editor.leaveMessage')}
        danger
        cancelLabel={t('editor.stay')}
        confirmLabel={t('editor.leave')}
        onClose={stay}
        onConfirm={discard}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('editor.deletePost')}
        message={t('editor.deleteConfirm')}
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => id && del.mutate()}
      />
    </div>
  )
}

function SaveIndicator({
  state,
  onRetry,
}: {
  state: { phase: 'idle' | 'saving' | 'saved' | 'error'; savedAt: number | null }
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()
  if (state.phase === 'saving') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
        <Spinner size={12} />
        {t('editor.autosaveSaving')}
      </span>
    )
  }
  if (state.phase === 'error') {
    return (
      <button onClick={onRetry} className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-danger hover:opacity-80">
        <RotateCw size={12} />
        {t('editor.autosaveFailed')}
      </button>
    )
  }
  if (state.phase === 'saved' && state.savedAt) {
    return (
      <span className="hidden shrink-0 items-center gap-1 text-[12px] text-muted md:flex">
        <Check size={12} className="text-accent" />
        {t('editor.autosaveSaved', { time: formatDate(state.savedAt, i18n.language) })}
      </span>
    )
  }
  return null
}
