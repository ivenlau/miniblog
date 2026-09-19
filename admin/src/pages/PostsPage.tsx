import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, PencilLine, Pin, Plus, Trash2 } from 'lucide-react'
import { ApiError, api } from '../lib/api'
import type { PostDto } from '../lib/types'
import { formatRelative } from '../lib/format'
import { Button, ConfirmDialog, EmptyState, SkeletonList, cn } from '../components/ui'
import { useToast } from '../state/toast'

type Filter = 'all' | 'draft' | 'published'

export function PostsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState<PostDto | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const listQuery = useQuery({
    queryKey: ['posts'],
    queryFn: () => api.get<{ items: PostDto[] }>('/api/posts'),
  })
  const all = listQuery.data?.items ?? []
  const items = filter === 'all' ? all : all.filter((p) => p.status === filter)

  const errText = (err: unknown) => t(`errors.${err instanceof ApiError ? err.code : 'UNKNOWN'}`)
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['posts'] })

  const setPublish = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'unpublish' }) =>
      api.post(`/api/posts/${id}/${action}`),
    onSuccess: invalidate,
    onError: (err) => toast(errText(err), 'error'),
  })
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/posts/${id}`),
    onSuccess: invalidate,
    onError: (err) => toast(errText(err), 'error'),
  })

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('posts.filterAll') },
    { key: 'draft', label: t('posts.filterDraft') },
    { key: 'published', label: t('posts.filterPublished') },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{t('posts.title')}</h1>
        <span className="text-[13px] text-muted">{t('posts.itemsCount', { count: all.length })}</span>
        <div className="flex-1" />
        <div className="flex rounded-xl border border-line bg-surface p-0.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                filter === key ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={() => navigate('/posts/new')}>
          <Plus size={15} />
          {t('posts.newPost')}
        </Button>
      </div>

      {listQuery.isLoading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title={t('posts.empty')} hint={t('posts.emptyHint')} />
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface2/60"
              onClick={() => navigate(`/posts/${p.id}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {p.pinned && <Pin size={13} className="shrink-0 text-accent" />}
                  {p.title || t('common.untitled')}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted">
                  /{p.slug}
                  {' · '}
                  <span className={p.status === 'published' ? 'text-emerald-600 dark:text-emerald-400' : 'text-warn'}>
                    {p.status === 'published' ? t('posts.published') : t('posts.draft')}
                  </span>
                  {' · '}
                  {t('posts.views', { count: p.views })}
                  {' · '}
                  {formatRelative(p.updatedAt, i18n.language)}
                  {p.tags.length > 0 && ` · ${p.tags.join(' / ')}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                {p.status === 'published' ? (
                  <Button size="sm" onClick={() => setPublish.mutate({ id: p.id, action: 'unpublish' })}>
                    {t('posts.toDraft')}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setPublish.mutate({ id: p.id, action: 'publish' })}>
                    {t('posts.publish')}
                  </Button>
                )}
                <Button variant="ghost" size="icon" title={t('common.preview')} onClick={() => navigate(`/posts/${p.id}`)}>
                  <PencilLine size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="text-danger" title={t('common.delete')} onClick={() => setDeleting(p)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t('posts.delete')}
        message={deleting ? t('posts.deleteConfirm', { title: deleting.title }) : ''}
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  )
}
