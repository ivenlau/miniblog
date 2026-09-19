import { useTranslation } from 'react-i18next'
import {
  Bold,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TextAreaState } from '../../lib/markdown-commands'
import { clearFormat, insertCodeBlock, insertLink, prefixLine, surround } from '../../lib/markdown-commands'
import { cn } from '../../components/ui'

export type EditorCmd = (state: TextAreaState) => TextAreaState

/**
 * Markdown 工具栏：标题 / 行内格式 / 列表 / 引用 / 代码 / 链接 / 图片 / 分隔线 / 清格式。
 * run 接收 textarea 状态并返回新状态；图片按钮由编辑器接管（打开素材选择器）。
 */
export function EditorToolbar({ run, onPickImage }: { run: (cmd: EditorCmd) => void; onPickImage: () => void }) {
  const { t } = useTranslation()

  const tools: { icon: LucideIcon; label: string; cmd?: EditorCmd; onClick?: () => void }[] = [
    { icon: Heading1, label: t('editor.toolbar.h1'), cmd: (s) => prefixLine(s, '# ') },
    { icon: Heading2, label: t('editor.toolbar.h2'), cmd: (s) => prefixLine(s, '## ') },
    { icon: Heading3, label: t('editor.toolbar.h3'), cmd: (s) => prefixLine(s, '### ') },
    { icon: Bold, label: t('editor.toolbar.bold'), cmd: (s) => surround(s, '**') },
    { icon: Italic, label: t('editor.toolbar.italic'), cmd: (s) => surround(s, '*') },
    { icon: Strikethrough, label: t('editor.toolbar.strike'), cmd: (s) => surround(s, '~~') },
    { icon: Quote, label: t('editor.toolbar.quote'), cmd: (s) => prefixLine(s, '> ') },
    { icon: List, label: t('editor.toolbar.ul'), cmd: (s) => prefixLine(s, '- ') },
    { icon: ListOrdered, label: t('editor.toolbar.ol'), cmd: (s) => prefixLine(s, '1. ', true) },
    { icon: Code, label: t('editor.toolbar.code'), cmd: (s) => surround(s, '`') },
    { icon: SquareCode, label: t('editor.toolbar.codeBlock'), cmd: insertCodeBlock },
    { icon: Link2, label: t('editor.toolbar.link'), cmd: insertLink },
    { icon: ImagePlus, label: t('editor.toolbar.image'), onClick: onPickImage },
    { icon: Minus, label: t('editor.toolbar.hr'), cmd: (s) => insertAtCursorHr(s) },
    { icon: Eraser, label: t('editor.toolbar.clear'), cmd: clearFormat },
  ]

  return (
    <div className="mb-scroll-x flex items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface px-1 py-1">
      {tools.map(({ icon: Icon, label, cmd, onClick }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(e) => e.preventDefault() /* 防止 textarea 失焦丢失选区 */}
          onClick={() => (onClick ? onClick() : cmd && run(cmd))}
          className={cn(
            'shrink-0 cursor-pointer rounded-lg p-2 text-muted transition-colors hover:bg-surface2 hover:text-text',
          )}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}

function insertAtCursorHr(state: TextAreaState) {
  const { value, selectionStart: s } = state
  const before = value.slice(0, s)
  const pad = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const snippet = `${pad}---\n\n`
  return { value: before + snippet + value.slice(s), selectionStart: s + snippet.length, selectionEnd: s + snippet.length }
}
