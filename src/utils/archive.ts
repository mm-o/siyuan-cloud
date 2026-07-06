import { Dialog, showMessage } from 'siyuan'
import { fsArchiveList, fsArchiveMeta, openListAbsoluteUrl } from './api'
import { parseArchive, extractArchiveEntry } from '../kernel/internal/fs/archive.js'
import { openListFileIconHref, openListFileIconName } from './icon'
import { readLocalFileBytes } from './local_fs'
import { normalizeResourceUrl } from './request'

export const archiveSuffixes = ['.zip', '.tar', '.tgz', '.tar.gz']

export function isArchiveFileName(name: string) {
  const lower = String(name || '').toLowerCase()
  return archiveSuffixes.some(suffix => lower.endsWith(suffix))
}

export function archiveInnerPath(basePath: string, name: string) {
  const cleanBase = String(basePath || '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const cleanName = String(name || '').replace(/^\/+/, '')
  return cleanBase ? `${cleanBase}/${cleanName}` : cleanName
}

function archiveExtractUrl(rawUrl: string, archivePath: string, innerPath: string, sign = '', download = false) {
  const fallbackPath = String(archivePath || '').startsWith('/') ? archivePath : `/${archivePath || ''}`
  const base = rawUrl || `/plugin/private/siyuan-cloud/ae${fallbackPath}`
  const url = new URL(openListAbsoluteUrl(base))
  url.searchParams.set('inner', archiveInnerPath('/', innerPath))
  if (download)
    url.searchParams.set('download', '1')
  if (sign)
    url.searchParams.set('sign', sign)
  return url.toString()
}

const escapeHtml = (value: string) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const joinInner = (base: string, name: string) => archiveInnerPath(base, name)
type FileKind = 'audio' | 'book' | 'image' | 'pdf' | 'text' | 'video'
const fileKinds: Record<string, FileKind> = Object.fromEntries([
  ...'mp3,wav,aac,m4a,flac,ogg'.split(',').map(ext => [ext, 'audio']),
  ...'epub,mobi,azw3,azw,fb2,cbz'.split(',').map(ext => [ext, 'book']),
  ...'jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(',').map(ext => [ext, 'image']),
  ['pdf', 'pdf'],
  ['txt', 'text'],
  ...'mp4,m3u8,webm,mov,m4v,mkv,avi,flv,wmv'.split(',').map(ext => [ext, 'video']),
] as Array<[string, FileKind]>)
const mimeTypes: Record<string, string> = {
  aac: 'audio/aac',
  azw: 'application/octet-stream',
  azw3: 'application/octet-stream',
  cbz: 'application/vnd.comicbook+zip',
  epub: 'application/epub+zip',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  mobi: 'application/x-mobipocket-ebook',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8',
  wav: 'audio/wav',
  webm: 'video/webm',
}

function extensionOf(name: string) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function fileKind(name: string) {
  return fileKinds[extensionOf(name)] || ''
}

function absoluteHref(url: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? normalizeResourceUrl(url) : openListAbsoluteUrl(url)
}

function mimeType(name: string) {
  return mimeTypes[extensionOf(name)] || 'application/octet-stream'
}

function saveBlob(bytes: BlobPart, name: string) {
  const url = URL.createObjectURL(new Blob([bytes]))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadViewerScript() {
  if (document.getElementById('protyleViewerScript'))
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'protyleViewerScript'
    script.src = '/stage/protyle/js/viewerjs/viewer.js?v=1.11.7'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('viewer.js load failed'))
    document.head.appendChild(script)
  })
}

function toList(tree: any[] = []) {
  const list: Record<string, any> = {}
  for (const item of tree) {
    list[String(item.name || '')] = {
      ...item,
      children: Array.isArray(item.children) ? toList(item.children) : null,
    }
  }
  return list
}

function archiveErrorMessage(payload: any) {
  const detail = payload?.data?.error || payload?.data?.reason || ''
  return [payload?.message || `HTTP ${payload?.code || 500}`, detail]
    .filter(Boolean)
    .join(': ')
}

