import { privateBase, r, type OpenListResp } from './request'

export {
  fetchOpenListJson,
  fetchOpenListText,
  openListJson,
  privateBase,
  type OpenListResp,
} from './request'

export const fsGet = (
  path: string = '/',
  password = '',
): Promise<OpenListResp> => {
  return r.post('/fs/get', {
    path: path,
    password: password,
  })
}

export const fsList = (
  path: string = '/',
  password = '',
  page = 1,
  per_page = 0,
  refresh = false,
): Promise<OpenListResp> => {
  return r.post('/fs/list', {
    path,
    password,
    page,
    per_page,
    refresh,
  })
}

export const fsMkdir = (path: string): Promise<OpenListResp> => {
  return r.post('/fs/mkdir', { path })
}

export const fsRename = (
  path: string,
  name: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return r.post('/fs/rename', { path, name, overwrite })
}

export const fsMove = (
  src_dir: string,
  dst_dir: string,
  names: string[],
  overwrite: boolean,
  skip_existing: boolean,
): Promise<OpenListResp> => {
  return r.post('/fs/move', {
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
  return r.post('/fs/copy', {
    src_dir,
    dst_dir,
    names,
    overwrite,
    skip_existing,
    merge,
  })
}

export const fsRemove = (dir: string, names: string[]): Promise<OpenListResp> => {
  return r.post('/fs/remove', { dir, names })
}

export const fsNewFile = (
  path: string,
  password: string,
  overwrite: boolean,
): Promise<OpenListResp> => {
  return r.put('/fs/put', undefined, {
    headers: {
      'File-Path': encodeURIComponent(path),
      Password: password,
      Overwrite: overwrite.toString(),
    },
  })
}

export function openListAbsoluteUrl(url: string) {
  if (!url)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return url
  return `${location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

export function openListProxyUrl(path: string) {
  return `${privateBase}/p${path.split('/').map(part => encodeURIComponent(part)).join('/')}`
}

export function openListDownloadRoute(path: string, data: Record<string, any> = {}) {
  const sign = data.sign ? `?sign=${encodeURIComponent(String(data.sign))}` : ''
  return openListAbsoluteUrl(`${privateBase}/d${path}${sign}`)
}

export function openListDownloadUrl(path: string, data: Record<string, any> = {}) {
  const rawUrl = String(data.raw_url || data.url || '')
  return rawUrl ? openListAbsoluteUrl(rawUrl) : openListDownloadRoute(path, data)
}

export async function resolveOpenListFile(path: string, password = '') {
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
    url: openListDownloadUrl(path, data),
  }
}
