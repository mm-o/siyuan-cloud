import { Dialog, showMessage } from 'siyuan'
import {
  openListAbsoluteUrl,
  siyuanWorkspacePublicUrl,
} from '@/utils/api'
import { normalizeResourceUrl, privateBase } from '@/utils/request'

export function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const escapeAttr = escapeHtml

export function formatSize(size = 0, emptyZero = false) {
  if (emptyZero && !size)
    return ''
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function showErrorMessage(error: unknown, timeout = 4000) {
  showMessage(error instanceof Error ? error.message : String(error), timeout, 'error')
}

export interface OpenListUrlItem {
  raw_url?: string
  url?: string
}

export const openListFileKinds = {
  audio: new Set('mp3,wav,aac,m4a,flac,ogg'.split(',')),
  image: new Set('jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(',')),
  text: new Set('txt,log,md,markdown,json,xml,yml,yaml,toml,ini,conf,sy,js,ts,jsx,tsx,vue,css,scss,less,html,htm,go,py,java,rb,rs,php,c,cpp,h,hpp,sh,bash,bat,cmd,ps1,sql'.split(',')),
  video: new Set('mp4,mkv,avi,mov,rmvb,webm,flv,m3u8,m4v'.split(',')),
}
const openListReaderExts = new Set('epub,pdf,mobi,azw3,azw,fb2,cbz,txt'.split(','))

type PathInput<T> = string | ((item: T) => string)

const pathOf = <T>(item: T, path: PathInput<T>) =>
  typeof path === 'function' ? path(item) : path

function extensionOfName(name: string) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

export function openListFileKind(name: string, isDir = false) {
  if (isDir)
    return ''
  const ext = extensionOfName(name)
  return Object.entries(openListFileKinds).find(([, exts]) => exts.has(ext))?.[0] || ''
}

export function proxyPreviewUrl(path: string, absolute = true) {
  const route = `${privateBase}/p${String(path || '/').startsWith('/') ? path : `/${path}`}`
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
  return absolute ? openListAbsoluteUrl(route) : route
}

export function mediaProtocolUrl(path: string) {
  const normalized = normalizeOpenListPath(path)
  return `siyuan-cloud://${normalized}`
}

function normalizeOpenListPath(path: string) {
  const input = path ? String(path) : '/'
  const slash = input.startsWith('/') ? input : `/${input}`
  const normalized = slash.replace(/\/+/g, '/')
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

export function openListPluginOpenUrl(path: string) {
  return `siyuan://plugins/siyuan-cloud/open?path=${encodeURIComponent(normalizeOpenListPath(path))}`
}

export function itemOpenUrl<T extends OpenListUrlItem>(item: T, path: PathInput<T>) {
  const resolvedPath = pathOf(item, path)
  const url = siyuanWorkspacePublicUrl(resolvedPath) || String(item.raw_url || item.url || '')
  return url ? normalizeResourceUrl(url) : proxyPreviewUrl(resolvedPath)
}

export function itemStableUrl<T extends OpenListUrlItem>(item: T, path: PathInput<T>) {
  const resolvedPath = pathOf(item, path)
  const raw = String(item.raw_url || item.url || '')
  if (/^(?:file|data):/i.test(raw))
    return normalizeResourceUrl(raw)
  return siyuanWorkspacePublicUrl(resolvedPath) || proxyPreviewUrl(resolvedPath, false)
}

export function openListCompanionHref(name: string, path: string, isDir = false) {
  const plugins = (window as any).siyuan?.ws?.app?.plugins || []
  if (isDir || !openListReaderExts.has(extensionOfName(name)) || (!(window as any).sireader && !plugins.some((plugin: any) => plugin?.name === 'siyuan-sireader')))
    return undefined
  return proxyPreviewUrl(path, false)
}

export function requireModule(id: string) {
  try {
    const req = (window as any).require || (globalThis as any).require || Function('return typeof require === "function" ? require : null')()
    return typeof req === 'function' ? req(id) : null
  } catch {
    return null
  }
}

export async function selectSavePath(filename?: string, labels: {
  cancel?: string
  confirm?: string
  title?: string
} = {}) {
  const electron = requireModule('electron') || requireModule('@electron/remote')
  const ipcRenderer = electron?.ipcRenderer
  const path = requireModule('path')
  const os = requireModule('os')
  const defaultPath = path?.join && os?.homedir
    ? path.join(os.homedir(), 'Downloads', filename || 'download')
    : filename || 'download'
  if (ipcRenderer?.invoke) {
    const result = await ipcRenderer.invoke('siyuan-get', {
      cmd: 'showSaveDialog',
      defaultPath,
      title: labels.title || 'Save as',
    })
    return result?.canceled ? '' : String(result?.filePath || '')
  }
  const dialog = electron?.dialog || electron?.remote?.dialog
  if (dialog) {
    if (typeof dialog.showSaveDialogSync === 'function')
      return String(dialog.showSaveDialogSync({ defaultPath }) || '')
    if (typeof dialog.showSaveDialog === 'function') {
      const result = await dialog.showSaveDialog({ defaultPath })
      return result?.canceled ? '' : String(result?.filePath || '')
    }
  }
  return await promptText({
    cancelText: labels.cancel || 'Cancel',
    confirmText: labels.confirm || 'Download',
    placeholder: defaultPath,
    title: labels.title || 'Save as',
    value: defaultPath,
  })
}

export function resolveMediaPreviewUrl(path: string) {
  return mediaProtocolUrl(path)
}

async function tryOpenMedia(name: string, url: string) {
  const payload = {
    name,
    path: url,
    raw_url: url,
    title: name,
    type: 'media',
    url,
  }
  const target = (window as any).siyuanMediaPlayer || (window as any).siyuanMedia || (window as any).sibo
  if (typeof target === 'function') {
    await target(payload)
    return true
  }
  for (const method of ['open', 'play', 'playMediaItem', 'add', 'load']) {
    if (typeof target?.[method] === 'function') {
      await target[method](payload)
      return true
    }
  }
  window.dispatchEvent(new CustomEvent('playMediaItem', { detail: payload }))
  return false
}

export async function openMediaPreview(name: string, url: string) {
  const href = normalizeResourceUrl(url)
  return await tryOpenMedia(name, href)
}

export async function openOpenListMediaPreview(name: string, path: string) {
  return await tryOpenMedia(name, resolveMediaPreviewUrl(path))
}

export function promptText(options: {
  title: string
  value?: string
  placeholder?: string
  cancelText: string
  confirmText: string
}) {
  return new Promise<string | null>((resolve) => {
    const dialog = new Dialog({
      title: options.title,
      width: '520px',
      content: `<div class="b3-dialog__content">
  <input class="b3-text-field fn__block" id="siyuanCloudPromptInput" spellcheck="false" placeholder="${escapeHtml(options.placeholder || '')}" value="${escapeHtml(options.value || '')}">
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="siyuanCloudPromptCancel">${escapeHtml(options.cancelText)}</button><div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="siyuanCloudPromptConfirm">${escapeHtml(options.confirmText)}</button>
</div>`,
    })
    const input = dialog.element.querySelector('#siyuanCloudPromptInput') as HTMLInputElement | null
    const cancel = dialog.element.querySelector('#siyuanCloudPromptCancel') as HTMLButtonElement | null
    const ok = dialog.element.querySelector('#siyuanCloudPromptConfirm') as HTMLButtonElement | null
    const finish = (result: string | null) => {
      dialog.destroy()
      resolve(result)
    }
    cancel?.addEventListener('click', () => finish(null))
    ok?.addEventListener('click', () => finish(input?.value ?? ''))
    if (input)
      dialog.bindInput(input, () => finish(input.value))
  })
}

const viewerScriptId = 'protyleViewerScript'
const viewerScriptSrc = '/stage/protyle/js/viewerjs/viewer.js?v=1.11.7'
const imagePlaceholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E'

declare global {
  interface Window {
    Viewer: any
    siyuan: any
  }
}

function loadViewerScript() {
  if (document.getElementById(viewerScriptId))
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = viewerScriptId
    script.src = viewerScriptSrc
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('viewer.js load failed'))
    document.head.appendChild(script)
  })
}

