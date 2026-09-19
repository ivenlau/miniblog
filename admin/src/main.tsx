import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import './i18n' // 必须先于组件初始化（ui.tsx 等使用 useTranslation）
import './styles/admin.css'
import { router } from './router'
import { ToastProvider } from './state/toast'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)

// PWA/离线不是 Admin 的需求；生产环境如需 Service Worker 在此扩展
