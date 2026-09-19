import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isImageFile, uploadImage } from '../lib/assets'
import { insertAtCursor, insertLink, surround } from '../lib/markdown-commands'
import type { EditorCmd } from '../pages/editor/EditorToolbar'
import { EditorToolbar } from '../pages/editor/EditorToolbar'
import { PreviewPane } from '../pages/editor/PreviewPane'
import { AssetPickerModal } from '../pages/editor/AssetPickerModal'
import { ApiError } from '../lib/api'
import { cn } from './ui'
import { useToast } from '../state/toast'

/**
 * 自包含 Markdown 编辑域：工具栏 + 服务端同管线实时预览 + 图片粘贴/拖拽/素材库（光标处插入）。
 * 文章编辑器之外的场景复用（关于页等）。
 */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  heightClass = 'h-[42dvh]',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  heightClass?: string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const [picker, setPicker] = useState(false)
  const [dragging, setDragging] = useState(false)

  const errText = (err: unknown) => t(`errors.${err instanceof ApiError ? err.code : 'UNKNOWN'}`)

  const applyCmd = useCallback(
    (cmd: EditorCmd) => {
      const el = taRef.current
      if (!el) return
      const next = cmd({ value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd })
      onChange(next.value)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(next.selectionStart, next.selectionEnd)
      })
    },
    [onChange],
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
    }
  }

  const uploadAndInsert = async (file: File) => {
    if (!isImageFile(file)) return
    try {
      const res = await uploadImage(file)
      applyCmd((s) => insertAtCursor(s, `![${file.name}](${res.url})`))
    } catch (err) {
      toast(errText(err), 'error')
    }
  }

  const previewEnabled = view === 'preview'

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <EditorToolbar run={applyCmd} onPickImage={() => setPicker(true)} />
        </div>
        <div className="flex shrink-0 rounded-xl border border-line bg-surface p-0.5">
          {(['write', 'preview'] as const).map((v) => (
            <button
              key={v}
              type="button"
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
      </div>

      <div className="relative">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files ?? []).filter(isImageFile)
            if (files.length === 0) return
            e.preventDefault()
            for (const f of files) void uploadAndInsert(f)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            for (const f of Array.from(e.dataTransfer.files ?? []).filter(isImageFile)) void uploadAndInsert(f)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          className={cn(
            `${heightClass} w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[16px] leading-relaxed text-text outline-none focus:border-accent md:text-[13.5px]`,
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
          <div className={cn('min-h-0 overflow-y-auto rounded-xl border border-line bg-surface p-4', heightClass)}>
            <PreviewPane contentMd={value} enabled={previewEnabled} />
          </div>
        )}
      </div>

      {picker && (
        <AssetPickerModal
          open
          multiple
          onClose={() => setPicker(false)}
          onPick={(assets) => {
            const md = assets.map((a) => `![${a.name}](${a.url})`).join('\n')
            applyCmd((s) => insertAtCursor(s, md))
          }}
        />
      )}
    </div>
  )
}
