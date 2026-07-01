import { fetchOpenListJson, type OpenListResp } from './request'
import {
  joinOpenListPath,
  normalizeOpenListPath,
} from './file_actions'

interface DirectMount {
  addition: Record<string, any>
  address: string
  mountPath: string
}

const DIRECT_DRIVERS = new Set(['openlist', 'alist', 'alistv3', 'alist v3'])
let cachedMounts: DirectMount[] | null = null

const ok = <T>(data: T): OpenListResp<T> => ({ code: 200, message: 'success', data })
const fail = (message: string, code = 500): OpenListResp => ({ code, message, data: null })

function parseAddition(addition: any) {
  if (!addition)
    return {}
  if (typeof addition === 'object')
    return addition
  try {
    return JSON.parse(String(addition || '{}'))
  } catch {
    return {}
  }
}

function addressOf(addition: Record<string, any>) {
  const raw = String(addition.url || addition.address || addition.Address || '').trim().replace(/\/+$/, '')
  return raw.replace(/\/(?:admin|@manage)$/i, '')
}

function isDirectHost(address: string) {
  try {
    const host = new URL(address).hostname
    return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  } catch {
    return false
  }
}

function directPath(path: string, mount: DirectMount) {
  const clean = normalizeOpenListPath(path)
  const rel = clean === mount.mountPath ? '/' : clean.slice(mount.mountPath.length).replace(/^\/+/, '')
  const root = String(mount.addition.root_folder_path || mount.addition.root_folder_id || '/')
  return normalizeOpenListPath(joinOpenListPath(root, rel))
}

function withAddress(address: string, url = '') {
  if (!url)
    return ''
  if (/^https?:\/\//i.test(url))
    return url
  return `${address}${url.startsWith('/') ? '' : '/'}${url}`
}

async function request<T>(mount: DirectMount, path: string, body?: Record<string, any>, retry = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (mount.addition.token || mount.addition.Token)
    headers.Authorization = String(mount.addition.token || mount.addition.Token)
  const response = await fetch(`${mount.address}/api${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json()
  if ((payload.code === 401 || payload.code === 403) && retry && (mount.addition.username || mount.addition.Username)) {
    await login(mount)
    return request<T>(mount, path, body, false)
  }
  if (payload.code && payload.code !== 200)
    throw new Error(payload.message || `OpenList code ${payload.code}`)
  return payload.data
}

async function login(mount: DirectMount) {
  const response = await fetch(`${mount.address}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: mount.addition.username || mount.addition.Username || '',
      password: mount.addition.password || mount.addition.Password || '',
    }),
  })
  const payload = await response.json()
  if (payload.code && payload.code !== 200)
    throw new Error(payload.message || `OpenList code ${payload.code}`)
  mount.addition.token = payload.data?.token || ''
}

async function directMounts() {
  if (cachedMounts)
    return cachedMounts
  const payload = await fetchOpenListJson('/api/admin/storage/list').catch(() => null)
  const storages = payload?.data?.content || payload?.data || []
  cachedMounts = storages
    .filter((item: any) => !item.disabled && DIRECT_DRIVERS.has(String(item.driver || '').toLowerCase()))
    .map((item: any) => {
      const addition = parseAddition(item.addition)
      return {
        addition,
        address: addressOf(addition),
        mountPath: normalizeOpenListPath(item.mount_path || '/'),
      }
    })
    .filter((item: DirectMount) => item.mountPath !== '/' && item.address && isDirectHost(item.address))
    .sort((a: DirectMount, b: DirectMount) => b.mountPath.length - a.mountPath.length)
  return cachedMounts
}

async function resolveDirectMount(path: string) {
  const clean = normalizeOpenListPath(path || '/')
  return (await directMounts()).find(item => clean === item.mountPath || clean.startsWith(`${item.mountPath}/`)) || null
}

async function sameDirectMount(srcPath: string, dstPath: string) {
  const src = await resolveDirectMount(srcPath)
  const dst = await resolveDirectMount(dstPath)
  return src && dst === src ? src : null
}

export async function clearOpenListDirectCache() {
  cachedMounts = null
}

window.addEventListener('siyuan-cloud:changed', () => {
  cachedMounts = null
})

export async function listOpenListDirect(path: string, page = 1, perPage = 0, refresh = false) {
  try {
    const mount = await resolveDirectMount(path)
    if (!mount)
      return null
    const data: any = await request(mount, '/fs/list', {
      page,
      per_page: perPage,
      path: directPath(path, mount),
      password: mount.addition.meta_password || '',
      refresh,
    })
    return ok({
      ...data,
      content: (data.content || []).map((item: any) => {
        const url = withAddress(mount.address, item.raw_url || item.url || '')
        return {
          ...item,
          path: joinOpenListPath(path, item.name),
          raw_url: item.is_dir ? '' : url,
          url: item.is_dir ? '' : url,
        }
      }),
      provider: data.provider || 'OpenList',
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

export async function getOpenListDirect(path: string) {
  try {
    const mount = await resolveDirectMount(path)
    if (!mount)
      return null
    const data: any = await request(mount, '/fs/get', {
      path: directPath(path, mount),
      password: mount.addition.meta_password || '',
    })
    const url = withAddress(mount.address, data.raw_url || data.url || '')
    return ok({
      ...data,
      path,
      raw_url: data.is_dir ? '' : url,
      url: data.is_dir ? '' : url,
      provider: data.provider || 'OpenList',
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

export async function mkdirOpenListDirect(path: string) {
  const mount = await resolveDirectMount(path)
  if (!mount)
    return null
  await request(mount, '/fs/mkdir', { path: directPath(path, mount) })
  return ok(null)
}

export async function renameOpenListDirect(path: string, name: string) {
  const mount = await resolveDirectMount(path)
  if (!mount)
    return null
  await request(mount, '/fs/rename', { path: directPath(path, mount), name })
  return ok(null)
}

export async function removeOpenListDirect(dir: string, names: string[]) {
  const mount = await resolveDirectMount(dir)
  if (!mount)
    return null
  await request(mount, '/fs/remove', { dir: directPath(dir, mount), names })
  return ok(null)
}

export async function moveOpenListDirect(srcDir: string, dstDir: string, names: string[]) {
  const mount = await sameDirectMount(srcDir, dstDir)
  if (!mount)
    return null
  await request(mount, '/fs/move', { src_dir: directPath(srcDir, mount), dst_dir: directPath(dstDir, mount), names })
  return ok({ tasks: [] })
}

export async function copyOpenListDirect(srcDir: string, dstDir: string, names: string[]) {
  const mount = await sameDirectMount(srcDir, dstDir)
  if (!mount)
    return null
  await request(mount, '/fs/copy', { src_dir: directPath(srcDir, mount), dst_dir: directPath(dstDir, mount), names })
  return ok({ tasks: [] })
}

export async function writeOpenListDirect(path: string, data: string | File | Blob = '') {
  const mount = await resolveDirectMount(path)
  if (!mount)
    return null
  const headers: Record<string, string> = {
    'File-Path': encodeURIComponent(directPath(path, mount)),
    Password: String(mount.addition.meta_password || ''),
  }
  if (mount.addition.token || mount.addition.Token)
    headers.Authorization = String(mount.addition.token || mount.addition.Token)
  const response = await fetch(`${mount.address}/api/fs/put`, {
    method: 'PUT',
    headers,
    body: data,
  })
  const payload = await response.json()
  return payload.code && payload.code !== 200 ? fail(payload.message || `OpenList code ${payload.code}`, payload.code) : ok(null)
}