export async function openLazyImageViewer<T>(options: {
  items: T[]
  current: T
  keyOf: (item: T) => string
  urlOf: (item: T) => Promise<string>
  onError?: (error: unknown) => void
}) {
  const { items, current, keyOf, urlOf, onError } = options
  const currentKey = keyOf(current)
  await loadViewerScript()

  const imagesElement = document.createElement('ul')
  const initialViewIndex = Math.max(0, items.findIndex(item => keyOf(item) === currentKey))
  const resolved = new Set<number>()
  const imageElements: HTMLImageElement[] = []
  items.forEach((item, index) => {
    const li = document.createElement('li')
    const img = document.createElement('img')
    img.src = imagePlaceholder
    img.dataset.key = keyOf(item)
    imageElements[index] = img
    li.appendChild(img)
    imagesElement.appendChild(li)
  })

  try {
    const currentUrl = await urlOf(items[initialViewIndex])
    if (currentUrl) {
      imageElements[initialViewIndex].src = currentUrl
      resolved.add(initialViewIndex)
    }
  } catch (error) {
    onError?.(error)
  }

  const viewer = new window.Viewer(imagesElement, {
    button: false,
    initialViewIndex,
    transition: false,
    hidden() {
      viewer.destroy()
    },
    shown() {
      viewer.view(initialViewIndex)
    },
    toolbar: {
      close() {
        viewer.destroy()
      },
      flipHorizontal: true,
      flipVertical: true,
      next: true,
      oneToOne: true,
      play: true,
      prev: true,
      reset: true,
      rotateLeft: true,
      rotateRight: true,
      zoomIn: true,
      zoomOut: true,
    },
    async viewed(e: any) {
      const index = e.detail.index
      if (resolved.has(index))
        return
      const item = items[index]
      const img = imagesElement.querySelectorAll('img')[index] as HTMLImageElement | undefined
      if (!item || !img)
        return
      try {
        const url = await urlOf(item)
        if (!url)
          return
        resolved.add(index)
        img.src = url
        viewer.update()
        viewer.view(index)
      } catch (error) {
        onError?.(error)
      }
    },
  })

  window.siyuan.viewer = viewer
  viewer.show()
  viewer.view(initialViewIndex)
}
