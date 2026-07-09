import {
  Menu,
  confirm,
  showMessage,
} from 'siyuan'
import { fsRemove, resolveOpenListFile } from '@/utils/api'
import {
  escapeHtml,
  itemStableUrl,
  openListFileKinds,
  promptText,
  requireModule,
  selectSavePath,
  type OpenListUrlItem,
} from '@/utils/file_ui'
import { handleResp } from '@/utils/handle_resp'
import { usePlugin } from '@/main'
import { formatResourceUrlForMarkdown, openListJson, withOpenListAuthQuery, withOpenListHeaders } from '@/utils/request'
import { createShareForPaths } from '@/utils/share'

export interface OpenListFileItem {
  name: string
  size?: number
  is_dir: boolean
  path?: string
  parent?: string
  modified?: string
  raw_url?: string
  url?: string
}

type TranslateFallback = (key: string, fallback: string) => string
const MAX_DOWNLOADS = 2
const MOTRIX_NEXT_PORT = 29110
const MOTRIX_NEXT_DEFAULT_API = `http://127.0.0.1:${MOTRIX_NEXT_PORT}`
const MOTRIX_NEXT_SETTINGS = 'siyuan-cloud-motrix-next.json'
let activeDownloads = 0
const queuedDownloads: Array<() => void> = []

