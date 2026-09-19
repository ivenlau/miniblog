import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-accent text-white hover:brightness-110',
    secondary: 'bg-surface text-text border border-line hover:bg-surface2',
  }
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
  }
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-text placeholder:text-muted/70',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        className,
      )}
      {...rest}
    />
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />
}

export function ConfirmDialog({
  open,
  title,
  message,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {message && <p className="mt-2 text-[13px] leading-relaxed text-muted">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            variant={danger ? 'primary' : 'primary'}
            className={danger ? 'bg-danger' : undefined}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            确认
          </Button>
        </div>
      </div>
    </div>
  )
}
