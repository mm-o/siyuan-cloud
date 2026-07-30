import { normalizeResourceUrl, privateBase, r, type OpenListResp } from './request'
import {
  clearLocalMountCache,
  getLocal,
  listLocal,
  copyLocal,
  mkdirLocal,
  moveLocal,
  removeLocal,
  renameLocal,
  writeLocal,
} from './local_fs'
import {
  clearOpenListDirectCache,
  copyOpenListDirect,
  getOpenListDirect,
  listOpenListDirect,
  mkdirOpenListDirect,
  moveOpenListDirect,
  removeOpenListDirect,
  renameOpenListDirect,
  writeOpenListDirect,
} from './openlist_direct'
import { usePlugin } from '@/main'

export { clearLocalMountCache, clearOpenListDirectCache }

const normalizeFsPath = (path: string) => {
  const input = path === undefined || path === null || path === '' ? '/' : String(path)
  const normalized = (input.startsWith('/') ? input : `/${input}`).replace(/\/+/g, '/')
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

interface StoredMount {
  driver: string
  mountPath: string
  rootFolderPath: string
}

let cachedStoredMounts: StoredMount[] | null = null

window.addEventListener('siyuan-cloud:changed', () => {
  cachedStoredMounts = null
})

export const fsGet = (
  path: string = '/',
  password = '',
): Promise<OpenListResp> => {
  return fsGetLocalFirst(path, password)
}

async function fsGetLocalFirst(path: string, password = '') {
  if (await shouldUseKernelFirst(path))
    return fsGetKernel(path, password)
  const local = await getLocal(path)
  if (local)
    return local
  const direct = await getOpenListDirect(path)
  if (direct)
    return direct
  return fsGetKernel(path, password)
}

function fsGetKernel(path: string, password = '') {
  return r.post('/fs/get', {
    path,
    password,
  })
}

export const fsList = (
  path: string = '/',
  password = '',
  page = 1,
  per_page = 0,
  refresh = false,
): Promise<OpenListResp> => {
  return fsListLocalFirst(path, password, page, per_page, refresh)
}

async function fsListLocalFirst(path: string, password = '', page = 1, per_page = 0, refresh = false) {
  if (path === '/')
    return await fsRootFromStoredConfig() || fsListKernel(path, password, page, per_page, refresh)
  const mount = await storedMountForPath(path)
  if (isSiyuanWorkspaceMount(mount)) {
    if (!password) {
      const direct = await fsListSiyuanWorkspaceDirect(path, mount, page, per_page)
      if (direct)
        return direct
    }
    return fsListKernel(path, password, page, per_page, refresh)
  }
  const local = await listLocal(path, page, per_page)
  if (local)
    return local
  const direct = await listOpenListDirect(path, page, per_page, refresh)
  if (direct)
    return direct
  return fsListKernel(path, password, page, per_page, refresh)
}

function fsListKernel(path: string, password = '', page = 1, per_page = 0, refresh = false) {
  return r.post('/fs/list', {
    path,
    password,
    page,
    per_page,
    refresh,
  })
}

export const fsSearch = (
  parent: string = '/',
  keywords = '',
  scope = 0,
  page = 1,
  per_page = 200,
  password = '',
): Promise<OpenListResp> => {
  return r.post('/fs/search', {
    parent,
    keywords,
    scope,
    page,
    per_page,
    password,
  })
}

async function fsRootFromStoredConfig(): Promise<OpenListResp | null> {
  const storages = await storedConfigStorages()
  const root = storageRootResp(storages)
  if (root)
    return root
  return null
}

async function storedConfigStorages(): Promise<any[]> {
  for (const name of ['config.json', 'siyuan-cloud/state.json']) {
    try {
      const value = await usePlugin().loadData(name)
      const config = value && typeof value === 'object' ? value : value ? JSON.parse(String(value)) : null
      if (Array.isArray(config?.storages))
        return config.storages
    } catch {}
  }
  return []
}

function storageRootResp(storages: any[] = []): OpenListResp | null {
  const seen = new Set<string>()
  const content = []
  const now = new Date().toISOString()
  for (const storage of Array.isArray(storages) ? storages : []) {
    const name = storage?.disabled ? '' : String(storage?.mount_path || storage?.mountPath || '/').split('/').filter(Boolean)[0]
    const key = name.toLowerCase()
    if (!name || seen.has(key))
      continue
    seen.add(key)
    content.push({ name, path: `/${name}`, is_dir: true, size: 0, modified: now, created: now, provider: 'mount' })
  }
  return content.length ? { code: 200, message: 'success', data: { content, total: content.length, readme: '', header: '', write: false, write_content_bypass: false, provider: 'mount', direct_upload_tools: [] } } : null
}

async function storedMounts(): Promise<StoredMount[]> {
  if (cachedStoredMounts)
    return cachedStoredMounts
  cachedStoredMounts = (await storedConfigStorages())
    .filter((storage: any) => !storage?.disabled)
    .map(storageMount)
    .filter((mount: StoredMount) => mount.mountPath !== '/')
    .sort((a: StoredMount, b: StoredMount) => b.mountPath.length - a.mountPath.length)
  return cachedStoredMounts
}

async function storedMountForPath(path: string) {
  const clean = normalizeFsPath(path || '/')
  return (await storedMounts()).find(mount => clean === mount.mountPath || clean.startsWith(`${mount.mountPath}/`)) || null
}

async function shouldUseKernelFirst(path: string) {
  return isSiyuanWorkspaceMount(await storedMountForPath(path))
}

function isSiyuanWorkspaceMount(mount: StoredMount | null) {
  return String(mount?.driver || '').toLowerCase() === 'siyuanworkspace'
}

function storageMount(storage: any): StoredMount {
  const addition = storageAddition(storage)
  return {
    driver: String(storage?.driver || ''),
    mountPath: normalizeFsPath(storage?.mount_path || storage?.mountPath || '/'),
    rootFolderPath: String(addition.root_folder_path || addition.rootFolderPath || '/@workspace'),
  }
}

function storageAddition(storage: any) {
  const addition = storage?.addition_json || storage?.addition || {}
  if (addition && typeof addition === 'object')
    return addition
  try {
    return JSON.parse(String(addition || '{}'))
  } catch {
    return {}
  }
}

async function fsListSiyuanWorkspaceDirect(path: string, mount: StoredMount, page = 1, per_page = 0): Promise<OpenListResp | null> {
  try {
    const apiPath = siyuanWorkspaceReadDirPath(path, mount)
    const response = await fetch('/api/file/readDir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: apiPath }),
    })
    if (!response.ok)
      return null
    const payload = await response.json()
    if (payload?.code !== 0 || !Array.isArray(payload?.data))
      return null
    const content = payload.data
      .filter((item: any) => item && item.name)
      .map((item: any) => siyuanWorkspaceDirectObj(path, apiPath, item))
    return {
      code: 200,
      message: 'success',
      data: {
        content: pageItems(content, page, per_page),
        total: content.length,
        readme: '',
        header: '',
        write: true,
        write_content_bypass: false,
        provider: 'siyuan-workspace',
        direct_upload_tools: [],
      },
    }
  } catch {
    return null
  }
}