export async function openArchiveBrowser(options: {
  archivePath: string
  title: string
  tf: (key: string, fallback: string) => string
}) {
  const dialog = new Dialog({
    title: options.title,
    width: 'min(760px, 92vw)',
    content: `<div class="b3-dialog__content siyuan-cloud-archive ol-archive-dialog__content">
  <div class="ol-archive-browser" data-inner-path="/"></div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="siyuanCloudArchiveClose">${escapeHtml(options.tf('close', 'Close'))}</button>
</div>`,
  })
  const container = dialog.element.querySelector('.ol-archive-browser') as HTMLElement | null
  const content = dialog.element.querySelector('.ol-archive-dialog__content') as HTMLElement | null
  const close = dialog.element.querySelector('#siyuanCloudArchiveClose') as HTMLButtonElement | null
  if (!container)
    return
  fitArchiveDialog(dialog.element, content)

  let rawUrl = ''
  let sign = ''
  let archiveTree: Record<string, any> | null = null
  let localArchive: ReturnType<typeof parseArchive> | null = null
  let localBytes: Uint8Array | null = null
  let currentItems: any[] = []
  const localObjectUrls = new Map<string, string>()
  const cleanupLocalObjectUrls = () => {
    for (const url of localObjectUrls.values())
      URL.revokeObjectURL(url)
    localObjectUrls.clear()
  }
  const originalDestroy = dialog.destroy.bind(dialog)
  dialog.destroy = (...args: any[]) => {
    cleanupLocalObjectUrls()
    return originalDestroy(...args)
  }

  const ensureLocalArchive = async () => {
    if (localArchive !== null)
      return true
    localBytes = await readLocalFileBytes(options.archivePath).catch(() => null)
    if (!localBytes)
      return false
    localArchive = parseArchive(localBytes, options.archivePath)
    return true
  }

  const render = (innerPath: string, items: any[]) => {
    currentItems = items
    const crumbs = ['/']
    const parts = String(innerPath || '/').split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc = `${acc}/${part}`
      crumbs.push(acc || '/')
    }
    container.dataset.innerPath = innerPath || '/'
    container.innerHTML = `
      <div class="ol-archive-browser__bar" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
        ${crumbs.map((crumb, index) => {
          const label = index === 0 ? '/' : parts[index - 1]
          return `<button class="b3-button b3-button--text ol-archive-browser__crumb" data-action="crumb" data-path="${escapeHtml(crumb)}">${escapeHtml(label)}</button>`
        }).join('')}
      </div>
      <ul class="b3-list b3-list--background">
        ${items.map((item: any) => {
          const name = String(item.name || '')
          return `
          <li class="b3-list-item ol-archive-row" data-name="${escapeHtml(String(item.name || ''))}" data-dir="${item.is_dir ? '1' : '0'}">
            <span class="b3-list-item__text" title="${escapeHtml(name)}">
              <svg class="ol-file-row__icon ol-file-row__icon--${escapeHtml(openListFileIconName(String(item.name || ''), !!item.is_dir))}">
                <use xlink:href="${escapeHtml(openListFileIconHref(String(item.name || ''), !!item.is_dir))}" />
              </svg>
              <span class="ol-archive-row__name">${escapeHtml(name)}</span>
            </span>
            <span class="b3-list-item__meta">${item.is_dir ? '' : escapeHtml(String(item.size ?? ''))}</span>
            <span class="b3-list-item__meta">
              ${item.is_dir
                ? `<button class="b3-button b3-button--text" data-action="open">${escapeHtml(options.tf('open', 'Open'))}</button>`
                : `<button class="b3-button b3-button--text" data-action="open">${escapeHtml(options.tf('open', 'Open'))}</button>
                   <button class="b3-button b3-button--text" data-action="download">${escapeHtml(options.tf('download', 'Download'))}</button>`}
            </span>
          </li>
        `}).join('')}
      </ul>
    `
  }

  const renderError = (message: string) => {
    container.innerHTML = `<div class="b3-list-item"><span class="b3-list-item__text">${escapeHtml(message)}</span></div>`
  }

  const ensureMeta = async () => {
    if (rawUrl || archiveTree !== null)
      return true
    if (await ensureLocalArchive())
      return true
    const payload = await fsArchiveMeta(options.archivePath)
    if (payload.code !== 200) {
      renderError(archiveErrorMessage(payload))
      return false
    }
    rawUrl = String(payload.data?.raw_url || '')
    sign = String(payload.data?.sign || '')
    archiveTree = Array.isArray(payload.data?.content) ? toList(payload.data.content) : null
    return true
  }

  const loadFromTree = async (innerPath: string) => {
    if (localArchive)
      return localArchive.list(innerPath)
    if (archiveTree === null)
      return null
    let current = archiveTree
    const parts = String(innerPath || '/').split('/').filter(Boolean)
    for (let index = 0; index < parts.length; index += 1) {
      const node = current[parts[index]]
      if (!node)
        return []
      if (node.children === null) {
        const payload = await fsArchiveList(options.archivePath, `/${parts.slice(0, index + 1).join('/')}`)
        if (payload.code !== 200)
          throw new Error(archiveErrorMessage(payload))
        node.children = toList(payload.data?.content || [])
      }
      current = node.children
    }
    return Object.values(current || {})
  }

  const load = async (innerPath = '/') => {
    container.innerHTML = `<div class="fn__loading"></div>`
    try {
      if (!await ensureMeta())
        return
      const fromTree = await loadFromTree(innerPath)
      if (fromTree !== null) {
        render(innerPath, fromTree)
        return
      }
      const payload = await fsArchiveList(options.archivePath, innerPath)
      if (payload.code !== 200)
        throw new Error(archiveErrorMessage(payload))
      render(innerPath, payload.data?.content || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showMessage(message, 4000, 'error')
      renderError(message)
    }
  }

  const localEntryBytes = (innerPath: string) => {
    if (!localBytes)
      return null
    return extractArchiveEntry(localBytes, options.archivePath, innerPath)
  }

  const entryUrl = (innerPath: string, name: string) => {
    if (localArchive && localBytes) {
      const cached = localObjectUrls.get(innerPath)
      if (cached)
        return cached
      const extracted = localEntryBytes(innerPath)
      if (!extracted)
        return ''
      const url = URL.createObjectURL(new Blob([extracted.bytes], { type: mimeType(extracted.entry.name || name) }))
      localObjectUrls.set(innerPath, url)
      return url
    }
    return archiveExtractUrl(rawUrl, options.archivePath, innerPath, sign)
  }

  const openImages = async (innerPath: string, name: string) => {
    const base = String(container.dataset.innerPath || '/')
    const images = currentItems.filter(item => !item.is_dir && fileKind(item.name) === 'image')
    const urls = images.map(item => entryUrl(joinInner(base, item.name), item.name)).filter(Boolean)
    const currentUrl = entryUrl(innerPath, name)
    await loadViewerScript()
    const imagesElement = document.createElement('ul')
    urls.forEach((url) => {
      const li = document.createElement('li')
      const img = document.createElement('img')
      img.src = absoluteHref(url)
      li.appendChild(img)
      imagesElement.appendChild(li)
    })
    const initialViewIndex = Math.max(0, urls.findIndex(url => url === currentUrl))
    window.siyuan.viewer = new window.Viewer(imagesElement, {
      button: false,
      initialViewIndex,
      transition: false,
      hidden() {
        window.siyuan.viewer?.destroy?.()
      },
      toolbar: {
        close() {
          window.siyuan.viewer?.destroy?.()
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
    })
    window.siyuan.viewer.show()
  }

  const previewShell = (title: string, body: string) => {
    const old = container.querySelector('.ol-archive-preview')
    old?.remove()
    const panel = document.createElement('div')
    panel.className = 'ol-archive-preview'
    panel.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding:8px;border:1px solid var(--b3-border-color);border-radius:6px;'
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
  <span class="ft__on-surface fn__flex-1">${escapeHtml(title)}</span>
  <button class="b3-button b3-button--text" data-action="preview-close">${escapeHtml(options.tf('close', 'Close'))}</button>
</div>${body}`
    container.querySelector('.ol-archive-browser__bar')?.after(panel)
    return panel
  }

  const fileFromUrl = async (url: string, name: string) => {
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)
    return new File([await response.blob()], name, { type: mimeType(name) })
  }

  const tryOpenReader = async (name: string, url: string) => {
    const reader = (window as any).sireader
    if (typeof reader?.openEpubTab !== 'function')
      return false
    await reader.openEpubTab(await fileFromUrl(url, name), String(name || '').replace(/\.[^.]+$/, '') || String(name || 'Reader'))
    return true
  }

  const tryOpenMedia = async (name: string, url: string) => {
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

  const showInlinePreview = async (name: string, url: string) => {
    const href = absoluteHref(url)
    const kind = fileKind(name)
    if (kind === 'audio' || kind === 'video') {
      if (await tryOpenMedia(name, href))
        return
      previewShell(name, kind === 'audio'
        ? `<audio controls autoplay style="width:100%;" src="${escapeHtml(href)}"></audio>`
        : `<video controls autoplay playsinline style="width:100%;max-height:60vh;background:#000;" src="${escapeHtml(href)}"></video>`)
      return
    }
    if (kind === 'pdf' || kind === 'book') {
      if (await tryOpenReader(name, href))
        return
      previewShell(name, `<iframe title="${escapeHtml(name)}" src="${escapeHtml(href)}" style="width:100%;height:60vh;border:0;"></iframe>`)
      return
    }
    if (kind === 'text') {
      const panel = previewShell(name, '<pre class="ol-archive-preview__text" style="max-height:60vh;overflow:auto;margin:0;white-space:pre-wrap;"></pre>')
      const pre = panel.querySelector('.ol-archive-preview__text') as HTMLElement | null
      try {
        const response = await fetch(href)
        if (!response.ok)
          throw new Error(`HTTP ${response.status}`)
        if (pre)
          pre.textContent = await response.text()
      } catch (error) {
        if (pre)
          pre.textContent = error instanceof Error ? error.message : String(error)
      }
    }
  }

  const openEntry = async (innerPath: string, name: string) => {
    const kind = fileKind(name)
    if (kind === 'image') {
      await openImages(innerPath, name)
      return
    }
    const url = entryUrl(innerPath, name)
    if (!url)
      return
    if (kind) {
      await showInlinePreview(name, url)
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  const downloadEntry = (innerPath: string, name: string) => {
    if (localArchive && localBytes) {
      const extracted = localEntryBytes(innerPath)
      if (extracted)
        saveBlob(extracted.bytes, extracted.entry.name || name)
      return
    }
    window.open(archiveExtractUrl(rawUrl, options.archivePath, innerPath, sign, true), '_blank', 'noopener')
  }

  const onClick = async (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    const action = target?.closest?.('[data-action]') as HTMLElement | null
    const row = target?.closest?.('.ol-archive-row') as HTMLElement | null
    if (action?.dataset.action === 'preview-close') {
      target?.closest?.('.ol-archive-preview')?.remove()
      return
    }
    if (action?.dataset.action === 'crumb') {
      await load(action.dataset.path || '/')
      return
    }
    if (!row)
      return
    const innerPath = String(container.dataset.innerPath || '/')
    const name = row.dataset.name || ''
    const isDir = row.dataset.dir === '1'
    const nextInner = joinInner(innerPath, name)
    if (isDir) {
      await load(nextInner)
      return
    }
    try {
      if (action?.dataset.action === 'download')
        downloadEntry(nextInner, name)
      else
        await openEntry(nextInner, name)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 4000, 'error')
    }
  }

  dialog.element.querySelector('.b3-dialog__content')?.addEventListener('click', onClick)
  close?.addEventListener('click', () => dialog.destroy())
  await load('/')
}

function fitArchiveDialog(root: HTMLElement, content: HTMLElement | null) {
  const panel = root.querySelector('.b3-dialog__container') as HTMLElement | null
  panel?.style.setProperty('max-height', 'calc(100vh - 32px)', 'important')
  panel?.style.setProperty('display', 'flex', 'important')
  panel?.style.setProperty('flex-direction', 'column', 'important')
  content?.style.setProperty('flex', '1 1 auto', 'important')
  content?.style.setProperty('min-height', '0', 'important')
  content?.style.setProperty('max-height', 'calc(100vh - 120px)', 'important')
  content?.style.setProperty('overflow-y', 'auto', 'important')
  content?.style.setProperty('padding', '0', 'important')
  const browser = root.querySelector('.ol-archive-browser') as HTMLElement | null
  browser?.style.setProperty('padding', '12px')
  browser?.style.setProperty('min-height', '100%')
}
