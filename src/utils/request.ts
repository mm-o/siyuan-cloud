export const privateBase = '/plugin/private/siyuan-cloud'
const openListAuthHeader = 'X-Siyuan-Cloud-Authorization'
let openListAuthToken = 'siyuan-cloud-token'

export function setOpenListAuthToken(token = '') {
  openListAuthToken = String(token || '')
}

export function withOpenListHeaders(headers?: HeadersInit) {
  const merged: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      merged[key] = value
    })
  }
  else if (Array.isArray(headers)) {
    for (const [key, value] of headers)
      merged[key] = String(value)
  }
  else {
    Object.assign(merged, headers || {})
  }
  if (openListAuthToken) {
    const keys = Object.keys(merged).map(key => key.toLowerCase())
    if (!keys.includes(openListAuthHeader.toLowerCase()))
      merged[openListAuthHeader] = openListAuthToken
  }
  return merged
}

function jsonHeaders(headers?: HeadersInit) {
  return withOpenListHeaders({
    'Content-Type': 'application/json',
    ...withOpenListHeaders(headers),
  })
}

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
  const url = `${privateBase}${path}`
  const response = await fetch(url, {
    ...init,
    headers: withOpenListHeaders(init?.headers),
  })
  const text = await response.text()
  if (!response.ok)
    throw new Error(text ? `HTTP ${response.status}: ${text.slice(0, 160)}` : `HTTP ${response.status}`)
  return text ? JSON.parse(text) : null
}

export async function openListJson(path: string, body?: unknown, init?: RequestInit) {
  const payload = await fetchOpenListJson(path, {
    ...init,
    method: init?.method || 'POST',
    headers: jsonHeaders(init?.headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (payload.code && payload.code !== 200)
    throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
  return payload
}

export async function fetchOpenListText(path: string, init?: RequestInit) {
  const response = await fetch(`${privateBase}${path}`, {
    ...init,
    headers: withOpenListHeaders(init?.headers),
  })
  const text = await response.text()
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${text}`)
  return { response, text }
}

async function requestOpenList<T = any>(path: string, init?: RequestInit): Promise<OpenListResp<T>> {
  try {
    const response = await fetch(`${privateBase}/api${path}`, {
      ...init,
      headers: withOpenListHeaders(init?.headers),
    })
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
      ...init,
      method: 'POST',
      headers: jsonHeaders(init?.headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  put<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<OpenListResp<T>> {
    return requestOpenList<T>(path, {
      ...init,
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
}
