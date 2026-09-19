import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  Copy,
  Fingerprint,
  KeyRound,
  Laptop,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { ApiError, api } from '../../lib/api'
import { useMe } from '../../state/auth'
import { useAdminShell } from '../../layout/AdminShell'
import { registerPasskey } from '../../lib/passkey'
import type { CredentialDto, SessionDto } from '../../lib/types'
import { formatRelative } from '../../lib/format'
import { Button, ConfirmDialog, Input, Modal, PromptDialog, cn } from '../../components/ui'
import { useToast } from '../../state/toast'

const errCode = (err: unknown) => (err instanceof ApiError ? err.code : 'UNKNOWN')

/**
 * 账户与安全：Passkey / 登录设备 / 密码 / TOTP / 恢复码。
 * standalone：本应用独立的认证数据。
 * linked：users/sessions/credentials 等表与 Minidriver 共库，此处的修改对两个应用同时生效。
 */
export function SecuritySection() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { deployMode } = useAdminShell()
  const { data: me } = useMe()

  const refresh = () => {
    for (const key of ['me', 'credentials', 'sessions']) {
      void qc.invalidateQueries({ queryKey: [key] })
    }
  }

  const [addingPasskey, setAddingPasskey] = useState(false)
  const [renaming, setRenaming] = useState<CredentialDto | null>(null)
  const [deletingPasskey, setDeletingPasskey] = useState<CredentialDto | null>(null)
  const [revokingSession, setRevokingSession] = useState<SessionDto | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const [showRecovery, setShowRecovery] = useState<string[] | null>(null)

  const credentialsQuery = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.get<{ credentials: CredentialDto[] }>('/api/auth/credentials'),
  })
  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ sessions: SessionDto[] }>('/api/auth/sessions'),
  })

  const errText = (err: unknown) => t(`errors.${errCode(err)}`)

  const addPasskey = async (name: string) => {
    try {
      await registerPasskey(name)
      refresh()
      toast(t('settings.passkeyAdded'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }

  return (
    <div>
      {deployMode === 'linked' && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>{t('settings.sharedModeHint')}</span>
        </div>
      )}

      <Card title={t('settings.passkeys')}>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">{t('settings.passkeysHint')}</p>
        <div className="space-y-1">
          {(credentialsQuery.data?.credentials ?? []).map((cred) => (
            <div key={cred.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface2/60">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Fingerprint size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{cred.name}</p>
                <p className="text-[12px] text-muted">
                  {cred.lastUsedAt
                    ? t('settings.lastUsed', { time: formatRelative(cred.lastUsedAt, i18n.language) })
                    : t('settings.neverUsed')}
                  {' · '}
                  {cred.backedUp ? t('settings.backedUp') : t('settings.notBackedUp')}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                <Button variant="ghost" size="icon" title={t('common.rename')} onClick={() => setRenaming(cred)}>
                  <KeyRound size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-danger"
                  title={t('common.delete')}
                  onClick={() => setDeletingPasskey(cred)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAddingPasskey(true)}>
          <Plus size={15} />
          {t('settings.addPasskey')}
        </Button>
      </Card>

      <Card title={t('settings.sessions')}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-[13px] text-muted">{t('settings.sessionsHint')}</p>
          {(sessionsQuery.data?.sessions ?? []).filter((s) => !s.isCurrent).length > 0 && (
            <Button variant="ghost" size="sm" className="shrink-0 text-danger" onClick={() => setRevokingOthers(true)}>
              <LogOut size={13} />
              {t('settings.revokeOthers')}
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {(sessionsQuery.data?.sessions ?? []).map((session) => (
            <div key={session.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface2/60">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted">
                {/Mobile|Android|iPhone/i.test(session.userAgent ?? '') ? <Smartphone size={16} /> : <Laptop size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">
                  {session.userAgent?.split(/[()]/)[1]?.trim() || session.userAgent?.slice(0, 40) || '—'}
                  {session.isCurrent && (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {t('settings.current')}
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-muted">
                  {t('settings.lastUsed', { time: formatRelative(session.lastSeenAt, i18n.language) })}
                  {session.ipCountry ? ` · ${session.ipCountry}` : ''}
                </p>
              </div>
              {!session.isCurrent && (
                <Button variant="ghost" size="icon" className="shrink-0 text-danger" onClick={() => setRevokingSession(session)}>
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <PasswordCard me={me} onChange={refresh} errText={errText} />
      <TotpCard me={me} onChange={refresh} errText={errText} />
      <RecoveryCard me={me} onChange={refresh} onGenerated={setShowRecovery} errText={errText} />

      <PromptDialog
        open={addingPasskey}
        title={t('settings.passkeyNamePrompt')}
        initialValue={defaultDeviceName()}
        confirmLabel={t('common.continue')}
        onClose={() => setAddingPasskey(false)}
        onConfirm={(name) => void addPasskey(name)}
      />
      {renaming && (
        <PromptDialog
          open
          title={t('settings.passkeyNamePrompt')}
          initialValue={renaming.name}
          confirmLabel={t('common.save')}
          onClose={() => setRenaming(null)}
          onConfirm={async (name) => {
            await api.patch(`/api/auth/credentials/${renaming.id}`, { name })
            refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={!!deletingPasskey}
        title={t('common.delete')}
        message={deletingPasskey ? t('settings.deletePasskeyConfirm', { name: deletingPasskey.name }) : undefined}
        danger
        onClose={() => setDeletingPasskey(null)}
        onConfirm={async () => {
          if (!deletingPasskey) return
          try {
            await api.del(`/api/auth/credentials/${deletingPasskey.id}`)
            refresh()
          } catch (err) {
            toast(errText(err), 'error')
          }
        }}
      />
      <ConfirmDialog
        open={!!revokingSession}
        title={t('common.signOut')}
        danger
        onClose={() => setRevokingSession(null)}
        onConfirm={async () => {
          if (!revokingSession) return
          try {
            await api.del(`/api/auth/sessions/${revokingSession.id}`)
            refresh()
          } catch (err) {
            toast(errText(err), 'error')
          }
        }}
      />
      <ConfirmDialog
        open={revokingOthers}
        title={t('settings.revokeOthers')}
        message={t('settings.revokeOthersConfirm')}
        danger
        onClose={() => setRevokingOthers(false)}
        onConfirm={async () => {
          try {
            await api.post('/api/auth/sessions/revoke-others')
            refresh()
          } catch (err) {
            toast(errText(err), 'error')
          }
        }}
      />
      <RecoveryCodesModal codes={showRecovery} onClose={() => setShowRecovery(null)} />
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}

// ---------------------------------------------------------------- 密码

function PasswordCard({
  me,
  onChange,
  errText,
}: {
  me: { hasPassword: boolean } | undefined
  onChange: () => void
  errText: (e: unknown) => string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [mode, setMode] = useState<'view' | 'set'>('view')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  if (!me) return null
  const save = async () => {
    try {
      await api.put('/api/auth/password', { currentPassword: current, newPassword: next })
      setMode('view')
      setCurrent('')
      setNext('')
      onChange()
      toast(t('settings.saved'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }
  const disable = async () => {
    try {
      await api.del('/api/auth/password', { currentPassword: current })
      setMode('view')
      setCurrent('')
      onChange()
      toast(t('settings.passwordDisabled'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }

  return (
    <Card title={t('settings.passwordSection')}>
      {!me.hasPassword && mode === 'view' ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">{t('settings.passwordOff')}</p>
          <Button size="sm" onClick={() => setMode('set')}>
            {t('settings.setPassword')}
          </Button>
        </div>
      ) : mode === 'view' ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">••••••••</p>
          <Button size="sm" onClick={() => setMode('set')}>
            {t('settings.changePassword')}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {me.hasPassword && (
            <Input
              type="password"
              placeholder={t('settings.currentPassword')}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          )}
          <Input
            type="password"
            placeholder={t('settings.newPassword')}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <div className="flex justify-end gap-2">
            {me.hasPassword && (
              <Button type="button" variant="ghost" className="text-danger" onClick={() => void disable()}>
                {t('settings.disablePassword')}
              </Button>
            )}
            <Button type="button" onClick={() => setMode('view')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={next.length < 8}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- TOTP

function TotpCard({
  me,
  onChange,
  errText,
}: {
  me: { totpEnabled: boolean } | undefined
  onChange: () => void
  errText: (e: unknown) => string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  // 停用需要验证（当前密码或 6 位验证码，服务端二选一）
  const [disabling, setDisabling] = useState(false)
  const [disableCode, setDisableCode] = useState('')

  if (!me) return null

  const begin = async () => {
    try {
      const res = await api.post<{ secret: string; otpauthUri: string }>('/api/auth/totp/setup')
      const qr = await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 200 })
      setSetup({ ...res, qr })
    } catch (err) {
      toast(errText(err), 'error')
    }
  }
  const confirm = async () => {
    try {
      await api.post('/api/auth/totp/confirm', { code })
      setSetup(null)
      setCode('')
      onChange()
      toast(t('settings.totpEnabled'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }
  const disable = async () => {
    try {
      await api.del('/api/auth/totp', { code: disableCode })
      setDisabling(false)
      setDisableCode('')
      onChange()
      toast(t('settings.totpDisabled'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    }
  }

  return (
    <Card title={t('settings.totp')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{me.totpEnabled ? t('settings.totpOn') : t('settings.totpOff')}</p>
        {me.totpEnabled ? (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDisabling(true)}>
            {t('settings.disableTotp')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void begin()}>
            {t('settings.enableTotp')}
          </Button>
        )}
      </div>

      {setup && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <p className="text-[13px] text-muted">{t('settings.scanHint')}</p>
          <div className="flex flex-col items-center gap-3">
            <img src={setup.qr} alt="TOTP QR" className="h-44 w-44 rounded-xl bg-white p-2" />
            <p className="text-[12px] text-muted">
              {t('settings.manualCode')}:{' '}
              <code className="rounded bg-surface2 px-1.5 py-0.5 text-[11px]">{setup.secret}</code>
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              placeholder={t('settings.enterCode')}
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button variant="primary" onClick={() => void confirm()} disabled={code.length !== 6}>
              {t('settings.confirmCode')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={disabling}
        title={t('settings.disableTotp')}
        message={
          <span className="block space-y-3">
            <span className="block">{t('settings.disableTotpHint')}</span>
            <Input
              inputMode="numeric"
              placeholder={t('settings.enterCode')}
              value={disableCode}
              maxLength={6}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
            />
          </span>
        }
        danger
        onClose={() => {
          setDisabling(false)
          setDisableCode('')
        }}
        onConfirm={() => void disable()}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- 恢复码

function RecoveryCard({
  me,
  onChange,
  onGenerated,
  errText,
}: {
  me: { recoveryCodesLeft: number } | undefined
  onChange: () => void
  onGenerated: (codes: string[]) => void
  errText: (e: unknown) => string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const generate = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>('/api/auth/recovery/regenerate'),
    onSuccess: (res) => {
      onChange()
      onGenerated(res.recoveryCodes)
    },
    onError: (err) => toast(errText(err), 'error'),
  })

  if (!me) return null
  return (
    <Card title={t('settings.recovery')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {t('settings.recoveryHint')} · {t('settings.recoveryLeft', { count: me.recoveryCodesLeft })}
        </p>
        <Button size="sm" onClick={() => setConfirming(true)}>
          <RefreshCw size={14} />
          {t('settings.regenerate')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('settings.regenerate')}
        message={t('settings.regenerateConfirm')}
        danger
        onClose={() => setConfirming(false)}
        onConfirm={() => generate.mutate()}
      />
    </Card>
  )
}

function RecoveryCodesModal({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  if (!codes) return null
  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.join('\n')).catch(() => {})
    toast(t('common.copied'), 'success')
  }
  return (
    <Modal open onClose={onClose} title={t('auth.recoveryTitle')}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">{t('auth.recoveryHint')}</p>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-4 font-mono text-[13px] tracking-wider">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-warn">{t('settings.saveCodes')}</p>
      <div className="mt-4 flex justify-end gap-2.5">
        <Button onClick={copyAll}>
          <Copy size={14} />
          {t('auth.copyAll')}
        </Button>
        <Button variant="primary" onClick={onClose}>
          {t('settings.gotIt')}
        </Button>
      </div>
    </Modal>
  )
}
