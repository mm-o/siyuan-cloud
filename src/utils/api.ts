import { normalizeResourceUrl, privateBase, r, withOpenListHeaders, type OpenListResp } from './request'
import {
  clearLocalMountCache,
  getLocal,
  listLocal,
  localMountEntries,
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

export { clearLocalMountCache, clearOpenListDirectCache }

export const fsGet = (
  path: string = '/',
  password = '',
): Promise<OpenListResp> => {
  return fsGetLocalFirst(path, password)
}

async function fsGetLocalFirst(path: string, password = '') {
  const local = await getLocal(path)
  if (local)
    return local
  const direct = await getOpenListDirect(path)
  if (direct)
    return direct
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
  const local = await listLocal(path, page, per_page)
  if (local)
    return local
  const direct = await listOpenListDirect(path, page, per_page, refresh)
  if (direct)
    return direct
  if (path === '/') {
    const payload = await r.post('/fs/list', { path, password, page, per_page, refresh })
    const localEntries = await localMountEntries()
    if (!localEntries.length || payload.code !== 200)
      return payload
    const content = mergeRootEntries(localEntries, payload.data?.content || [])
    return {
      ...payload,
      data: {
        ...payload.data,
        content,
        total: content.length,
      },
    }
  }
  return r.post('/fs/list', {
    path,
    password,
    page,
    per_page,
    refresh,
  })
}

function mergeRootEntries(localEntries: any[], remoteEntries: any[]) {
  const seen = new Set<string>()
  return [...localEntries, ...remoteEntries].filter((item) => {
    const raw = item?.path || (item?.name ? `/${item.name}` : '')
    const key = String(raw).replace(/\/+$/, '').toLowerCase() || '/'
    if (!key || seen.has(key))
      return false
    seen.add(key)
    return true
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

export const fsOther = (body: {
  path: string
  method: string
  data?: Record<string, any>
  password?: string
}): Promise<OpenListResp> => {
  return r.post('/fs/other', body)
}

export const fsArchiveList = (
  path: string,
  inner_path = '/',
  page = 1,
  per_page = 200,
  refresh = false,
  archive_pass = '',
  password = '',
): Promise<OpenListResp> => {
  return r.post('/fs/archive/list', {
    archive_pass,
    inner_path,
    page,
    password,
    path,
    per_page,
    refresh,
  })
}

export const fsArchiveMeta = (
  path: string,
  refresh = false,
  archive_pass = '',
  password = '',
): Promise<OpenListResp> => {
  return r.post('/fs/archive/meta', {
    archive_pass,
    password,
    path,
    refresh,
  })
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
  const blocked = await uploadBlockedByProvider(path)
  if (blocked)
    return blocked
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

async function uploadBlockedByProvider(path: string): Promise<OpenListResp | null> {
  const parent = path.replace(/\/[^/]*$/, '') || '/'
  const payload = await r.post('/fs/list', { path: parent, page: 1, per_page: 1 })
  if (payload.code === 200 && payload.data?.provider === 'WPS')
    return { code: 501, message: 'WPS upload is disabled in the SiYuan kernel JavaScript runtime to avoid blocking SiYuan', data: null }
  return null
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
