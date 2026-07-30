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

export function withOpenListAuthQuery(url: string) {
  if (!openListAuthToken)
    return url
  const target = new URL(url, location.href)
  if (target.origin !== location.origin || !target.pathname.startsWith(`${privateBase}/`))
    return target.href
  target.searchParams.set('siyuan_cloud_token', openListAuthToken)
  return target.href
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
    return normalizeResourceUrl(path)
  const route = path.startsWith('/') ? path : `/${path}`
  return normalizeResourceUrl(`${location.origin}${route}`)
}

export function openListShareUrl(path: string) {
  return openListCurrentUrl(path)
}

export function normalizeResourceUrl(url: string, options: { escapeHash?: boolean, escapeQuestion?: boolean } = {}) {
  let prepared = String(url || '')
  if (options.escapeHash)
    prepared = prepared.replace(/#/g, '%23')
  if (options.escapeQuestion)
    prepared = prepared.replace(/\?/g, '%3F')
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(prepared)
  const base = 'http://siyuan-cloud.local'
  const parsed = new URL(prepared, base)
  return absolute ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export function formatResourceUrlForMarkdown(url: string) {
  const normalized = normalizeResourceUrl(url)
  if (!normalized.toLowerCase().startsWith('file://'))
    return normalized.replace(/(?:%[89A-F][0-9A-F])+/gi, value => decodeURIComponent(value))
  const parsed = new URL(normalized)
  const pathname = decodeURIComponent(parsed.pathname).replace(/\s/g, '%20').replace(/#/g, '%23').replace(/\?/g, '%3F')
  return `file://${pathname}`
}

export interface OpenListResp<T = any> {
  code: number
  message: string
  data: T
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function rateLimitDelay(text: string, status = 0) {
  if (status !== 429 && !/TooManyRequests|Requests?/i.test(text))
    return 0
  const match = text.match(/(\d{3,6})/)
  return Math.max(1000, Number(match?.[1] || 3000) + 200)
}

async function fetchOpenListSafe(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, init)
      const text = await response.text()
      const delay = rateLimitDelay(text, response.status)
      if (!delay || attempt === 2)
        return { response, text }
      await sleep(delay)
    } catch (error) {
      const delay = rateLimitDelay(error instanceof Error ? error.message : String(error), 429)
      if (!delay || attempt === 2)
        throw error
      await sleep(delay)
    }
  }
  throw new Error('unreachable')
}

export async function fetchOpenListJson(path: string, init?: RequestInit) {
  const url = `${privateBase}${path}`
  const { response, text } = await fetchOpenListSafe(url, {
    ...init,
    headers: withOpenListHeaders(init?.headers),
  })
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
  const { response, text } = await fetchOpenListSafe(`${privateBase}${path}`, {
    ...init,
    headers: withOpenListHeaders(init?.headers),
  })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${text}`)
  return { response, text }
}

async function requestOpenList<T = any>(path: string, init?: RequestInit): Promise<OpenListResp<T>> {
  try {
    const { response, text } = await fetchOpenListSafe(`${privateBase}/api${path}`, {
      ...init,
      headers: withOpenListHeaders(init?.headers),
    })
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
  get<T = any>(path: string, init?: RequestInit): Promise<OpenListResp<T>> {
    return requestOpenList<T>(path, {
      ...init,
      method: 'GET',
    })
  },
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
