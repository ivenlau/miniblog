import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import type { PostDto } from '../lib/types'
import { Button, ConfirmDialog, Spinner, cn } from '../components/ui'
import { useState } from 'react'

export function PostsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState<PostDto | null>(null)

  const listQuery = useQuery({
    queryKey: ['posts'],
    queryFn: () => api.get<{ items: PostDto[] }>('/api/posts'),
  })
  const items = listQuery.data?.items ?? []

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['posts'] })

  const setPublish = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'unpublish' }) =>
      api.post(`/api/posts/${id}/${action}`),
    onSuccess: invalidate,
  })
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/posts/${id}`),
    onSuccess: invalidate,
  })

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">文章</h1>
        <Button variant="primary" size="sm" onClick={() => navigate('/admin/posts/new')}>
          <Plus size={15} />
          新建文章
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={22} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-muted">
          还没有文章，点右上角「新建文章」开始写作。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface2/60"
              onClick={() => navigate(`/admin/posts/${p.id}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {p.pinned && <span title="置顶">📌</span>}
                  {p.title}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  /{p.slug} ·{' '}
                  {p.status === 'published' ? (
                    <span className="text-emerald-600">已发布</span>
                  ) : (
                    <span className="text-amber-600">草稿</span>
                  )}{' '}
                  · {p.views} 次浏览
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                {p.status === 'published' ? (
                  <Button size="sm" onClick={() => setPublish.mutate({ id: p.id, action: 'unpublish' })}>
                    转草稿
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setPublish.mutate({ id: p.id, action: 'publish' })}>
                    发布
                  </Button>
                )}
                <Button size="sm" className="text-danger" onClick={() => setDeleting(p)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="删除文章"
        message={deleting ? `「${deleting.title}」将被永久删除（外链引用会失效），确认？` : ''}
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  )
}
