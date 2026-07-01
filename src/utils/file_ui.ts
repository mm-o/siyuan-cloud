import { Dialog, showMessage } from 'siyuan'
import {
  openListAbsoluteUrl,
  openListStableUrl,
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

type PathInput<T> = string | ((item: T) => string)

const pathOf = <T>(item: T, path: PathInput<T>) =>
  typeof path === 'function' ? path(item) : path

export function proxyPreviewUrl(path: string, absolute = true) {
  const toUrl = absolute ? openListAbsoluteUrl : openListStableUrl
  return toUrl(`${privateBase}/p${path}`, { escapeHash: true, escapeQuestion: true })
}

export function itemOpenUrl<T extends OpenListUrlItem>(item: T, path: PathInput<T>) {
  const resolvedPath = pathOf(item, path)
  const url = siyuanWorkspacePublicUrl(resolvedPath) || String(item.raw_url || item.url || '')
  return url ? normalizeResourceUrl(url) : proxyPreviewUrl(resolvedPath)
}

export function itemStableUrl<T extends OpenListUrlItem>(item: T, path: PathInput<T>) {
  const resolvedPath = pathOf(item, path)
  return siyuanWorkspacePublicUrl(resolvedPath) || String(item.raw_url || item.url || '') || proxyPreviewUrl(resolvedPath, false)
}

export function triggerDownload(url: string, filename?: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  if (filename)
    anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
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
