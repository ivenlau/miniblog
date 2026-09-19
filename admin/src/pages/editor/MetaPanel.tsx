import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Pin, Tag, X } from 'lucide-react'
import { slugFromTitle } from '../../lib/slug'
import { Button, Input, cn } from '../../components/ui'

export type Draft = {
  title: string
  slug: string
  summary: string
  contentMd: string
  coverUrl: string
  tags: string[]
  pinned: boolean
  slugEdited: boolean
}

/** 右侧文章设置：slug / 摘要 / 封面 / 标签 / 置顶 */
export function MetaPanel({
  draft,
  set,
  onPickCover,
}: {
  draft: Draft
  set: (patch: Partial<Draft>) => void
  onPickCover: () => void
}) {
  const { t } = useTranslation()
  const autoSlug = slugFromTitle(draft.title)

  return (
    <div className="space-y-4">
      {/* slug：自动派生可覆盖；与服务端 slugFromTitle 同规则 */}
      <div>
        <label className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
          <span>
            {t('editor.slug')}
            {!draft.slugEdited && autoSlug && (
              <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {t('editor.slugAuto')}
              </span>
            )}
          </span>
          {draft.slugEdited && (
            <button
              className="cursor-pointer hover:text-accent"
              onClick={() => set({ slugEdited: false, slug: autoSlug })}
            >
              {t('editor.slugAuto')}
            </button>
          )}
        </label>
        <Input
          value={draft.slug}
          placeholder={autoSlug || t('editor.slugHint')}
          onChange={(e) => set({ slug: e.target.value, slugEdited: true })}
        />
      </div>

      {/* 摘要（服务端截断到 300） */}
      <div>
        <label className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
          <span>{t('editor.summary')}</span>
          <span>{t('editor.summaryCount', { count: draft.summary.length })}</span>
        </label>
        <textarea
          value={draft.summary}
          onChange={(e) => set({ summary: e.target.value })}
          rows={3}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-text outline-none focus:border-accent"
        />
      </div>

      {/* 封面 */}
      <div>
        <label className="mb-1.5 block text-[12px] text-muted">{t('editor.cover')}</label>
        {draft.coverUrl ? (
          <div className="relative overflow-hidden rounded-xl border border-line">
            <img src={draft.coverUrl} alt={t('editor.cover')} className="aspect-[16/9] w-full object-cover" />
            <button
              onClick={() => set({ coverUrl: '' })}
              title={t('editor.coverClear')}
              className="absolute right-1.5 top-1.5 cursor-pointer rounded-lg bg-black/55 p-1.5 text-white hover:bg-black/75"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={onPickCover}
            className="flex aspect-[16/9] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <ImageIcon size={18} />
            <span className="text-[12px]">{t('editor.coverPick')}</span>
          </button>
        )}
      </div>

      {/* 标签 chips（服务端最多保留 10 个） */}
      <TagInput tags={draft.tags} onChange={(tags) => set({ tags })} />

      {/* 置顶 */}
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
        <button
          type="button"
          onClick={() => set({ pinned: !draft.pinned })}
          className={cn(
            'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
            draft.pinned ? 'bg-accent' : 'bg-surface3',
          )}
          aria-label={t('editor.pinned')}
        >
          <span
            className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', draft.pinned ? 'left-[18px]' : 'left-0.5')}
          />
        </button>
        <Pin size={13} />
        {t('editor.pinned')}
      </label>
    </div>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const merged = [...tags]
    for (const p of parts) {
      if (!merged.includes(p) && merged.length < 10) merged.push(p)
    }
    onChange(merged)
    setInput('')
  }

  return (
    <div>
      <label className="mb-1.5 block text-[12px] text-muted">{t('editor.tags')}</label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] text-accent">
            <Tag size={11} />
            {tag}
            <button
              onClick={() => onChange(tags.filter((x) => x !== tag))}
              className="cursor-pointer hover:opacity-70"
              aria-label={`${t('common.delete')}: ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault()
              commit(input)
            } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={() => commit(input)}
          placeholder={tags.length === 0 ? t('editor.tagsHint') : ''}
          className="min-w-20 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted/60"
        />
      </div>
      {tags.length >= 10 && <p className="mt-1 text-[11px] text-warn">{t('editor.tagsMax')}</p>}
    </div>
  )
}
