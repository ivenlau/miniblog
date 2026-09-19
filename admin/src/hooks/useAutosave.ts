import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveState = { phase: 'idle' | 'saving' | 'saved' | 'error'; savedAt: number | null }

/**
 * 自动保存：dirty 且已有 postId 时，停顿 delay ms 后自动保存。
 * 新建文章（尚无 id）不自动创建，由首次手动保存落库。
 */
export function useAutosave(opts: { dirty: boolean; enabled: boolean; save: () => Promise<unknown> }) {
  const { dirty, enabled, save } = opts
  const [state, setState] = useState<AutosaveState>({ phase: 'idle', savedAt: null })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!dirty || !enabled) return
    setState((s) => (s.phase === 'saving' ? s : { ...s, phase: 'idle' }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setState({ phase: 'saving', savedAt: null })
      try {
        await saveRef.current()
        setState({ phase: 'saved', savedAt: Date.now() })
      } catch {
        setState((s) => ({ phase: 'error', savedAt: s.savedAt }))
      }
    }, 2000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [dirty, enabled])

  const retry = useCallback(async () => {
    setState({ phase: 'saving', savedAt: null })
    try {
      await saveRef.current()
      setState({ phase: 'saved', savedAt: Date.now() })
    } catch {
      setState((s) => ({ phase: 'error', savedAt: s.savedAt }))
    }
  }, [])

  /** 手动保存时同步指示器 */
  const markSaving = useCallback(() => setState({ phase: 'saving', savedAt: null }), [])
  const markSaved = useCallback(() => setState({ phase: 'saved', savedAt: Date.now() }), [])
  const markError = useCallback(() => setState((s) => ({ phase: 'error', savedAt: s.savedAt })), [])

  return { state, retry, markSaving, markSaved, markError }
}
