import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * 脏状态守卫（双保险）：
 * - useBlocker 拦截应用内路由跳转（需要 data router）；传入函数以便
 *   编辑器在「保存后跳转 / 删除后返回」时通过 ref 临时放行；
 * - beforeunload 拦截刷新 / 关闭标签页。
 * 返回 blocked 状态供页面渲染确认对话框。
 */
export function useDirtyGuard(isDirty: () => boolean) {
  const dirtyRef = useRef(isDirty)
  dirtyRef.current = isDirty

  const blocker = useBlocker(() => dirtyRef.current())
  const dirty = isDirty()

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return {
    blocked: blocker.state === 'blocked',
    discard: () => {
      if (blocker.state === 'blocked') blocker.proceed()
    },
    stay: () => {
      if (blocker.state === 'blocked') blocker.reset()
    },
  }
}