function siyuanWorkspaceReadDirPath(path: string, mount: StoredMount) {
  const clean = normalizeFsPath(path || '/')
  const rel = clean === mount.mountPath
    ? ''
    : clean.slice(mount.mountPath.length).replace(/^\/+/, '')
  const root = normalizeFsPath(mount.rootFolderPath || '/@workspace').replace(/^\/@workspace\/?/, '').replace(/^\/+/, '')
  return [root, rel].filter(Boolean).join('/')
}

function siyuanWorkspaceDirectObj(dirPath: string, apiDirPath: string, item: any) {
  const isDir = !!(item.isDir || item.is_dir)
  const path = normalizeFsPath(`${dirPath}/${item.name}`)
  const updated = Number(item.updated || 0)
  const modified = new Date((updated > 1e12 ? updated : updated * 1000) || Date.now()).toISOString()
  const rawUrl = isDir ? '' : siyuanWorkspacePublicUrl(`${apiDirPath}/${item.name}`) || openListDownloadRoute(path)
  return {
    name: item.name,
    path,
    size: Number(item.size || 0),
    is_dir: isDir,
    modified,
    created: modified,
    sign: '',
    thumb: '',
    raw_url: rawUrl,
    provider: 'siyuan-workspace',
  }
}

function pageItems<T>(items: T[], page = 1, per_page = 0) {
  const size = Number(per_page || 0)
  if (size <= 0)
    return items
  const current = Math.max(1, Number(page || 1))
  return items.slice((current - 1) * size, current * size)
}

export const indexBuild = (): Promise<OpenListResp> => r.post('/admin/index/build')

export const indexProgress = (): Promise<OpenListResp> => r.get('/admin/index/progress')

export const fsOther = (body: {
  path: string
  method: string
  data?: Record<string, any>
  password?: string
}): Promise<OpenListResp> => {
  return r.post('/fs/other', body)
}

export const fsMkdir = (path: string): Promise<OpenListResp> => {
  return fsMkdirLocalFirst(path)
}

