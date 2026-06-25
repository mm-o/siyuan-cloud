import { privateBase, r, type OpenListResp } from './request'
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

export { clearLocalMountCache }

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
  return mkdirLocal(path).then(local => local || r.post('/fs/mkdir', { path }))
}

export const fsWriteFile = async (path: string, file: File | Blob | string): Promise<OpenListResp> => {
  const local = await writeLocal(path, file)
  if (local)
    return local
  if (typeof file === 'string')
    return r.put('/fs/put', file, { headers: { 'File-Path': encodeURIComponent(path), Overwrite: 'false' } })
  const form = new FormData()
  form.append('file', file, file instanceof File ? file.name : 'file')
  const response = await fetch(`${privateBase}/api/fs/form`, {
    method: 'PUT',
    headers: { 'File-Path': encodeURIComponent(path), Overwrite: 'false' },
    body: form,
  })
  const payload = await response.json()
  return response.ok ? payload : { code: response.status, message: payload?.message || `HTTP ${response.status}`, data: null }
}

export const fsRename = (
  path: string,
  name: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return renameLocal(path, name).then(local => local || r.post('/fs/rename', { path, name, overwrite }))
}

export const fsMove = (
  src_dir: string,
  dst_dir: string,
  names: string[],
  overwrite: boolean,
  skip_existing: boolean,
): Promise<OpenListResp> => {
  return moveLocal(src_dir, dst_dir, names).then(local => local || r.post('/fs/move', {
    src_dir,
    dst_dir,
    names,
    overwrite,
    skip_existing,
  }))
}

export const fsCopy = (
  src_dir: string,
  dst_dir: string,
  names: string[],
  overwrite: boolean,
  skip_existing: boolean,
  merge: boolean,
): Promise<OpenListResp> => {
  return copyLocal(src_dir, dst_dir, names).then(local => local || r.post('/fs/copy', {
    src_dir,
    dst_dir,
    names,
    overwrite,
    skip_existing,
    merge,
  }))
}

export const fsRemove = (dir: string, names: string[]): Promise<OpenListResp> => {
  return removeLocal(dir, names).then(local => local || r.post('/fs/remove', { dir, names }))
}

export const fsNewFile = (
  path: string,
  password: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return writeLocal(path, '').then(local => local || r.put('/fs/put', undefined, {
    headers: {
      'File-Path': encodeURIComponent(path),
      Password: password,
      Overwrite: overwrite.toString(),
    },
  }))
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

export function openListAbsoluteUrl(url: string) {
  if (!url)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return url
  return `${location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

function openListDownloadRoute(path: string, data: Record<string, any> = {}) {
  const sign = data.sign ? `?sign=${encodeURIComponent(String(data.sign))}` : ''
  return openListAbsoluteUrl(`${privateBase}/d${path}${sign}`)
}

export async function resolveOpenListFile(path: string, password = '') {
  const local = await getLocal(path)
  if (local?.code === 200) {
    const data = local.data || {}
    return {
      ...data,
      path,
      raw_url: String(data.raw_url || data.url || ''),
      d_url: String(data.raw_url || data.url || ''),
      url: String(data.raw_url || data.url || ''),
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