export const normalizeOpenListPath = (path: string) => {
  const input = path === undefined || path === null || path === '' ? '/' : String(path)
  const slash = input.startsWith('/') ? input : `/${input}`
  const normalized = slash.replace(/\/+/g, '/')
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

export const joinOpenListPath = (dir: string, name: string) =>
  normalizeOpenListPath(`${normalizeOpenListPath(dir)}/${String(name || '').replace(/^\/+/, '')}`)

export const parentOpenListPath = (path: string) => {
  const clean = normalizeOpenListPath(path)
  if (clean === '/')
    return '/'
  return clean.slice(0, clean.lastIndexOf('/')) || '/'
}

export const baseOpenListName = (path: string) => {
  const clean = normalizeOpenListPath(path)
  return clean === '/' ? '' : clean.split('/').pop() || ''
}

export const itemOpenListPath = (item: OpenListFileItem, currentPath: string) =>
  item.path ? normalizeOpenListPath(item.path) : joinOpenListPath(currentPath, item.name)

export function selectedOpenListGroups(items: OpenListFileItem[], currentPath: string) {
  const groups = new Map<string, string[]>()
  items.forEach((item) => {
    const path = itemOpenListPath(item, currentPath)
    const dir = parentOpenListPath(path)
    const name = baseOpenListName(path)
    if (!name)
      return
    groups.set(dir, [...(groups.get(dir) || []), name])
  })
  return [...groups.entries()].map(([dir, names]) => ({ dir, names }))
}

export async function deleteOpenListSelection(options: {
  currentPath: string
  items: OpenListFileItem[]
  t: (key: string) => string
  tf: (key: string, fallback: string) => string
  clearSelection: () => void
  refresh: () => Promise<void> | void
}) {
  const groups = selectedOpenListGroups(options.items, options.currentPath)
  if (!groups.length)
    return
  confirm(
    options.tf('deleteFile', 'Delete'),
    options.tf('deleteConfirm', 'Delete selected items?'),
    async () => {
      for (const group of groups) {
        const resp = await fsRemove(group.dir, group.names)
        if (resp.code !== 200) {
          handleResp(resp)
          return
        }
      }
      showMessage(options.tf('deleteDone', 'Deleted'), 2000)
      options.clearSelection()
      await options.refresh()
      window.dispatchEvent(new CustomEvent('siyuan-cloud:changed'))
    },
  )
}

export async function downloadOpenListItem<T extends OpenListFileItem>(options: {
  item: T
  itemPath: (item: T) => string
  targetPath?: string
  tf?: TranslateFallback
  onProgress?: (progress: number) => void
}) {
  if (options.item.is_dir)
    return 'cancelled'
  const path = options.itemPath(options.item)
  const targetPath = options.targetPath ?? await selectSavePath(options.item.name, {
    cancel: options.tf?.('cancel', 'Cancel'),
    confirm: options.tf?.('download', 'Download'),
    title: options.tf?.('saveAs', 'Save as'),
  })
  if (!targetPath)
    return 'cancelled'
  await enqueueDownload(async () => {
    const file = await resolveOpenListFile(path)
    await streamDownloadToFile(file.d_url || file.url, targetPath, options.onProgress, Number(file.size || options.item.size || 0))
  })
  return 'saved'
}

function enqueueDownload(task: () => Promise<void>) {
  return new Promise<void>((resolve, reject) => {
    const run = async () => {
      activeDownloads += 1
      try {
        await task()
        resolve()
      } catch (error) {
        reject(error)
      } finally {
        activeDownloads -= 1
        queuedDownloads.shift()?.()
      }
    }
    activeDownloads < MAX_DOWNLOADS ? run() : queuedDownloads.push(run)
  })
}

async function streamDownloadToFile(url: string, targetPath: string, onProgress?: (progress: number) => void, totalHint = 0) {
  const fs = requireModule('fs')
  const path = requireModule('path')
  if (!fs?.createWriteStream || !fs?.promises || !path?.dirname)
    throw new Error('local filesystem is unavailable')
  const copied = await copyFileUrl(url, targetPath, fs, path, onProgress)
  if (copied)
    return
  const response = await fetch(url, { headers: downloadHeaders(url) })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)
  if (!response.body?.getReader)
    throw new Error('streaming download is unavailable')
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.siyuan-cloud-download`
  const stream = fs.createWriteStream(tempPath)
  const write = (chunk: Uint8Array) => new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error: Error | null | undefined) => error ? reject(error) : resolve())
  })
  const reader = response.body.getReader()
  const total = Number(response.headers.get('content-length') || totalHint || 0)
  let loaded = 0
  let completed = false
  let lastProgress = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        completed = true
        break
      }
      loaded += value.byteLength
      await write(value)
      if (total) {
        const progress = Math.min(99, Math.round((loaded / total) * 100))
        if (progress !== lastProgress) {
          lastProgress = progress
          onProgress?.(progress)
        }
      }
      if (total && loaded >= total)
        break
    }
    if (!completed)
      await reader.cancel().catch(() => undefined)
    await new Promise<void>((resolve, reject) => stream.end((error: Error | null | undefined) => error ? reject(error) : resolve()))
    await fs.promises.rename(tempPath, targetPath)
    onProgress?.(100)
  } catch (error) {
    stream.destroy()
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function copyFileUrl(url: string, targetPath: string, fs: any, path: any, onProgress?: (progress: number) => void) {
  if (!String(url || '').toLowerCase().startsWith('file://'))
    return false
  const fileURLToPath = requireModule('url')?.fileURLToPath
  if (!fileURLToPath)
    return false
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.promises.copyFile(fileURLToPath(url), targetPath)
  onProgress?.(100)
  return true
}

function downloadHeaders(url: string) {
  const target = new URL(url, location.href)
  return target.origin === location.origin ? withOpenListHeaders() : {}
}

function isPluginPrivateRoute(url: string) {
  const target = new URL(url, location.href)
  return target.origin === location.origin && target.pathname.startsWith('/plugin/private/siyuan-cloud/')
}

export async function sendOpenListItemToMotrixNext<T extends OpenListFileItem>(options: {
  item: T
  itemPath: (item: T) => string
  tf: TranslateFallback
}) {
  if (options.item.is_dir)
    return
  const file = await resolveOpenListFile(options.itemPath(options.item))
  const settings = await loadMotrixNextSettings()
  let url = withOpenListAuthQuery(new URL(file.d_url || file.url, location.href).href)
  url = await prepareMotrixNextDownloadUrl(url, settings, options.tf) || url
  const payload = {
    url,
    finalUrl: url,
    filename: options.item.name,
    userAgent: navigator.userAgent,
  }
  let response = await postMotrixNextAdd(payload, settings)
  if (response.status === 401) {
    settings.apiSecret = await promptText({
      title: options.tf('motrixNextApiSecret', 'Motrix Next API secret'),
      value: settings.apiSecret,
      placeholder: options.tf('motrixNextApiSecretPlaceholder', 'Paste Extension API secret'),
      cancelText: options.tf('cancel', 'Cancel'),
      confirmText: options.tf('confirm', 'Confirm'),
    }) || ''
    if (!settings.apiSecret)
      return
    response = await postMotrixNextAdd(payload, settings)
  }
  if (!response.ok && response.status !== 401) {
    const apiUrl = await promptText({
      title: options.tf('motrixNextApiUrl', 'Motrix Next API URL'),
      value: settings.apiUrl,
      placeholder: MOTRIX_NEXT_DEFAULT_API,
      cancelText: options.tf('cancel', 'Cancel'),
      confirmText: options.tf('confirm', 'Confirm'),
    }) || ''
    if (apiUrl) {
      settings.apiUrl = normalizeMotrixNextApiUrl(apiUrl)
      response = await postMotrixNextAdd(payload, settings)
    }
  }
  if (response.ok) {
    await saveMotrixNextSettings(settings)
    showMessage(options.tf('motrixNextStarted', 'Sent to Motrix Next'), 2000)
    return
  }
  if (!isPluginPrivateRoute(url)) {
    openMotrixNextProtocol(url, options.item.name)
    return
  }
  throw new Error(response.message || options.tf('motrixNextUnavailable', 'Motrix Next is unavailable'))
}

async function postMotrixNextAdd(payload: unknown, settings: MotrixNextSettings) {
  const apiUrl = normalizeMotrixNextApiUrl(settings.apiUrl)
  const secret = settings.apiSecret
  const response = await postMotrixNextKernel(apiUrl, payload, secret)
  if (response.ok || response.status === 401)
    return response
  if (apiUrl !== MOTRIX_NEXT_DEFAULT_API)
    return response
  return await postMotrixNextBrowser(apiUrl, payload, secret)
}

async function postMotrixNextKernel(apiUrl: string, payload: unknown, secret: string) {
  try {
    const response = await openListJson('/api/fs/motrix_next/add', { api_url: apiUrl, api_secret: secret, payload })
    return { ok: true, status: 200, message: response.message || '' }
  } catch (error) {
    return motrixNextErrorResponse(error)
  }
}

async function postMotrixNextBrowser(apiUrl: string, payload: unknown, secret: string) {
  try {
    const response = await fetch(`${apiUrl}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? '' : await response.text().catch(() => `HTTP ${response.status}`),
    }
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : String(error) }
  }
}

function motrixNextErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const status = Number(message.match(/(?:HTTP|code)\s+(\d{3})/i)?.[1] || 0)
  return { ok: false, status, message }
}

function openMotrixNextProtocol(url: string, filename: string) {
  location.href = `motrixnext://new?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
}

type MotrixNextSettings = {
  apiUrl: string
  apiSecret: string
  publicBaseUrl: string
}

function normalizeMotrixNextApiUrl(value = '') {
  return String(value || MOTRIX_NEXT_DEFAULT_API).trim().replace(/\/+$/, '') || MOTRIX_NEXT_DEFAULT_API
}

async function loadMotrixNextSettings(): Promise<MotrixNextSettings> {
  try {
    const settings = await usePlugin().loadData(MOTRIX_NEXT_SETTINGS)
    return {
      apiUrl: normalizeMotrixNextApiUrl(settings?.apiUrl),
      apiSecret: String(settings?.apiSecret || ''),
      publicBaseUrl: normalizeMotrixNextPublicBaseUrl(settings?.publicBaseUrl),
    }
  } catch {
    return { apiUrl: MOTRIX_NEXT_DEFAULT_API, apiSecret: '', publicBaseUrl: '' }
  }
}

async function saveMotrixNextSettings(settings: MotrixNextSettings) {
  await usePlugin().saveData(MOTRIX_NEXT_SETTINGS, {
    apiUrl: normalizeMotrixNextApiUrl(settings.apiUrl),
    apiSecret: settings.apiSecret,
    publicBaseUrl: normalizeMotrixNextPublicBaseUrl(settings.publicBaseUrl),
  })
}

async function prepareMotrixNextDownloadUrl(url: string, settings: MotrixNextSettings, tf: TranslateFallback) {
  if (normalizeMotrixNextApiUrl(settings.apiUrl) === MOTRIX_NEXT_DEFAULT_API || !isPluginPrivateRoute(url))
    return url
  const target = new URL(url)
  if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
    return url
  if (!settings.publicBaseUrl) {
    settings.publicBaseUrl = normalizeMotrixNextPublicBaseUrl(await promptText({
      title: tf('motrixNextPublicBaseUrl', 'Siyuan Cloud external URL'),
      value: location.origin,
      placeholder: 'http://192.168.1.2:6806',
      cancelText: tf('cancel', 'Cancel'),
      confirmText: tf('confirm', 'Confirm'),
    }) || '')
  }
  if (!settings.publicBaseUrl)
    return null
  const base = new URL(settings.publicBaseUrl)
  target.protocol = base.protocol
  target.host = base.host
  return target.href
}

function normalizeMotrixNextPublicBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

export async function copyOpenListItemLink<T extends OpenListUrlItem & { name: string }>(options: {
  item: T
  path: string
  t: (key: string) => string
  link?: (item: T, path: string) => string
}) {
  await navigator.clipboard?.writeText(options.link?.(options.item, options.path) || `[${options.item.name}](${itemStableUrl(options.item, options.path)})`)
  showMessage(options.t('linkCopied'), 2000)
}

export async function shareOpenListSelection<T extends OpenListFileItem>(options: {
  items: T[]
  itemPath: (item: T) => string
  tf: TranslateFallback
}) {
  await createShareForPaths({
    paths: options.items.map(item => options.itemPath(item)),
    tf: options.tf,
  })
}

export const fallbackTranslator = (t: (key: string) => string): TranslateFallback =>
  (key, fallback) => {
    const value = t(key)
    return value === key ? fallback : value
  }

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() || ''
const escapeMdText = (value: string) => value.replace(/([\\[\]])/g, '\\$1')

export function openListDocumentLink<T extends OpenListUrlItem & { name: string; is_dir?: boolean }>(options: {
  item: T
  path: string
}) {
  const name = escapeMdText(options.item.name)
  if (!options.item.is_dir) {
    const ext = extensionOf(options.item.name)
    const tag = openListFileKinds.audio.has(ext) ? 'audio' : openListFileKinds.video.has(ext) ? 'video' : ''
    if (tag) {
      const url = escapeHtml(formatResourceUrlForMarkdown(itemStableUrl(options.item, options.path)))
      return `<${tag} controls src="${url}"></${tag}>`
    }
    if (openListFileKinds.image.has(ext)) {
      const url = formatResourceUrlForMarkdown(itemStableUrl(options.item, options.path))
      return `![${name}](${url})`
    }
  }
  return `[${name}](siyuan://plugins/siyuan-cloud/open?path=${normalizeOpenListPath(options.path)})`
}

export function openListDragHtml(markdown: string) {
  const link = /^(!?)\[(.*)]\((.*)\)$/.exec(markdown)
  if (!link)
    return markdown
  return link[1]
    ? `<img alt="${escapeHtml(link[2])}" src="${escapeHtml(link[3])}">`
    : `<a href="${escapeHtml(link[3])}">${escapeHtml(link[2])}</a>`
}

export function openOpenListFileItemMenu(options: {
  event: MouseEvent
  item: OpenListFileItem
  isSelected: (item: OpenListFileItem) => boolean
  selectOnly: (item: OpenListFileItem) => void
  openFile: (item: OpenListFileItem) => void | Promise<void>
  browseArchive?: (item: OpenListFileItem) => void | Promise<void>
  downloadItem: (item: OpenListFileItem) => void | Promise<void>
  sendToMotrixNext?: (item: OpenListFileItem) => void | Promise<void>
  copyLink: (item: OpenListFileItem, path: string) => void | Promise<void>
  renameSelection: () => void | Promise<void>
  copySelection: () => void | Promise<void>
  moveSelection: () => void | Promise<void>
  shareSelection: () => void | Promise<void>
  deleteSelection: () => void | Promise<void>
  itemPath: (item: OpenListFileItem) => string
  t: (key: string) => string
  tf: (key: string, fallback: string) => string
}) {
  if (!options.isSelected(options.item))
    options.selectOnly(options.item)
  const menu = new Menu('siyuan-cloud-file-item')
  const path = options.itemPath(options.item)
  menu.addItem({
    icon: options.item.is_dir ? 'iconFolder' : 'iconOpen',
    label: options.t('open'),
    click: () => options.openFile(options.item),
  })
  if (options.browseArchive) {
    menu.addItem({
      icon: 'iconOpenListZip',
      label: options.tf('browseArchive', 'Browse archive'),
      click: () => options.browseArchive?.(options.item),
    })
  }
  if (!options.item.is_dir) {
    menu.addItem({
      icon: 'iconDownload',
      label: options.tf('download', 'Download'),
      click: () => options.downloadItem(options.item),
    })
    menu.addItem({
      icon: 'iconDownload',
      label: options.tf('sendToMotrixNext', 'Send to Motrix Next'),
      click: async () => {
        try {
          await (options.sendToMotrixNext?.(options.item) ?? sendOpenListItemToMotrixNext({ item: options.item, itemPath: options.itemPath, tf: options.tf }))
        } catch (error) {
          showMessage(error instanceof Error ? error.message : String(error), 4000, 'error')
        }
      },
    })
    menu.addItem({
      icon: 'iconLink',
      label: options.t('copyLink'),
      click: () => options.copyLink(options.item, path),
    })
  }
  menu.addSeparator({ id: 'separator_edit' })
  menu.addItem({ icon: 'iconEdit', label: options.tf('rename', 'Rename'), click: () => options.renameSelection() })
  menu.addItem({ icon: 'iconCopy', label: options.tf('copy', 'Copy'), click: () => options.copySelection() })
  menu.addItem({ icon: 'iconMove', label: options.tf('move', 'Move'), click: () => options.moveSelection() })
  menu.addItem({ icon: 'iconLink', label: options.tf('share', 'Share'), click: () => options.shareSelection() })
  menu.addSeparator({ id: 'separator_remove' })
  menu.addItem({ icon: 'iconTrashcan', label: options.t('deleteFile'), click: () => options.deleteSelection() })
  menu.open({ x: options.event.clientX, y: options.event.clientY })
}
