import { invoke } from '@tauri-apps/api/core'

let API_BASE = 'http://localhost:3099/api'

const { resolve: markReady } = Promise.withResolvers<void>()
let backendChecked = false

/** 初始化 API base URL（从 Tauri 后端读端口） */
async function initBase(): Promise<void> {
  try {
    const port = await invoke<string>('get_backend_port')
    API_BASE = `http://localhost:${port}/api`
  } catch {}
}

/** 等待后端就绪（首次调用时轮询，之后直接跳过） */
async function ensureBackend(): Promise<void> {
  if (backendChecked) return
  await initBase()
  const maxAttempts = 30
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE}/config/status`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        backendChecked = true
        markReady()
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  backendChecked = true
  markReady()
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  await ensureBackend()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}


/** SSE 流式请求 */
export async function apiStream(
  path: string,
  handlers: Record<string, (data: Record<string, unknown>) => void>,
): Promise<void> {
  await ensureBackend()
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventType = 'message'

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          handlers[eventType]?.(data)
        } catch {}
        eventType = 'message'
      }
    }
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
