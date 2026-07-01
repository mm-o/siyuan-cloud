import {
  Menu,
  confirm,
  showMessage,
} from 'siyuan'
import { fsRemove } from '@/utils/api'
import {
  itemStableUrl,
  triggerDownload,
  type OpenListUrlItem,
} from '@/utils/file_ui'
import { escapeHtml } from '@/utils/file_ui'
import { handleResp } from '@/utils/handle_resp'
import { formatResourceUrlForMarkdown } from '@/utils/request'
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
  resolveUrl: (path: string) => Promise<string>
}) {
  if (options.item.is_dir)
    return
  triggerDownload(await options.resolveUrl(options.itemPath(options.item)), options.item.name)
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
const escapeMdDest = (url: string) => url.replace(/([\\()])/g, '\\$1')

export function openListDocumentLink<T extends OpenListUrlItem & { name: string; is_dir?: boolean }>(options: {
  item: T
  path: string
  imageExts?: Set<string>
  videoExts?: Set<string>
}) {
  const url = itemStableUrl(options.item, options.path)
  const ext = extensionOf(options.item.name)
  if (!options.item.is_dir && options.videoExts?.has(ext))
    return `<video controls src="${escapeHtml(formatResourceUrlForMarkdown(url))}"></video>`
  const isImage = !options.item.is_dir && options.imageExts?.has(ext)
  if (isImage)
    return `![${escapeMdText(options.item.name)}](${escapeMdDest(formatResourceUrlForMarkdown(url))})`
  return `[${escapeMdText(options.item.name)}](siyuan://plugins/siyuan-cloud/open?path=${normalizeOpenListPath(options.path)})`
}

export function openOpenListFileItemMenu(options: {
  event: MouseEvent
  item: OpenListFileItem
  isSelected: (item: OpenListFileItem) => boolean
  selectOnly: (item: OpenListFileItem) => void
  openFile: (item: OpenListFileItem) => void | Promise<void>
  browseArchive?: (item: OpenListFileItem) => void | Promise<void>
  downloadItem: (item: OpenListFileItem) => void | Promise<void>
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
