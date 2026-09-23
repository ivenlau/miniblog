import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RotateCcw, Save } from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import type { FontId, ThemeSettings } from '../../lib/types'
import { Button, Spinner, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

const THEME_CARDS = [
  { id: 'magazine', nameKey: 'settings.theme.magazine', descKey: 'settings.theme.magazineDesc', accent: '#5b5bd6', radius: 12, width: 46, font: 'sans' as const, fontSize: 16, dark: false },
  { id: 'classic', nameKey: 'settings.theme.classic', descKey: 'settings.theme.classicDesc', accent: '#8a6d3b', radius: 6, width: 42, font: 'serif' as const, fontSize: 17, dark: false },
  { id: 'gallery', nameKey: 'settings.theme.gallery', descKey: 'settings.theme.galleryDesc', accent: '#0e7490', radius: 16, width: 60, font: 'sans' as const, fontSize: 16, dark: true },
] as const

const ACCENT_PRESETS = ['#5b5bd6', '#0e7490', '#8a6d3b', '#dc2626', '#059669', '#d97706', '#db2777', '#475569']
const RADIUS_STEPS = [0, 6, 12, 16, 24]
/* 版心宽度 / 正文字号滑块量程 */
const WIDTH_MIN = 36
const WIDTH_MAX = 120
const FONTSIZE_MIN = 14
const FONTSIZE_MAX = 20
const FONTSIZE_STEP = 0.5

/* 与 server/render/themes/registry.tsx 的 FONT_STACKS 逐字保持一致 */
const FONT_STACKS: Record<FontId, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'WenQuanYi Micro Hei', sans-serif",
  serif: "'Songti SC', 'STSong', 'SimSun', Georgia, 'Noto Serif SC', 'Noto Serif CJK SC', serif",
  kai: "'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'AR PL UKai CN', 'AR PL UKai TW', 'Noto Serif CJK SC', serif",
  fangsong: "'Fangsong SC', 'STFangsong', 'FangSong', 'FangSong_GB2312', 'Noto Serif CJK SC', serif",
  round: "'Yuanti SC', 'Yuanti TC', 'Hiragino Maru Gothic ProN', 'YouYuan', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Cascadia Mono', 'Liberation Mono', 'Courier New', monospace",
}
const FONT_IDS = Object.keys(FONT_STACKS) as FontId[]
const FONT_LABEL_KEYS: Record<FontId, string> = {
  sans: 'settings.theme.fontSans',
  serif: 'settings.theme.fontSerif',
  kai: 'settings.theme.fontKai',
  fangsong: 'settings.theme.fontFangsong',
  round: 'settings.theme.fontRound',
  mono: 'settings.theme.fontMono',
}

type Tokens = ThemeSettings['tokens']

/**
 * 博客主题（公开站）：主题卡（缩略图）+ Design Tokens 定制 + CSS 模拟实时预览。
 * 预览用未保存的 token 即时渲染，保存后才影响公开站。
 */
