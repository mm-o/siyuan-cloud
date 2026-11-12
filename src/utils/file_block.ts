import { Menu, type Plugin } from 'siyuan'
import type { OpenListFileItem } from '@/utils/file_actions'
import {
  fsList,
  fsSearch,
} from '@/utils/api'
import {
  copyOpenListItemLink,
  itemOpenListPath,
  joinOpenListPath,
  normalizeOpenListPath,
} from '@/utils/file_actions'
import {
  escapeHtml,
  formatModified,
  formatSize,
  openListCompanionHref,
  openListFileKind,
  openOpenListMediaPreview,
  showErrorMessage,
} from '@/utils/file_ui'
import { openListFileIconHref } from '@/utils/icon'

interface RenderProps {
  element: HTMLElement
  content: string
}
type PickerItem = OpenListFileItem & { path: string }
type BlockPlugin = Plugin & {
  customBlockRenders: Record<string, { render: (props: RenderProps) => void | (() => void) }>
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

const compareFiles = (a: OpenListFileItem, b: OpenListFileItem) =>
  Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)

export function openFilePicker(plugin: Plugin, options: {
  targetElement: HTMLElement
  onSelect: (item: PickerItem, event: MouseEvent) => void
  onClose?: () => void
}) {
  const target = options.targetElement
  const abort = new AbortController()
  const cache = new Map<string, PickerItem[]>()
  const expanded = new Set<string>()
  const loading = new Set<string>()
  const errors = new Map<string, string>()
  const panel = make('div', 'b3-list b3-list--background ol-file-picker')
  const toolbar = make('div', 'fn__flex ol-file-picker__toolbar')
  const search = make('input', 'b3-text-field fn__block fn__flex-1')
  search.placeholder = String(plugin.i18n.searchPlaceholder || '搜索')
  const hint = make('button', 'block__icon block__icon--show ariaLabel')
  hint.type = 'button'
  hint.setAttribute('aria-label', String(plugin.i18n.filePickerHint))
  hint.dataset.position = 'west'
  hint.innerHTML = '<svg><use xlink:href="#iconHelp"></use></svg>'
  toolbar.append(search, hint)
  const list = make('div', '')
  const left = Number.parseFloat(target.style.left) || 0
  const top = Number.parseFloat(target.style.top) || 0
  let results: PickerItem[] | null = null
  let searchSequence = 0
  let searchTimer: ReturnType<typeof setTimeout>

  const pickerItems = (items: OpenListFileItem[], parent: string) => items
    .map((item) => ({
      ...item,
      path: itemOpenListPath(item, item.parent || parent),
    }))
    .sort(compareFiles)

  const close = () => {
    if (abort.signal.aborted)
      return
    abort.abort()
    clearTimeout(searchTimer)
    target.replaceChildren()
    target.classList.add('fn__none')
    options.onClose?.()
  }
  const fit = () => {
    const rect = target.getBoundingClientRect()
    target.style.left = `${Math.max(0, Math.min(left, window.innerWidth - rect.width))}px`
    target.style.top = `${Math.max(0, Math.min(top, window.innerHeight - rect.height))}px`
  }
  const appendItems = (items: PickerItem[], level = 0) => {
    for (const item of items) {
      const path = item.path
      const expandable = item.is_dir && !search.value.trim()
      const open = expandable && expanded.has(path)
      const row = make('button', 'b3-list-item b3-list-item--hide-action')
      row.type = 'button'
      row.innerHTML = `<span class="b3-list-item__toggle${expandable ? ' b3-list-item__toggle--hl' : ' fn__hidden'}" style="padding-left:${level * 18}px"><svg class="b3-list-item__arrow${open ? ' b3-list-item__arrow--open' : ''}"><use xlink:href="#iconRight"></use></svg></span><svg class="b3-list-item__graphic"><use xlink:href="${openListFileIconHref(item.name, item.is_dir)}"></use></svg>`
      const label = make('span', 'b3-list-item__text ariaLabel', item.name)
      label.setAttribute('aria-label', escapeHtml(item.name))
      row.append(label)
      if (!item.is_dir)
        row.append(make('span', 'b3-list-item__meta', formatSize(item.size, true)))
      row.onclick = (event) => {
        if (expandable && (event.target as Element).closest('.b3-list-item__toggle')) {
          if (open) {
            expanded.delete(path)
            render()
          }
          else {
            expanded.add(path)
            if (cache.has(path))
              render()
            else
              void load(path)
          }
        }
        else {
          try {
            options.onSelect(item, event)
          }
          catch (error) {
            showErrorMessage(error)
          }
          finally {
            close()
          }
        }
      }
      list.append(row)
      if (open) {
        if (loading.has(path) || errors.has(path))
          list.append(make('div', 'ft__secondary', errors.get(path) || String(plugin.i18n.fileListLoading)))
        else
          appendItems(cache.get(path) || [], level + 1)
      }
    }
  }
  function render() {
    if (abort.signal.aborted)
      return
    list.replaceChildren()
    const items = search.value.trim() ? results : cache.get('/')
    if (items?.length) {
      appendItems(items)
    }
    else if (!search.value.trim() && errors.has('/')) {
      const retry = make('button', 'b3-list-item', errors.get('/'))
      retry.type = 'button'
      retry.onclick = () => void load('/')
      list.append(retry)
    }
    else {
      list.textContent = String(plugin.i18n[items ? 'fileListEmpty' : 'fileListLoading'])
    }
    fit()
  }
  async function load(path: string) {
    if (cache.has(path) || loading.has(path))
      return
    loading.add(path)
    errors.delete(path)
    render()
    try {
      const response = await fsList(path)
      if (abort.signal.aborted)
        return
      if (response.code !== 200)
        throw new Error(response.message || String(plugin.i18n.fileListLoadFailed))
      cache.set(path, pickerItems(response.data?.content || [], path))
    }
    catch (error) {
      if (!abort.signal.aborted)
        errors.set(path, error instanceof Error ? error.message : String(error))
    }
    finally {
      loading.delete(path)
      render()
    }
  }
  search.oninput = () => {
    clearTimeout(searchTimer)
    const sequence = ++searchSequence
    const keywords = search.value.trim()
    results = null
    render()
    if (!keywords)
      return
    searchTimer = setTimeout(async () => {
      try {
        const response = await fsSearch('/', keywords)
        if (abort.signal.aborted || sequence !== searchSequence)
          return
        if (response.code !== 200)
          throw new Error(response.message || String(plugin.i18n.fileListLoadFailed))
        const content = Array.isArray(response.data) ? response.data : response.data?.content || []
        results = pickerItems(content, '/')
        render()
      }
      catch (error) {
        if (!abort.signal.aborted && sequence === searchSequence) {
          results = []
          render()
          showErrorMessage(error)
        }
      }
    }, 200)
  }
  panel.append(toolbar, list)
  target.replaceChildren(panel)
  target.classList.remove('fn__none')
  panel.addEventListener('click', (event) => event.stopPropagation(), { signal: abort.signal })
  panel.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Escape')
      close()
  }, { signal: abort.signal })
  document.addEventListener('pointerdown', (event) => {
    if (!panel.contains(event.target as Node))
      close()
  }, { signal: abort.signal })
  window.addEventListener('resize', fit, { signal: abort.signal })
  void load('/')
  search.focus()
  return close
}

