import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { isImageFile, listImages, MAX_UPLOAD, uploadImage } from '../../lib/assets'
import type { AssetListItem } from '../../lib/assets-types'
import { Button, Modal, Spinner, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

/**
 * 素材选择器（共享）：多选插入正文 / 单选封面。
 * 上传失败与超限走 toast，不阻塞其他文件。
 */
export function AssetPickerModal({
  open,
  multiple = true,
  onClose,
  onPick,
}: {
  open: boolean
  multiple?: boolean
  onClose: () => void
  onPick: (assets: AssetListItem[]) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(0)

  const listQuery = useQuery({ queryKey: ['assets'], queryFn: listImages, enabled: open })

  useEffect(() => {
    if (open) setSelected(new Set())
  }, [open])

  const upload = async (files: File[]) => {
    for (const f of files) {
      if (!isImageFile(f)) continue
      if (f.size > MAX_UPLOAD) {
        toast(t('errors.CONTENT_TOO_LARGE'), 'error')
        continue
      }
      setUploading((n) => n + 1)
      try {
        await uploadImage(f)
        await qc.invalidateQueries({ queryKey: ['assets'] })
      } catch {
        toast(t('editor.uploadFailed'), 'error')
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const toggle = (asset: AssetListItem) => {
    setSelected((prev) => {
      const next = new Set(multiple ? prev : [])
      if (!multiple) next.clear()
      if (next.has(asset.id)) next.delete(asset.id)
      else next.add(asset.id)
      return next
    })
  }

  const items = listQuery.data ?? []
  const picked = items.filter((a) => selected.has(a.id))

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      pinnedFooter
      title={t('editor.coverPick')}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-6">
          <p className="text-[12px] text-muted">{t('editor.pasteDropHint')}</p>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} />
            {uploading > 0 ? <Spinner size={13} /> : null}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size={20} />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">{t('posts.emptyHint')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((asset) => {
                const on = selected.has(asset.id)
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggle(asset)}
                    title={asset.name}
                    className={cn(
                      'relative aspect-[4/3] cursor-pointer overflow-hidden rounded-lg border-2 bg-surface2 transition-colors',
                      on ? 'border-accent' : 'border-transparent hover:border-line',
                    )}
                  >
                    <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" loading="lazy" />
                    {on && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
          <span className="text-[12px] text-muted">{picked.length > 0 ? `${picked.length} ✓` : ''}</span>
          <div className="flex gap-2.5">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={picked.length === 0}
              onClick={() => {
                onPick(picked)
                onClose()
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
