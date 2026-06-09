import { fetchOpenListJson, type OpenListResp } from './request'
import {
  joinOpenListPath,
  normalizeOpenListPath,
} from './file_actions'

type NodeRequire = (id: string) => any

interface LocalMount {
  mountPath: string
  root: string
  allRoots: boolean
}

const SYSTEM_NAMES = new Set(['$RECYCLE.BIN', 'System Volume Information'])
const LOCAL_FS_TIMEOUT_MS = 5000
let cachedMounts: LocalMount[] | null = null

const req = (id: string) => {
  try {
    const fn = (window as any).require as NodeRequire | undefined
    return typeof fn === 'function' ? fn(id) : null
  } catch {
    return null
  }
}

const fsMod = () => req('fs')?.promises
const pathMod = () => req('path')
const osMod = () => req('os')
const processMod = () => req('process') || (typeof process !== 'undefined' ? process : null)

const ok = <T>(data: T): OpenListResp<T> => ({ code: 200, message: 'success', data })
const fail = (message: string, code = 500): OpenListResp => ({ code, message, data: null })
const withTimeout = <T>(task: Promise<T>, message = 'local filesystem timeout') =>
  Promise.race([
    task,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), LOCAL_FS_TIMEOUT_MS)),
  ])

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

function localRoot(storage: any) {
  const addition = parseAddition(storage.addition)
  return String(addition.root_folder_path ?? addition.RootFolderPath ?? '/').trim()
}

function isAllRoots(root: string) {
  return !root || root === '/' || root === '*'
}

export async function clearLocalMountCache() {
  cachedMounts = null
}

window.addEventListener('siyuan-cloud:changed', () => {
  cachedMounts = null
})

export function canUseLocalFs() {
  return !!(fsMod() && pathMod())
}

export async function localMounts() {
  if (cachedMounts)
    return cachedMounts
  if (!canUseLocalFs())
    return cachedMounts = []
  const payload = await fetchOpenListJson('/api/admin/storage/list').catch(() => null)
  const storages = payload?.data?.content || payload?.data || []
  cachedMounts = storages
    .filter((item: any) => !item.disabled && String(item.driver || '').toLowerCase() === 'local')
    .map((item: any) => {
      const root = localRoot(item)
      return { mountPath: normalizeOpenListPath(item.mount_path || '/'), root, allRoots: isAllRoots(root) }
    })
    .filter((item: LocalMount) => item.mountPath !== '/' && (item.allRoots || item.root))
    .sort((a: LocalMount, b: LocalMount) => b.mountPath.length - a.mountPath.length)
  return cachedMounts
}

export async function localMountEntries() {
  return (await localMounts()).map(mount => ({
    name: mount.mountPath.split('/').filter(Boolean)[0],
    path: mount.mountPath,
    is_dir: true,
    size: 0,
    modified: new Date().toISOString(),
    provider: 'Local',
  }))
}

export async function resolveLocalPath(openListPath: string) {
  const clean = normalizeOpenListPath(openListPath || '/')
  const mount = (await localMounts()).find(item => clean === item.mountPath || clean.startsWith(`${item.mountPath}/`))
  if (!mount)
    return null
  const path = pathMod()
  if (!path)
    return null
  const rel = clean === mount.mountPath ? '' : clean.slice(mount.mountPath.length).replace(/^\/+/, '')
  if (mount.allRoots) {
    if (!rel)
      return { mount, root: '', target: '', rel, virtualRoot: true }
    const [first, ...rest] = rel.split('/')
    const root = localDeviceRoot(first)
    if (!root)
      throw new Error('invalid local device')
    const target = path.resolve(root, rest.join('/'))
    if (target !== root && !target.startsWith(root === path.parse(root).root ? root : root + path.sep))
      throw new Error('path escapes local mount root')
    return { mount, root, target, rel }
  }
  const root = path.resolve(mount.root)
  const target = path.resolve(root, rel)
  if (target !== root && !target.startsWith(root === path.parse(root).root ? root : root + path.sep))
    throw new Error('path escapes local mount root')
  return { mount, root, target, rel }
}

