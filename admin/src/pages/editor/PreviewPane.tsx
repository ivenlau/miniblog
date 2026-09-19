import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { RenderedPost } from '../../lib/types'
import { useDebounced } from '../../hooks/useDebounced'
import { Spinner } from '../../components/ui'

/**
 * 实时预览：走服务端 POST /api/preview（markdown-it 管线），
 * 渲染结果与公开站完全一致；空内容不请求。
 */
export function PreviewPane({ contentMd, enabled }: { contentMd: string; enabled: boolean }) {
  const { t } = useTranslation()
  const debouncedMd = useDebounced(contentMd, 400)
  const empty = debouncedMd.trim() === ''

  const preview = useQuery({
    queryKey: ['preview', debouncedMd],
    queryFn: () => api.post<RenderedPost>('/api/preview', { contentMd: debouncedMd }),
    enabled: enabled && !empty,
    staleTime: Infinity,
    gcTime: 300_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  if (empty) {
    return <p className="px-1 py-10 text-center text-[13px] text-muted">{t('editor.tabPreview')}…</p>
  }
  if (preview.isFetching && !preview.data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={20} />
      </div>
    )
  }
  return (
    <article
      className="prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: preview.data?.html ?? '' }}
    />
  )
}
