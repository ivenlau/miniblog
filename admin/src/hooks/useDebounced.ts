import { useEffect, useState } from 'react'

/** 防抖值：延迟 delay ms 返回最新值（预览请求等） */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