function localDeviceRoot(segment: string) {
  const path = pathMod()
  if (!path)
    return ''
  const decoded = safeDecode(String(segment || ''))
  if (/^[A-Za-z]:$/.test(decoded))
    return `${decoded}\\`
  if (decoded === '~')
    return osMod()?.homedir?.() || ''
  if (decoded === 'root')
    return path.parse(processMod()?.cwd?.() || '/').root || '/'
  return decoded.startsWith('@') ? decoded.slice(1) : ''
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function localDevices(mountPath: string) {
  const fs = fsMod()
  const path = pathMod()
  const os = osMod()
  const platform = processMod()?.platform || ''
  const roots: Array<{ name: string, root: string }> = []
  if (platform === 'win32') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    await Promise.all(letters.map(async (letter) => {
      const root = `${letter}:\\`
      try {
        await withTimeout(fs.access(root), `access timeout: ${root}`)
        roots.push({ name: `${letter}:`, root })
      } catch {}
    }))
  } else {
    roots.push({ name: 'root', root: '/' })
    const home = os?.homedir?.()
    if (home && home !== '/')
      roots.push({ name: '~', root: home })
    for (const base of platform === 'darwin' ? ['/Volumes'] : ['/mnt', '/media']) {
      try {
        const entries = await withTimeout(fs.readdir(base, { withFileTypes: true }), `readdir timeout: ${base}`)
        for (const entry of entries) {
          if (entry.name.startsWith('.') || !entry.isDirectory())
            continue
          roots.push({ name: `@${path.join(base, entry.name)}`, root: path.join(base, entry.name) })
        }
      } catch {}
    }
  }
  return roots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => ({
      name: item.name.startsWith('@') ? path.basename(item.root) : item.name,
      path: joinOpenListPath(mountPath, encodeURIComponent(item.name)),
      is_dir: true,
      size: 0,
      modified: new Date().toISOString(),
      provider: 'Local',
    }))
}

async function toEntry(target: string, name: string, openListPath: string) {
  const fs = fsMod()
  const stat = await withTimeout(fs.stat(target), `stat timeout: ${target}`)
  const isDir = stat.isDirectory()
  return {
    name,
    path: normalizeOpenListPath(openListPath),
    is_dir: isDir,
    size: isDir ? 0 : Number(stat.size || 0),
    modified: stat.mtime?.toISOString?.() || new Date().toISOString(),
    created: stat.birthtime?.toISOString?.() || stat.mtime?.toISOString?.() || new Date().toISOString(),
    type: isDir ? 1 : 0,
    provider: 'Local',
    raw_url: isDir ? '' : localFileUrl(target),
    url: isDir ? '' : localFileUrl(target),
  }
}

