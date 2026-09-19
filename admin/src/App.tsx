import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Cloud, Copy, Fingerprint, KeyRound } from 'lucide-react'
import { ApiError, api } from './lib/api'
import { browserSupportsWebAuthn, loginWithPasskey, setupPasskey } from './lib/passkey'
import { Button, Input, Spinner } from './components/ui'
import { PostsPage } from './pages/PostsPage'
import { EditorPage } from './pages/EditorPage'
import { SettingsPage } from './pages/SettingsPage'
import { PluginsPage } from './pages/PluginsPage'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

type Bootstrap = {
  initialized: boolean
  authMethods: { password: boolean; totp: boolean }
  me?: { userId: string; email: string; displayName: string }
}

function useBootstrap() {
  return useQuery({ queryKey: ['bootstrap'], queryFn: () => api.get<Bootstrap>('/api/bootstrap'), staleTime: 60_000 })
}

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Spinner size={24} />
    </div>
  )
}

function errText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'UNKNOWN'
  const map: Record<string, string> = {
    BAD_CREDENTIALS: '账号或密码错误',
    BAD_CODE: '验证码错误',
    TRY_LATER: '尝试次数过多，请稍后再试',
    SETUP_TOKEN_INVALID: '初始化口令错误',
    ALREADY_INITIALIZED: '已初始化过',
    REGISTRATION_FAILED: '注册失败，请重试',
    CHALLENGE_EXPIRED: '验证已过期，请重试',
    CREDENTIAL_UNKNOWN: '未识别的 Passkey',
  }
  return map[code] ?? '发生未知错误'
}

function SetupPage() {
  const { data } = useBootstrap()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [setupToken, setSetupToken] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)

  if (data?.initialized && !codes) return <Navigate to="/admin/login" replace />

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await setupPasskey(email || 'owner@blog.local', setupToken)
      setCodes(res.recoveryCodes)
      void qc.invalidateQueries({ queryKey: ['bootstrap'] })
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  if (codes) {
    return (
      <Shell title="请保存恢复码">
        <p className="mt-1.5 text-sm text-muted">所有设备丢失时的唯一登录方式，每个只能用一次。</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-4 font-mono text-[13px]">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button
          variant="primary"
          className="mt-5 w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join('\n')).catch(() => {})
            void qc.invalidateQueries({ queryKey: ['bootstrap'] })
            navigate('/admin', { replace: true })
          }}
        >
          <Copy size={15} />
          复制并进入后台
        </Button>
      </Shell>
    )
  }

  return (
    <Shell title="初始化 Miniblog">
      <form
        className="mt-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          type="password"
          placeholder="初始化口令（SETUP_TOKEN）"
          value={setupToken}
          onChange={(e) => setSetupToken(e.target.value)}
          required
        />
        <Input type="email" placeholder="邮箱（可选）" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="h-11 w-full" disabled={busy || !setupToken}>
          {busy ? <Spinner size={16} /> : <Fingerprint size={17} />}
          注册 Passkey 并创建账号
        </Button>
      </form>
    </Shell>
  )
}

function LoginPage() {
  const { data } = useBootstrap()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const [autofill, setAutofill] = useState(false)

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['bootstrap'] })
    navigate('/admin', { replace: true })
  }

  useEffect(() => {
    if (started.current || !data?.initialized) return
    started.current = true
    if (!browserSupportsWebAuthn()) return
    setAutofill(true)
    loginWithPasskey(true)
      .then(done)
      .catch(() => setAutofill(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.initialized])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/password/login', { password })
      done()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="登录 Miniblog">
      <Button
        variant="primary"
        className="h-12 w-full"
        onClick={() =>
          loginWithPasskey(false)
            .then(done)
            .catch((e) => setError(errText(e)))
        }
      >
        <Fingerprint size={18} />
        使用 Passkey 登录
      </Button>
      {autofill && (
        <input
          type="text"
          name="username"
          autoComplete="username webauthn"
          aria-hidden
          className="h-0 w-0 opacity-0"
          tabIndex={-1}
          onChange={() => {}}
        />
      )}
      <form
        className="mt-5 space-y-3 border-t border-line pt-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="secondary" className="w-full" disabled={busy || !password}>
          密码登录
        </Button>
      </form>
    </Shell>
  )
}

function Dashboard() {
  const { data } = useBootstrap()
  const qc = useQueryClient()
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
          <Cloud size={18} />
        </div>
        <h1 className="text-lg font-semibold">Miniblog</h1>
        <div className="flex-1" />
        <span className="text-[13px] text-muted">{data?.me?.email}</span>
        <Button
          size="sm"
          onClick={async () => {
            await api.post('/api/auth/logout').catch(() => {})
            qc.clear()
            navigate('/admin/login', { replace: true })
          }}
        >
          退出
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">文章管理</h2>
              <p className="mt-1 text-[13px] text-muted">写作、发布、标签与归档</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/admin/posts')}>
              打开
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">站点设置</h2>
              <p className="mt-1 text-[13px] text-muted">站点信息、关于页、主题与插件</p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => navigate('/admin/plugins')}>
                插件
              </Button>
              <Button size="sm" onClick={() => navigate('/admin/settings')}>
                打开
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
            <Cloud size={22} />
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">{children}</div>
      </div>
    </div>
  )
}

function AdminRoutes() {
  const { data, isLoading } = useBootstrap()
  const location = useLocation()
  if (isLoading) return <Splash />
  if (!data?.initialized) return <Navigate to="/admin/setup" replace />
  if (!data.me) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  return (
    <Routes location={location}>
      <Route index element={<Dashboard />} />
      <Route path="posts" element={<PostsPage />} />
      <Route path="posts/new" element={<EditorPage />} />
      <Route path="posts/:id" element={<EditorPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="plugins" element={<PluginsPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/admin/setup" element={<SetupPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Routes>
    </QueryClientProvider>
  )
}