async function fsMkdirLocalFirst(path: string) {
  return await mkdirLocal(path)
    || await mkdirOpenListDirect(path)
    || r.post('/fs/mkdir', { path })
}

export const fsUploadFile = async (
  path: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<OpenListResp> => {
  const local = await writeLocal(path, file)
  if (local) {
    onProgress?.(100)
    return local
  }
  const direct = await writeOpenListDirect(path, file)
  if (direct) {
    onProgress?.(100)
    return direct
  }
  const directUpload = await tryDirectUpload(path, file, onProgress)
  if (directUpload)
    return directUpload
  const content = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
  onProgress?.(40)
  const payload = await r.put('/fs/put', {
    body_encoding: 'base64',
    content,
    mime: file.type || 'application/octet-stream',
    path,
    size: file.size,
  }, {
    headers: { Overwrite: 'false' },
  })
  if (payload.code === 200)
    onProgress?.(100)
  return payload
}

export const fsPutText = async (path: string, content: string): Promise<OpenListResp> => {
  const mount = await storedMountForPath(path)
  if (isSiyuanWorkspaceMount(mount))
    return putSiyuanWorkspaceText(path, mount, content)
  const local = await writeLocal(path, content)
  if (local)
    return local
  const direct = await writeOpenListDirect(path, content, true)
  if (direct)
    return direct
  return r.put('/fs/put', {
    path,
    content,
    mime: 'text/plain;charset=utf-8',
    size: new TextEncoder().encode(content).byteLength,
  }, {
    headers: { Overwrite: 'true' },
  })
}

async function putSiyuanWorkspaceText(path: string, mount: StoredMount, content: string): Promise<OpenListResp> {
  try {
    const form = new FormData()
    const name = path.split('/').filter(Boolean).pop() || 'file.txt'
    form.append('path', siyuanWorkspaceReadDirPath(path, mount))
    form.append('file', new Blob([content], { type: 'text/plain;charset=utf-8' }), name)
    const response = await fetch('/api/file/putFile', {
      method: 'POST',
      body: form,
    })
    const payload = await response.json().catch(() => null)
    if (response.ok && payload?.code === 0)
      return { code: 200, message: 'success', data: { path } }
    return { code: payload?.code || response.status || -1, message: payload?.msg || payload?.message || `HTTP ${response.status}`, data: null }
  } catch (error) {
    return { code: -1, message: error instanceof Error ? error.message : String(error), data: null }
  }
}

async function tryDirectUpload(path: string, file: File, onProgress?: (progress: number) => void): Promise<OpenListResp | null> {
  const info = await r.post<{
    upload_url?: string
    uploadUrl?: string
    method?: string
    headers?: Record<string, string>
  }>('/fs/get_direct_upload_info', {
    file_name: file.name,
    file_size: file.size,
    path,
    tool: 'HttpDirect',
  }, {
    headers: { Overwrite: 'false' },
  })
  const upload = info.code === 200 ? info.data : null
  const url = upload?.upload_url || upload?.uploadUrl
  if (!url)
    return null
  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method || 'PUT', url)
    Object.entries(upload.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, String(value)))
    if (file.type && !Object.keys(upload.headers || {}).some(key => key.toLowerCase() === 'content-type'))
      xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total)
        onProgress?.(Math.min(95, Math.round((event.loaded / event.total) * 95)))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve({ code: 200, message: 'success', data: null })
      } else {
        resolve(null)
      }
    }
    xhr.onerror = () => resolve(null)
    xhr.onabort = () => resolve({ code: -1, message: 'upload canceled', data: null })
    xhr.send(file)
  })
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

export const fsRename = (
  path: string,
  name: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return fsRenameLocalFirst(path, name, overwrite)
}

async function fsRenameLocalFirst(path: string, name: string, overwrite: boolean) {
  return await renameLocal(path, name)
    || await renameOpenListDirect(path, name)
    || r.post('/fs/rename', { path, name, overwrite })
}

export const fsMove = (
  src_dir: string,
  dst_dir: string,
  names: string[],
  overwrite: boolean,
  skip_existing: boolean,
): Promise<OpenListResp> => {
  return fsMoveLocalFirst(src_dir, dst_dir, names, overwrite, skip_existing)
}

async function fsMoveLocalFirst(src_dir: string, dst_dir: string, names: string[], overwrite: boolean, skip_existing: boolean) {
  return await moveLocal(src_dir, dst_dir, names)
    || await moveOpenListDirect(src_dir, dst_dir, names)
    || r.post('/fs/move', {
    src_dir,
    dst_dir,
    names,
    overwrite,
    skip_existing,
  })
}