function readFolder(content: string, pluginName: string) {
  const link = content.replace(/\u200B/g, '').trim().match(/^\[((?:\\.|[^\]\\])*)\]\(<?(.+?)>?\)$/)
  if (!link)
    return null
  try {
    const url = new URL(link[2])
    const path = url.searchParams.get('path')
    if (url.protocol !== 'siyuan:' || url.hostname !== 'plugins' || url.pathname !== `/${pluginName}/open` || path === null)
      return null
    return {
      path: normalizeOpenListPath(path),
      name: link[1].replace(/\\([\\[\]])/g, '$1'),
    }
  }
  catch {
    return null
  }
}

function renderFolder(plugin: Plugin, content: string) {
  const source = readFolder(content, plugin.name)
  const element = make('div', 'ol-file-block')
  let disposed = false
  let sequence = 0
  const dispose = () => {
    disposed = true
    element.remove()
  }
  if (!source) {
    element.append(make('div', 'ol-file-block__body', content))
    return {
      element,
      dispose,
    }
  }
  const {
    path: rootPath,
    name: rootName,
  } = source

  const text = (key: string) => String(plugin.i18n[key] || key)
  let currentPath = rootPath
  const toolbar = make('div', 'block__icons')
  const crumbs = make('nav', 'fn__flex-1 ol-file-block__crumbs')
  const body = make('div', 'ol-file-block__body')
  const action = (icon: string, label: string, run: () => void) => {
    const button = make('button', 'block__icon block__icon--show ariaLabel')
    button.type = 'button'
    button.setAttribute('aria-label', escapeHtml(label))
    button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`
    button.onclick = run
    return button
  }
  toolbar.append(
    crumbs,
    action('iconRefresh', text('refresh'), () => void load(currentPath, true)),
    action('iconOpen', text('openFileManager'), () => window._siyuan_cloud?.openFileManager?.(currentPath)),
  )
  element.append(toolbar, body)

  async function load(path: string, refresh = false) {
    const dir = normalizeOpenListPath(path)
    currentPath = dir
    const request = ++sequence
    let crumbPath = '/'
    crumbs.replaceChildren()
    for (const part of ['', ...dir.split('/').filter(Boolean)]) {
      crumbPath = joinOpenListPath(crumbPath, part)
      const target = crumbPath
      const label = target === rootPath ? rootName : part || text('rootFolder')
      const button = make('button', 'b3-button b3-button--text', label)
      button.type = 'button'
      button.disabled = target === dir
      button.onclick = () => void load(target)
      if (crumbs.childElementCount)
        crumbs.append(make('span', 'ft__secondary', '/'))
      crumbs.append(button)
    }
    body.textContent = text('fileListLoading')
    try {
      const response = await fsList(dir, '', 1, 0, refresh)
      if (disposed || request !== sequence)
        return
      if (response.code !== 200)
        throw new Error(response.message || text('fileListLoadFailed'))
      const items: OpenListFileItem[] = [...(response.data?.content || [])]
      items.sort(compareFiles)
      const list = make('div', 'b3-list b3-list--background')
      for (const item of items) {
        const path = itemOpenListPath(item, dir)
        const row = make('button', 'b3-list-item ol-file-row')
        row.type = 'button'
        const label = make('span', 'b3-list-item__text')
        label.innerHTML = `<svg class="b3-list-item__graphic"><use xlink:href="${openListFileIconHref(item.name, item.is_dir)}"></use></svg><span class="fn__space"></span>`
        const name = make('span', 'ol-file-row__name ariaLabel', item.name)
        name.setAttribute('aria-label', escapeHtml(item.name))
        const companionHref = openListCompanionHref(item.name, path, item.is_dir)
        if (companionHref)
          row.dataset.href = companionHref
        label.append(name)
        row.append(
          label,
          make('span', 'b3-list-item__meta', item.is_dir ? '' : formatSize(item.size)),
          make('span', 'b3-list-item__meta', formatModified(item.modified)),
        )
        const openItem = async () => {
          if (companionHref)
            return
          if (item.is_dir) {
            void load(path)
            return
          }
          try {
            const kind = openListFileKind(item.name)
            if ((kind === 'audio' || kind === 'video') && await openOpenListMediaPreview(item.name, path))
              return
            window._siyuan_cloud?.openFileManager?.(path)
          }
          catch (error) {
            showErrorMessage(error)
          }
        }
        row.onclick = openItem
        row.oncontextmenu = (event) => {
          event.preventDefault()
          const menu = new Menu('siyuan-cloud-file-block-item')
          menu.addItem({ icon: item.is_dir ? 'iconFolder' : 'iconOpen', label: text('open'), click: openItem })
          menu.addItem({ icon: 'iconLink', label: text('copyLink'), click: () => copyOpenListItemLink({ item, path, t: text }) })
          menu.open({ x: event.clientX, y: event.clientY })
        }
        list.append(row)
      }
      body.replaceChildren(items.length ? list : make('div', 'ft__secondary', text('fileListEmpty')))
    }
    catch (error) {
      if (!disposed && request === sequence)
        body.textContent = error instanceof Error ? error.message : text('fileListLoadFailed')
    }
  }

  void load(rootPath)
  return {
    element,
    dispose,
  }
}

export function registerFileListBlock(plugin: Plugin) {
  const custom = plugin as BlockPlugin
  const mounts = new Map<HTMLElement, ReturnType<typeof renderFolder> & { content: string, cleanup?: () => void }>()
  custom.customBlockRenders ||= {}
  const render = (props: RenderProps) => {
    const block = props.element.parentElement || props.element
    let mount = mounts.get(block)
    if (!mount || mount.content !== props.content) {
      mount?.dispose()
      mount = {
        ...renderFolder(plugin, props.content),
        content: props.content,
      }
      mounts.set(block, mount)
    }
    if (mount.element.parentElement !== props.element)
      props.element.replaceChildren(mount.element)
    // 思源保存时会先清理再重新渲染，后续渲染接管后保留当前目录。
    const cleanup = () => queueMicrotask(() => {
      if (mounts.get(block)?.cleanup !== cleanup)
        return
      mount.dispose()
      mounts.delete(block)
    })
    mount.cleanup = cleanup
    return cleanup
  }
  custom.customBlockRenders['file-list'] = { render }
  return () => {
    for (const mount of mounts.values())
      mount.dispose()
    mounts.clear()
    if (custom.customBlockRenders['file-list']?.render === render)
      delete custom.customBlockRenders['file-list']
  }
}
