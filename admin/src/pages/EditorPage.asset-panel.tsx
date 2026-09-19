import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import { api } from '../lib/api'
import type { AssetListItem } from '../lib/assets-types'
import { Button, Spinner, cn } from '../components/ui'
import { useToast } from '../state/toast'

/** 编辑器素材面板：上传图片（走网盘/本地素材层）并点击插入直链 */
export function AssetPanel({ onInsert }: { onInsert: (markdown: string) => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const listQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ items: AssetListItem[] }>('/api/assets?mime=image/%'),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const q = `?name=${encodeURIComponent(file.name)}&mime=${encodeURIComponent(file.type || 'application/octet-stream')}`
      return api.send<{ url: string }>('POST', `/api/upload${q}`, file)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assets'] }),
    onError: () => toast('上传失败', 'error'),
  })

  const insert = (asset: AssetListItem) => onInsert(`![${asset.name}](${asset.url})\n`)

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium">素材（点击插入）</span>
        <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={14} />
          上传图片
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) upload.mutate(f)
            e.target.value = ''
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {upload.isPending && (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-line">
            <Spinner size={16} />
          </div>
        )}
        {(listQuery.data?.items ?? []).map((asset) => (
          <button
            key={asset.id}
            onClick={() => insert(asset)}
            title={`${asset.name}（点击插入）`}
            className="group relative h-16 w-24 cursor-pointer overflow-hidden rounded-lg border border-line bg-surface2"
          >
            <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" loading="lazy" />
            <span
              className={cn(
                'absolute inset-0 hidden items-center justify-center bg-accent/70 text-[11px] text-white group-hover:flex',
              )}
            >
              插入
            </span>
          </button>
        ))}
        {listQuery.data?.items.length === 0 && (
          <p className="py-3 text-[12px] text-muted">还没有图片素材，上传后将自动生成直链。</p>
        )}
      </div>
    </div>
  )
}
