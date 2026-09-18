export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

async function handle(res: Response): Promise<unknown> {
  if (res.ok) {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) return res.json()
    return null
  }
  let code = res.status >= 500 ? 'INTERNAL' : 'REQUEST_FAILED'
  try {
    const body = (await res.json()) as { error?: { code?: string } }
    code = body?.error?.code ?? code
  } catch {
    /* 非 JSON 错误体 */
  }
  throw new ApiError(res.status, code)
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-miniblog': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handle(res)
}

export const api = {
  get: <T>(path: string) => request('GET', path) as Promise<T>,
  post: <T>(path: string, body?: unknown) => request('POST', path, body) as Promise<T>,
  put: <T>(path: string, body?: unknown) => request('PUT', path, body) as Promise<T>,
  patch: <T>(path: string, body?: unknown) => request('PATCH', path, body) as Promise<T>,
  del: <T>(path: string, body?: unknown) => request('DELETE', path, body) as Promise<T>,
}
