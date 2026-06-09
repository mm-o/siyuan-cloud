export const privateBase = '/plugin/private/siyuan-cloud'

export function openListCurrentUrl(path: string) {
  if (!path)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path))
    return path
  const route = path.startsWith('/') ? path : `/${path}`
  return `${location.origin}${route}`
}

export async function openListShareUrl(path: string) {
  return openListCurrentUrl(path)
}

export interface OpenListResp<T = any> {
  code: number
  message: string
  data: T
}

export async function fetchOpenListJson(path: string, init?: RequestInit) {
  const response = await fetch(`${privateBase}${path}`, init)
  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function openListJson(path: string, body?: unknown, init?: RequestInit) {
  const payload = await fetchOpenListJson(path, {
    method: init?.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
  if (payload.code && payload.code !== 200)
    throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
  return payload
}

export async function fetchOpenListText(path: string, init?: RequestInit) {
  const response = await fetch(`${privateBase}${path}`, init)
  const text = await response.text()
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${text}`)
  return { response, text }
}

async function requestOpenList<T = any>(path: string, init?: RequestInit): Promise<OpenListResp<T>> {
  try {
    const response = await fetch(`${privateBase}/api${path}`, init)
    const text = await response.text()
    if (!response.ok) {
      return {
        code: response.status,
        message: text || `HTTP ${response.status}`,
        data: null as T,
      }
    }
    return JSON.parse(text) as OpenListResp<T>
  } catch (error) {
    return {
      code: -1,
      message: error instanceof Error ? error.message : String(error),
      data: null as T,
    }
  }
}

export const r = {
  post<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<OpenListResp<T>> {
    return requestOpenList<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    })
  },
  put<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<OpenListResp<T>> {
    return requestOpenList<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    })
  },
}
