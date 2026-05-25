export const privateBase = '/plugin/private/siyuan-cloud'

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
