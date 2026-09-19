import { useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { isImageFile, listImages, MAX_UPLOAD } from '../../lib/assets'
import { Button, Spinner, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

/**
 * 编辑器素材面板：图片网格，点击插入正文（插入位置由编辑器决定，在光标处）。
 * 上传统一由编辑器的 uploadAndInsert 处理（面板只负责触发选择文件）。
 */
export function AssetPanel({
  onUpload,
  onInsert,
}: {
  onUpload: (file: File) => void
  onInsert: (markdown: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const listQuery = useQuery({ queryKey: ['assets'], queryFn: listImages })

  const pick = (files: File[]) => {
    for (const f of files) {
      if (!isImageFile(f)) continue
      if (f.size > MAX_UPLOAD) {
        toast(t('errors.CONTENT_TOO_LARGE'), 'error')
        continue
      }
      onUpload(f)
    }
    void qc.invalidateQueries({ queryKey: ['assets'] })
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">{t('editor.pasteDropHint')}</h3>
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={14} />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            pick(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {listQuery.isLoading && (
          <div className="col-span-3 flex justify-center py-4">
            <Spinner size={16} />
          </div>
        )}
        {(listQuery.data ?? []).map((asset) => (
          <button
            key={asset.id}
            onClick={() => onInsert(`![${asset.name}](${asset.url})`)}
            title={`${asset.name} · ${t('editor.toolbar.image')}`}
            className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-lg border border-line bg-surface2"
          >
            <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" loading="lazy" />
            <span
              className={cn(
                'absolute inset-0 hidden items-center justify-center bg-accent/70 text-[11px] text-white group-hover:flex',
              )}
            >
              {t('common.confirm')}
            </span>
          </button>
        ))}
        {listQuery.data?.length === 0 && (
          <p className="col-span-3 py-3 text-center text-[12px] text-muted">{t('editor.pasteDropHint')}</p>
        )}
      </div>
    </section>
  )
}
