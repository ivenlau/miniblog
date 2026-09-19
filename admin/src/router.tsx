import { Navigate } from 'react-router-dom'
import { createBrowserRouter } from 'react-router-dom'
import { AdminShell } from './layout/AdminShell'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { PostsPage } from './pages/PostsPage'
import { EditorPage } from './pages/editor/EditorPage'
import { SettingsPage } from './pages/settings/SettingsPage'

/**
 * Admin SPA 路由（basename=/admin，路由内不再写 /admin 前缀）。
 * 编辑器脏守卫依赖 useBlocker，必须使用 data router。
 */
export const router = createBrowserRouter(
  [
    { path: '/setup', element: <SetupPage /> },
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: <AdminShell />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'posts', element: <PostsPage /> },
        { path: 'posts/new', element: <EditorPage /> },
        { path: 'posts/:id', element: <EditorPage /> },
        { path: 'settings', element: <SettingsPage /> },
        // 兼容旧路径（/admin/plugins → 设置的插件标签页）
        { path: 'plugins', element: <Navigate to="/settings?tab=plugins" replace /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: '/admin' },
)