export const fsCopy = (
  src_dir: string,
  dst_dir: string,
  names: string[],
  overwrite: boolean,
  skip_existing: boolean,
  merge: boolean,
): Promise<OpenListResp> => {
  return fsCopyLocalFirst(src_dir, dst_dir, names, overwrite, skip_existing, merge)
}

async function fsCopyLocalFirst(src_dir: string, dst_dir: string, names: string[], overwrite: boolean, skip_existing: boolean, merge: boolean) {
  return await copyLocal(src_dir, dst_dir, names)
    || await copyOpenListDirect(src_dir, dst_dir, names)
    || r.post('/fs/copy', {
    src_dir,
    dst_dir,
    names,
    overwrite,
    skip_existing,
    merge,
  })
}

export const fsRemove = (dir: string, names: string[]): Promise<OpenListResp> => {
  return fsRemoveLocalFirst(dir, names)
}

async function fsRemoveLocalFirst(dir: string, names: string[]) {
  return await removeLocal(dir, names)
    || await removeOpenListDirect(dir, names)
    || r.post('/fs/remove', { dir, names })
}

export const fsNewFile = (
  path: string,
  password: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return fsNewFileLocalFirst(path, password, overwrite)
}

async function fsNewFileLocalFirst(path: string, password: string, overwrite: boolean) {
  return await writeLocal(path, '')
    || await writeOpenListDirect(path, '')
    || r.put('/fs/put', undefined, {
    headers: {
      'File-Path': encodeURIComponent(path),
      Password: password,
      Overwrite: overwrite.toString(),
    },
  })
}

export const shareCreate = (body: {
  id?: string
  files: string[]
  pwd?: string
  remark?: string
  readme?: string
  header?: string
  expires?: string | null
  max_accessed?: number
  disabled?: boolean
}): Promise<OpenListResp> => {
  return r.post('/share/create', body)
}

export const fsTorrentGenerate = (body: {
  path: string
  with_cas?: boolean
}): Promise<OpenListResp> => {
  return r.post('/fs/torrent/generate', body)
}

export const fsTorrentParse = (body: {
  torrent_data: string
}): Promise<OpenListResp> => {
  return r.post('/fs/torrent/parse', body)
}

export function openListAbsoluteUrl(url: string, options: { escapeHash?: boolean, escapeQuestion?: boolean } = {}) {
  if (!url)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return normalizeResourceUrl(url, options)
  return normalizeResourceUrl(`${location.origin}${url.startsWith('/') ? '' : '/'}${url}`, options)
}

export function openListStableUrl(url: string, options: { escapeHash?: boolean, escapeQuestion?: boolean } = {}) {
  if (!url)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return normalizeResourceUrl(url, options)
  return normalizeResourceUrl(`${url.startsWith('/') ? '' : '/'}${url}`, options)
}

export function siyuanWorkspacePublicUrl(path: string) {
  const parts = String(path || '').split('/').filter(Boolean)
  const index = parts.indexOf('data')
  return index >= 0 && parts.length > index + 2 ? `/${parts.slice(index + 1).join('/')}` : ''
}

function openListDownloadRoute(path: string, data: Record<string, any> = {}) {
  const sign = data.sign ? `?sign=${encodeURIComponent(String(data.sign))}` : ''
  const route = openListAbsoluteUrl(`${privateBase}/d${path}`, { escapeHash: true, escapeQuestion: true })
  return `${route}${sign}`
}

export async function resolveOpenListFile(path: string, password = '') {
  if (await shouldUseKernelFirst(path))
    return resolveOpenListFileKernel(path, password)
  const local = await getLocal(path)
  if (local?.code === 200) {
    const data = local.data || {}
    const url = String(data.raw_url || data.url || '')
    return {
      ...data,
      path,
      raw_url: url,
      d_url: normalizeResourceUrl(url),
      url: normalizeResourceUrl(url),
    }
  }
  const direct = await getOpenListDirect(path)
  if (direct?.code === 200) {
    const data = direct.data || {}
    const url = String(data.raw_url || data.url || '')
    return {
      ...data,
      path,
      raw_url: url,
      d_url: normalizeResourceUrl(url),
      url: normalizeResourceUrl(url),
    }
  }
  return resolveOpenListFileKernel(path, password)
}

async function resolveOpenListFileKernel(path: string, password = '') {
  const payload = await fsGet(path, password)
  if (payload.code !== 200)
    throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
  const data = payload.data || {}
  const dUrl = openListDownloadRoute(path, data)
  return {
    ...data,
    path,
    raw_url: String(data.raw_url || data.url || ''),
    d_url: dUrl,
    url: data.raw_url || data.url ? openListAbsoluteUrl(String(data.raw_url || data.url)) : dUrl,
  }
}
