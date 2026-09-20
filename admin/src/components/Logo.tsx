import { cn } from './ui'

/**
 * Miniblog 品牌标识：圆角方块 + 笔与书写线。
 * 图形约占方块 40%（对齐 Admin 空状态图标的留白比例）。
 * 与 admin/public/favicon.svg、公开站 SiteIcon（server/render/themes/registry.tsx）同源。
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--mb-accent)" />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(5.4 5.3) scale(0.585)">
        <path d="M12 20h9" opacity=".85" />
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
      </g>
    </svg>
  )
}