export function localFileUrl(target: string) {
  const path = pathMod()
  const normalized = path ? path.resolve(target).replace(/\\/g, '/') : String(target).replace(/\\/g, '/')
  return encodeURI(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`).replace(/#/g, '%23')
}

export async function listLocal(path: string, page = 1, perPage = 0) {
  try {
    const resolved = await resolveLocalPath(path)
    if (!resolved)
      return null
    if ((resolved as any).virtualRoot) {
      const content = await localDevices((resolved as any).mount.mountPath)
      return ok({ content, total: content.length, readme: '', header: '', write: true, provider: 'Local', direct_upload_tools: [] })
    }
    const fs = fsMod()
    const pathApi = pathMod()
    const entries = await withTimeout(fs.readdir(resolved.target, { withFileTypes: true }), `readdir timeout: ${resolved.target}`)
    const content = (await Promise.all(entries
      .filter((entry: any) => !SYSTEM_NAMES.has(entry.name))
      .map((entry: any) => toEntry(pathApi.join(resolved.target, entry.name), entry.name, joinOpenListPath(path, entry.name)).catch(() => null))))
      .filter(Boolean)
      .sort((a: any, b: any) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
    const start = perPage > 0 ? Math.max(0, page - 1) * perPage : 0
    return ok({
      content: perPage > 0 ? content.slice(start, start + perPage) : content,
      total: content.length,
      readme: '',
      header: '',
      write: true,
      provider: 'Local',
      direct_upload_tools: [],
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

export async function getLocal(path: string) {
  try {
    const resolved = await resolveLocalPath(path)
    if (!resolved)
      return null
    if ((resolved as any).virtualRoot) {
      return ok({
        name: (resolved as any).mount.mountPath.split('/').filter(Boolean).pop() || 'Local',
        path,
        is_dir: true,
        size: 0,
        modified: new Date().toISOString(),
        type: 1,
        provider: 'Local',
        related: [],
        readme: '',
        header: '',
      })
    }
    const pathApi = pathMod()
    const entry: any = await toEntry(resolved.target, pathApi.basename(resolved.target), path)
    if (!entry.is_dir) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      if ('txt,log,md,markdown,json,xml,yml,yaml,toml,ini,conf,js,ts,jsx,tsx,vue,css,scss,less,html,htm,go,py,java,rb,rs,php,c,cpp,h'.split(',').includes(ext))
        entry.content = await fsMod().readFile(resolved.target, 'utf8')
    }
    return ok({ ...entry, related: [], readme: '', header: '' })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

export async function mkdirLocal(path: string) {
  const resolved = await resolveLocalPath(path)
  if (!resolved)
    return null
  if ((resolved as any).virtualRoot)
    return fail('cannot modify local device root', 400)
  await fsMod().mkdir(resolved.target, { recursive: true })
  return ok(null)
}

export async function removeLocal(dir: string, names: string[]) {
  const resolved = await resolveLocalPath(dir)
  if (!resolved)
    return null
  if ((resolved as any).virtualRoot)
    return fail('cannot remove local device root', 400)
  const pathApi = pathMod()
  for (const name of names) {
    const target = pathApi.resolve(resolved.target, pathApi.basename(String(name || '')))
    await fsMod().rm(target, { recursive: true, force: true })
  }
  return ok(null)
}

export async function renameLocal(path: string, name: string) {
  const resolved = await resolveLocalPath(path)
  if (!resolved)
    return null
  if ((resolved as any).virtualRoot)
    return fail('cannot rename local device root', 400)
  await fsMod().rename(resolved.target, pathMod().join(pathMod().dirname(resolved.target), pathMod().basename(name)))
  return ok(null)
}

export async function copyLocal(srcDir: string, dstDir: string, names: string[]) {
  const src = await resolveLocalPath(srcDir)
  const dst = await resolveLocalPath(dstDir)
  if (!src || !dst)
    return null
  if ((src as any).virtualRoot || (dst as any).virtualRoot)
    return fail('cannot copy local device root', 400)
  const fs = fsMod()
  const path = pathMod()
  await fs.mkdir(dst.target, { recursive: true })
  for (const name of names) {
    const clean = path.basename(String(name || ''))
    const from = path.join(src.target, clean)
    const to = path.join(dst.target, clean)
    if (fs.cp)
      await fs.cp(from, to, { force: false, recursive: true })
    else {
      const stat = await fs.stat(from)
      if (stat.isDirectory())
        throw new Error('local directory copy requires fs.cp support')
      await fs.copyFile(from, to)
    }
  }
  return ok({ tasks: [] })
}

export async function moveLocal(srcDir: string, dstDir: string, names: string[]) {
  const src = await resolveLocalPath(srcDir)
  const dst = await resolveLocalPath(dstDir)
  if (!src || !dst)
    return null
  if ((src as any).virtualRoot || (dst as any).virtualRoot)
    return fail('cannot move local device root', 400)
  const fs = fsMod()
  const path = pathMod()
  await fs.mkdir(dst.target, { recursive: true })
  for (const name of names) {
    const clean = path.basename(String(name || ''))
    const from = path.join(src.target, clean)
    const to = path.join(dst.target, clean)
    try {
      await fs.rename(from, to)
    } catch (error: any) {
      if (error?.code !== 'EXDEV')
        throw error
      if (fs.cp)
        await fs.cp(from, to, { force: false, recursive: true })
      else
        await fs.copyFile(from, to)
      await fs.rm(from, { recursive: true, force: true })
    }
  }
  return ok({ tasks: [] })
}

export async function writeLocal(path: string, data: string | File | Blob = '') {
  const resolved = await resolveLocalPath(path)
  if (!resolved)
    return null
  if ((resolved as any).virtualRoot)
    return fail('cannot write local device root', 400)
  const fs = fsMod()
  await fs.mkdir(pathMod().dirname(resolved.target), { recursive: true })
  const bytes = typeof data === 'string'
    ? data
    : new Uint8Array(await data.arrayBuffer())
  await fs.writeFile(resolved.target, bytes)
  return ok(null)
}