export function ThemeSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/api/settings') })
  const [theme, setTheme] = useState<ThemeSettings>({ mode: 'builtin', id: 'magazine', tokens: {} })
  const [loaded, setLoaded] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  useEffect(() => {
    const data = settingsQuery.data as { theme?: ThemeSettings } | undefined
    if (data?.theme && !loaded) {
      setTheme(data.theme)
      setLoaded(true)
    }
  }, [settingsQuery.data, loaded])

  const errText = (err: unknown) => t(`errors.${errCode(err)}`)
  const saveTheme = useMutation({
    mutationFn: () => api.put('/api/settings', { theme }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      toast(t('settings.theme.saved'), 'success')
    },
    onError: (err) => toast(errText(err), 'error'),
  })

  if (settingsQuery.isLoading) return <Spinner />

  const activeCard = THEME_CARDS.find((c) => c.id === theme.id) ?? THEME_CARDS[0]
  const customized = JSON.stringify(theme.tokens) !== '{}'
  const setTokens = (patch: Partial<Tokens>) => setTheme({ ...theme, tokens: { ...theme.tokens, ...patch } })

  return (
    <div>
      {/* 主题卡（缩略图） */}
      <div className="grid gap-2 sm:grid-cols-3">
        {THEME_CARDS.map((c) => (
          <button
            key={c.id}
            onClick={() => setTheme({ ...theme, mode: 'builtin', id: c.id })}
            className={cn(
              'cursor-pointer rounded-xl border p-2.5 text-left transition-colors',
              theme.id === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface2',
            )}
          >
            <ThemeThumb card={c} />
            <p className={cn('mt-2 px-0.5 text-[13.5px] font-medium', theme.id === c.id ? 'text-accent' : 'text-text')}>
              {t(c.nameKey)}
            </p>
            <p className="mb-0.5 px-0.5 text-[12px] text-muted">{t(c.descKey)}</p>
          </button>
        ))}
      </div>

      {/* 实时预览（未保存 token 即时生效） */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{t('settings.theme.livePreview')}</h2>
          <div className="flex rounded-lg border border-line p-0.5">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={cn(
                  'cursor-pointer rounded-md px-2.5 py-1 text-[12px] transition-colors',
                  device === d ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-text',
                )}
              >
                {d === 'desktop' ? t('settings.theme.deviceDesktop') : t('settings.theme.deviceMobile')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center overflow-x-auto rounded-xl bg-surface2 p-3 md:p-4">
          <ThemePreview tokens={{ ...theme.tokens, id: theme.id }} device={device} />
        </div>
      </section>

      {/* 定制 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">{t('settings.theme.customize')}</h2>
          {customized && (
            <>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                {t('settings.theme.customized')}
              </span>
              <button
                onClick={() => setTheme({ ...theme, tokens: {} })}
                className="ml-auto flex cursor-pointer items-center gap-1 text-[12.5px] text-muted hover:text-accent"
              >
                <RotateCcw size={12} />
                {t('settings.theme.reset')}
              </button>
            </>
          )}
        </div>

        {/* 强调色 */}
        <Field label={t('settings.theme.accent')}>
          <div className="flex flex-wrap items-center gap-1.5">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setTokens({ accent: c })}
                title={c}
                className={cn(
                  'h-7 w-7 cursor-pointer rounded-full border-2 transition-transform hover:scale-110',
                  (theme.tokens.accent ?? '') === c ? 'border-accent' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={theme.tokens.accent ?? activeCard.accent}
              onChange={(e) => setTokens({ accent: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded-md border border-line bg-surface"
              title={t('settings.theme.accentCustom')}
            />
            {theme.tokens.accent && (
              <button
                onClick={() => {
                  const { accent: _drop, ...rest } = theme.tokens
                  setTheme({ ...theme, tokens: rest })
                }}
                className="cursor-pointer text-[12px] text-muted hover:text-accent"
              >
                {t('settings.theme.accentDefault')}
              </button>
            )}
          </div>
        </Field>

        {/* 圆角 */}
        <Field label={t('settings.theme.radiusLabel')}>
          <Segmented
            value={theme.tokens.radius ?? activeCard.radius}
            options={RADIUS_STEPS.map((v, i) => ({
              value: v,
              label: t(['settings.theme.radiusNone', 'settings.theme.radiusSmall', 'settings.theme.radiusMedium', 'settings.theme.radiusLarge', 'settings.theme.radiusFull'][i]!),
            }))}
            onChange={(v) => setTokens({ radius: v })}
          />
        </Field>

        {/* 版心 */}
        <Field label={t('settings.theme.widthLabel')}>
          <SliderField
            value={theme.tokens.width ?? activeCard.width}
            min={WIDTH_MIN}
            max={WIDTH_MAX}
            step={1}
            suffix="rem"
            onChange={(v) => setTokens({ width: v })}
          />
        </Field>

        {/* 字体 */}
        <Field label={t('settings.theme.font')}>
          <Segmented
            value={theme.tokens.font ?? activeCard.font}
            options={FONT_IDS.map((id) => ({
              value: id,
              label: t(FONT_LABEL_KEYS[id]),
              style: { fontFamily: FONT_STACKS[id] },
            }))}
            onChange={(v) => setTokens({ font: v })}
          />
        </Field>

        {/* 正文字号 */}
        <Field label={t('settings.theme.fontSizeLabel')}>
          <SliderField
            value={theme.tokens.fontSize ?? activeCard.fontSize}
            min={FONTSIZE_MIN}
            max={FONTSIZE_MAX}
            step={FONTSIZE_STEP}
            suffix="px"
            onChange={(v) => setTokens({ fontSize: v })}
          />
        </Field>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[13px] text-muted hover:text-accent"
          >
            <ExternalLink size={13} />
            {t('settings.theme.openSite')}
          </a>
          <Button variant="primary" size="sm" onClick={() => saveTheme.mutate()} disabled={saveTheme.isPending}>
            <Save size={14} />
            {t('settings.theme.save')}
          </Button>
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-[12px] text-muted">{label}</p>
      {children}
    </div>
  )
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; style?: React.CSSProperties }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map(({ value: v, label, style }) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          style={style}
          className={cn(
            'flex-1 cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition-colors',
            value === v ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-text',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** 数值滑块：原生 range（accent-color 跟随主题色）+ 右侧当前值 */
function SliderField({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <span className="w-14 shrink-0 text-right text-[13px] text-muted tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  )
}

/** 主题卡缩略图：纯 CSS 微缩布局 */
function ThemeThumb({ card }: { card: (typeof THEME_CARDS)[number] }) {
  const bg = card.dark ? '#101418' : card.id === 'classic' ? '#faf8f4' : '#ffffff'
  const fg = card.dark ? '#3a434d' : '#e8e8ec'
  const bar = card.dark ? '#232a31' : '#ececf1'
  return (
    <div className="h-20 overflow-hidden rounded-lg border border-line" style={{ background: bg }}>
      {/* 页头 */}
      <div className="flex h-4 items-center gap-1 border-b px-2" style={{ borderColor: bar }}>
        <span className="h-1.5 w-8 rounded-full" style={{ background: card.accent }} />
        <span className="ml-auto flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-3 rounded-full" style={{ background: bar }} />
          ))}
        </span>
      </div>
      {card.id === 'gallery' ? (
        // 相册：封面卡片网格
        <div className="grid grid-cols-2 gap-1.5 p-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-9 rounded-md" style={{ background: card.dark ? '#181d22' : bar }}>
              <div className="m-1.5 h-5 rounded" style={{ background: card.accent, opacity: 0.35 }} />
              <div className="mx-1.5 h-1 w-8 rounded" style={{ background: fg }} />
            </div>
          ))}
        </div>
      ) : (
        // 单栏文章流
        <div className="space-y-1.5 p-2.5">
          <div className="h-2 w-3/5 rounded" style={{ background: fg }} />
          <div className="h-1 w-1/4 rounded" style={{ background: card.accent, opacity: 0.6 }} />
          <div className="h-1 w-full rounded" style={{ background: bar }} />
          <div className="h-1 w-4/5 rounded" style={{ background: bar }} />
          <div className="h-1 w-full rounded" style={{ background: bar }} />
        </div>
      )}
    </div>
  )
}

/** CSS 模拟实时预览：用未保存 token 渲染一个微缩博客页 */
function ThemePreview({ tokens, device }: { tokens: Tokens & { id: string }; device: 'desktop' | 'mobile' }) {
  const card = THEME_CARDS.find((c) => c.id === tokens.id) ?? THEME_CARDS[0]
  const accent = tokens.accent ?? card.accent
  const radius = tokens.radius ?? card.radius
  const width = device === 'mobile' ? 320 : (tokens.width ?? card.width) * 8
  const fontId = tokens.font ?? card.font
  const fontSize = tokens.fontSize ?? card.fontSize
  const dark = card.dark
  const bg = dark ? '#101418' : card.id === 'classic' ? '#faf8f4' : '#f7f7f9'
  const surface = dark ? '#181d22' : '#ffffff'
  const text = dark ? '#e8ebee' : '#1b1c1f'
  const muted = dark ? '#8b93a3' : '#8a8f99'
  const line = dark ? '#232a31' : '#e8e8ec'
  const fontFamily = FONT_STACKS[fontId]

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-card"
      style={{ width, background: bg, color: text, fontFamily, fontSize, borderColor: line }}
    >
      {/* 页头 */}
      <div className="flex items-baseline gap-3 border-b px-4 py-2.5" style={{ background: dark ? '#101418cc' : '#ffffffcc', borderColor: line }}>
        <span className="text-[15px] font-bold" style={{ color: dark ? text : text }}>
          我的小站
        </span>
        <nav className="ml-auto flex gap-2.5 text-[11px]">
          {['首页', '归档', '标签'].map((n, i) => (
            <span key={n} style={{ color: i === 0 ? accent : muted }}>
              {n}
            </span>
          ))}
        </nav>
      </div>
      {/* 正文区 */}
      <div className="p-4" style={{ lineHeight: 1.7 }}>
        <p className="m-0 text-[11px]" style={{ color: muted }}>
          2026/09/19 · 5 分钟阅读
        </p>
        <h3 className="mb-1.5 mt-1 text-[1.25em] font-semibold" style={{ letterSpacing: fontId === 'sans' ? '-0.01em' : 0 }}>
          如何用 Workers 搭博客
        </h3>
        <p className="my-2 text-[0.92em]" style={{ color: muted }}>
          这是一段示例正文，用于预览字号、字体与行高的实际观感。改变右侧的设置会立即更新这里。
        </p>
        <div className="my-2.5 border-l-[3px] py-1 pl-2.5 text-[0.92em]" style={{ borderColor: accent, color: muted }}>
          引用样式：强调色落在左侧竖线上。
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: accent, color: '#fff', borderRadius: radius }}>
            阅读全文
          </span>
          <span className="px-1 text-[11px]" style={{ color: accent }}>
            # 标签
          </span>
        </div>
        {/* 代码块观感 */}
        <div className="mt-2.5 px-2.5 py-2 font-mono text-[11px]" style={{ background: dark ? '#0b0e11' : '#1d212b', color: '#e7e9ee', borderRadius: radius }}>
          npm run deploy
        </div>
      </div>
      {/* 页脚 */}
      <div className="border-t px-4 py-2 text-[11px]" style={{ borderColor: line, color: muted, background: surface }}>
        © 2026 我的小站
      </div>
    </div>
  )
}
