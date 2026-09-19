import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Fingerprint } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useBootstrap } from '../state/auth'
import { setupPasskey } from '../lib/passkey'
import { Button, Input, Spinner } from '../components/ui'
import { Logo } from '../components/Logo'
import { useToast } from '../state/toast'

/** 首次初始化：口令 + 注册第一个 Passkey + 保存恢复码 */
export function SetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: bootstrap, isLoading } = useBootstrap()

  const [setupToken, setSetupToken] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  const errText = (err: unknown) => t(`errors.${err instanceof ApiError ? err.code : 'UNKNOWN'}`)

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <Spinner size={24} />
      </div>
    )
  }
  if (bootstrap?.initialized && !recoveryCodes) return <Navigate to="/login" replace />

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await setupPasskey(email || 'owner@blog.local', setupToken)
      setRecoveryCodes(res.recoveryCodes)
      void qc.invalidateQueries({ queryKey: ['bootstrap'] })
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return (
      <SetupShell>
        <h1 className="text-xl font-semibold tracking-tight">{t('auth.recoveryTitle')}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('auth.recoveryHint')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface2 p-4 font-mono text-[13.5px] tracking-wider">
          {recoveryCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-warn">{t('settings.saveCodes')}</p>
        <div className="mt-5 flex gap-2.5">
          <Button
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard.writeText(recoveryCodes.join('\n')).catch(() => {})
              toast(t('common.copied'), 'success')
            }}
          >
            <Copy size={15} />
            {t('auth.copyAll')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ['bootstrap'] })
              navigate('/', { replace: true })
            }}
          >
            {t('auth.done')}
          </Button>
        </div>
      </SetupShell>
    )
  }

  return (
    <SetupShell>
      <h1 className="text-xl font-semibold tracking-tight">{t('auth.setupTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('auth.setupSubtitle')}</p>
      <form
        className="mt-6 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          type="password"
          placeholder={t('auth.setupToken')}
          value={setupToken}
          onChange={(e) => setSetupToken(e.target.value)}
          required
          autoFocus
        />
        <Input type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          placeholder={t('auth.displayName')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="h-12 w-full text-[15px]" disabled={busy || !setupToken}>
          {busy ? <Spinner size={17} /> : <Fingerprint size={18} />}
          {t('auth.create')}
        </Button>
      </form>
    </SetupShell>
  )
}

function SetupShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-10">
      <div className="mb-slide-up w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 overflow-hidden rounded-2xl shadow-card">
            <Logo size={56} />
          </div>
          <span className="text-[13px] font-medium text-muted">{t('common.appName')}</span>
        </div>
        {children}
      </div>
    </div>
  )
}
