import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, ExternalLink, FileText, PenLine, Plus, Tag } from 'lucide-react'
import { api } from '../lib/api'
import { useAdminShell } from '../layout/AdminShell'
import type { PostDto } from '../lib/types'
import { formatCount, formatNumber, formatRelative } from '../lib/format'
import { Button, EmptyState, SkeletonList, cn } from '../components/ui'

/** 概览：统计 + 最近编辑 + 快捷入口（数据全部来自 GET /api/posts，无独立端点） */
export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { me } = useAdminShell()

  const listQuery = useQuery({
    queryKey: ['posts'],
    queryFn: () => api.get<{ items: PostDto[] }>('/api/posts'),
  })
  const items = listQuery.data?.items ?? []
  const published = items.filter((p) => p.status === 'published').length
  const drafts = items.length - published
  const views = items.reduce((sum, p) => sum + p.views, 0)

  const tagCounts = new Map<string, number>()
  for (const p of items) for (const tag of p.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">
          {t('dashboard.greeting')}{me.displayName ? `，${me.displayName}` : ''}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{me.email}</p>
      </div>

      {listQuery.isLoading ? (
        <SkeletonList rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={<PenLine size={26} />} title={t('dashboard.empty')}>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Stat icon={<FileText size={16} />} label={t('dashboard.totalPosts', { count: items.length })} />
            <Stat icon={<PenLine size={16} />} label={`${t('dashboard.published')} · ${formatNumber(published, i18n.language)}`} />
            <Stat icon={<FileText size={16} />} label={`${t('dashboard.drafts')} · ${formatNumber(drafts, i18n.language)}`} />
            <Stat icon={<Eye size={16} />} label={`${t('dashboard.totalViews')} · ${formatCount(views, i18n.language)}`} />
          </div>

          {topTags.length > 0 && (
            <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <h2 className="mb-3 text-[15px] font-semibold">{t('dashboard.topTags')}</h2>
              <div className="flex flex-wrap gap-1.5">
                {topTags.map(([tag, count]) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-[12.5px] text-text"
                  >
                    <Tag size={12} className="text-muted" />
                    {tag}
                    <span className="text-[11px] text-muted">{count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{t('dashboard.recent')}</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/posts/new')}>
                <Plus size={14} />
                {t('dashboard.newPost')}
              </Button>
            </div>
            <div className="divide-y divide-line">
              {items.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/posts/${p.id}`)}
                  className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.pinned && <span title={t('posts.pinned')}>📌 </span>}
                      {p.title || t('common.untitled')}
                    </p>
                    <p className="text-[12px] text-muted">
                      {p.status === 'published' ? t('posts.published') : t('posts.draft')}
                      {' · '}
                      {formatRelative(p.updatedAt, i18n.language)}
                    </p>
                  </div>
                  <Eye size={14} className={cn('shrink-0', p.views === 0 ? 'text-surface3' : 'text-muted')} />
                </button>
              ))}
            </div>
          </section>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button variant="primary" onClick={() => navigate('/posts/new')}>
              <Plus size={16} />
              {t('dashboard.newPost')}
            </Button>
            <Button onClick={() => window.open('/', '_blank')}>
              <ExternalLink size={15} />
              {t('dashboard.openSite')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 truncate text-[13px] font-medium">{label}</span>
    </div>
  )
}
