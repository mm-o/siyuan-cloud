<template>
  <div class="ol-file-tab fn__flex">
    <input
      ref="uploadInputRef"
      class="fn__none"
      multiple
      type="file"
      @change="onUploadChange"
    >

    <div class="fn__flex-1 fn__flex-column ol-file-tab__main">
      <div class="protyle-breadcrumb">
        <div class="protyle-breadcrumb__bar protyle-breadcrumb__bar--nowrap fn__flex-1">
          <button
            class="protyle-breadcrumb__item ariaLabel"
            type="button"
            :aria-label="tf('parentFolder', 'Parent Folder')"
            @click="goParent"
          >
            <svg class="popover__block"><use xlink:href="#iconLeft" /></svg>
          </button>
          <template
            v-for="(crumb, index) in crumbs"
            :key="crumb.path"
          >
            <span
              class="protyle-breadcrumb__item"
              :class="{ 'protyle-breadcrumb__item--active': index === crumbs.length - 1 }"
              :title="crumb.label"
              @click="goPath(crumb.path)"
            >
              <span class="protyle-breadcrumb__text">{{ crumb.label }}</span>
            </span>
            <svg
              v-if="index < crumbs.length - 1"
              class="protyle-breadcrumb__arrow"
            ><use xlink:href="#iconRight" /></svg>
          </template>
        </div>
        <div
          v-if="searchInputOpen"
          class="fn__flex-1 ol-file-tab__input"
        >
          <input
            ref="searchInputRef"
            v-model="searchInput"
            class="b3-text-field fn__block"
            :placeholder="tf('searchPlaceholder', 'Search current tree')"
            spellcheck="false"
            @keydown.enter="runSearch"
            @keydown.esc="closeSearchInput"
            @blur="closeSearchInput"
          >
        </div>
        <button
          v-for="action in toolbarActions"
          :key="action.key"
          class="block__icon fn__flex-center ariaLabel"
          type="button"
          :disabled="action.disabled"
          :aria-label="action.label"
          @click="action.run"
        >
          <svg><use :xlink:href="`#${action.icon}`" /></svg>
        </button>
      </div>

      <div
        class="fn__flex-1 ol-file-tab__content"
        @contextmenu.prevent="openBackgroundMenu"
      >
        <div
          v-if="loading"
          class="ol-file-tab__loading"
        >
          <div class="fn__loading" />
        </div>
        <ul
          v-else-if="sortedItems.length"
          class="b3-list b3-list--background"
        >
          <li
            class="b3-list-item ol-file-row"
            :class="{ 'ol-file-row--selecting': selectionMode }"
          >
            <input
              v-if="selectionMode"
              type="checkbox"
              :checked="allItemsSelected"
              :aria-label="tf('selectAll', 'Select all')"
              @change="changeAllSelection"
            >
            <span class="b3-list-item__text ft__on-surface">{{ selectedSummary }}</span>
            <span class="b3-list-item__meta ft__on-surface">{{ tf('size', 'Size') }}</span>
            <span class="b3-list-item__meta ft__on-surface">{{ tf('modified', 'Modified') }}</span>
          </li>
          <li
            v-for="item in sortedItems"
            :key="itemKey(item)"
            class="b3-list-item ol-file-row"
            :class="{
              'ol-file-row--selecting': selectionMode,
            }"
            @click="openFile(item)"
            @contextmenu.stop.prevent="openItemMenu($event, item)"
          >
            <input
              v-if="selectionMode"
              type="checkbox"
              :checked="isSelected(item)"
              :aria-label="item.name"
              @change="changeSelection(item, $event)"
              @click.stop
            >
            <span
              class="b3-list-item__text"
              :title="item.name"
              :data-href="companionHref(item)"
            >
              <svg
                class="ol-file-row__icon"
                :class="`ol-file-row__icon--${openListFileIconName(item.name, item.is_dir)}`"
              >
                <use :xlink:href="openListFileIconHref(item.name, item.is_dir)" />
              </svg>
              <span class="ol-file-row__label">
                <span class="ol-file-row__name">{{ item.name }}</span>
                <span
                  v-if="searchActive && item.parent"
                  class="ol-file-row__parent"
                >{{ item.parent }}</span>
              </span>
            </span>
            <span class="b3-list-item__meta">{{ item.is_dir ? '' : formatSize(item.size) }}</span>
            <span class="b3-list-item__meta">{{ formatModified(item.modified) }}</span>
          </li>
        </ul>
        <div
          v-else
          class="ol-file-tab__empty"
        >
          <svg><use xlink:href="#iconOpenListFolder" /></svg>
          <span>{{ t('rootEmpty') }}</span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Dialog,
  Menu,
  showMessage,
} from 'siyuan'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { usePlugin } from '@/main'
import {
  fsCopy,
  fsGet,
  fsList,
  fsMkdir,
  fsMove,
  fsNewFile,
  fsRename,
  fsSearch,
  fsWriteFile,
  openListAbsoluteUrl,
  resolveOpenListFile,
  shareCreate,
} from '@/utils/api'
import { handleResp, handleRespWithNotifySuccess } from '@/utils/handle_resp'
import {
  baseOpenListName,
  deleteOpenListSelection,
  itemOpenListPath,
  joinOpenListPath,
  normalizeOpenListPath,
  openOpenListFileItemMenu,
  parentOpenListPath,
  selectedOpenListGroups,
} from '@/utils/file_actions'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import { openListShareUrl, privateBase } from '@/utils/request'

interface FsItem {
  name: string
  size: number
  is_dir: boolean
  path?: string
  parent?: string
  modified?: string
  raw_url?: string
  url?: string
}

const plugin = usePlugin()
const currentPath = ref('/')
const searchInput = ref('')
const searchActive = ref(false)
const searchInputOpen = ref(false)
const items = ref<FsItem[]>([])
const loading = ref(false)
const searchInputRef = ref<HTMLInputElement>()
const uploadInputRef = ref<HTMLInputElement>()
const selectedPaths = ref<string[]>([])
const selectionMode = ref(false)
let refreshSeq = 0
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)),
)
const crumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const list = [{ label: t('rootFolder'), path: '/' }]
  parts.forEach((part, index) => {
    list.push({ label: part, path: `/${parts.slice(0, index + 1).join('/')}` })
  })
  return list
})
const selectedItems = computed(() =>
  items.value.filter(item => selectedPaths.value.includes(itemKey(item))),
)
const primarySelectedItem = computed(() => selectedItems.value[0] || null)
const downloadableSelection = computed(() => selectedItems.value.filter(item => !item.is_dir))
const allItemsSelected = computed(() => Boolean(sortedItems.value.length) && sortedItems.value.every(isSelected))
const selectedSummary = computed(() =>
  selectedItems.value.length
    ? tf('selectedCount', '{count} selected').replace('{count}', String(selectedItems.value.length))
    : tf('name', 'Name'),
)
const toolbarActions = computed(() => [
  { key: 'refresh', icon: 'iconRefresh', label: tf('refresh', 'Refresh'), run: refresh },
  { key: 'search', icon: 'iconSearch', label: tf('search', 'Search'), run: openSearchInput },
  { key: 'clearSearch', icon: 'iconClose', label: tf('clearSearch', 'Clear Search'), disabled: !searchActive.value, run: clearSearch },
  { key: 'upload', icon: 'iconUpload', label: tf('upload', 'Upload'), run: openUpload },
  { key: 'selection', icon: selectionMode.value ? 'iconCheck' : 'iconUncheck', label: tf('toggleCheckbox', 'Toggle selection'), run: toggleSelectionMode },
  { key: 'download', icon: 'iconDownload', label: tf('download', 'Download'), disabled: !downloadableSelection.value.length, run: downloadSelection },
  { key: 'createFolder', icon: 'iconFolder', label: t('createFolder'), run: createFolder },
  { key: 'createFile', icon: 'iconFile', label: t('createFile'), run: createFile },
  { key: 'rename', icon: 'iconEdit', label: tf('rename', 'Rename'), disabled: selectedItems.value.length !== 1, run: renameSelection },
  { key: 'copy', icon: 'iconCopy', label: tf('copy', 'Copy'), disabled: !selectedItems.value.length, run: copySelection },
  { key: 'move', icon: 'iconMove', label: tf('move', 'Move'), disabled: !selectedItems.value.length, run: moveSelection },
  { key: 'share', icon: 'iconLink', label: tf('share', 'Share'), disabled: !selectedItems.value.length, run: shareSelection },
  { key: 'delete', icon: 'iconTrashcan', label: t('deleteFile'), disabled: !selectedItems.value.length, run: deleteSelection },
  { key: 'settings', icon: 'iconSettings', label: t('openSettings'), run: openSettings },
])

const fileKinds = {
  audio: new Set('mp3,wav,aac,m4a,flac,ogg'.split(',')),
  image: new Set('jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(',')),
  text: new Set('txt,log,md,markdown,json,xml,yml,yaml,toml,ini,conf,js,ts,jsx,tsx,vue,css,scss,less,html,htm,go,py,java,rb,rs,php,c,cpp,h'.split(',')),
  video: new Set('mp4,mkv,avi,mov,rmvb,webm,flv,m3u8,m4v'.split(',')),
}
const companionExts = new Set('mp3,wav,aac,m4a,flac,ogg,mp4,m3u8,webm,mov,m4v,mkv,avi,flv,wmv,epub,pdf,mobi,azw3,azw,fb2,cbz,txt'.split(','))

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function tf(key: string, fallback: string) {
  const value = (plugin.i18n as Record<string, string>)?.[key]
  return value === undefined ? fallback : String(value)
}

function normalizePath(path: string) {
  return normalizeOpenListPath(path)
}

function joinPath(dir: string, name: string) {
  return joinOpenListPath(dir, name)
}

function parentPath(path: string) {
  return parentOpenListPath(path)
}

function baseName(path: string) {
  return baseOpenListName(path)
}

function itemPath(item: FsItem) {
  return itemOpenListPath(item, currentPath.value)
}

function itemKey(item: FsItem) {
  return itemPath(item)
}

function isSelected(item: FsItem) {
  return selectedPaths.value.includes(itemKey(item))
}

function clearSelection() {
  selectedPaths.value = []
}

function selectOnly(item: FsItem) {
  selectedPaths.value = [itemKey(item)]
}

function setSelected(item: FsItem, checked: boolean) {
  const key = itemKey(item)
  selectedPaths.value = checked
    ? Array.from(new Set([...selectedPaths.value, key]))
    : selectedPaths.value.filter(path => path !== key)
}

function changeSelection(item: FsItem, event: Event) {
  setSelected(item, (event.target as HTMLInputElement).checked)
}

function changeAllSelection(event: Event) {
  selectedPaths.value = (event.target as HTMLInputElement).checked
    ? sortedItems.value.map(itemKey)
    : []
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value)
    clearSelection()
}

function formatSize(size = 0) {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatModified(value?: string) {
  if (!value)
    return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleString()
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

function fileKind(item: FsItem) {
  if (item.is_dir)
    return ''
  const ext = extensionOf(item.name)
  return Object.entries(fileKinds).find(([, exts]) => exts.has(ext))?.[0] || ''
}

const isImageFile = (item: FsItem) => fileKind(item) === 'image'

const escapeMdText = (value: string) => value.replace(/([\\[\]])/g, '\\$1')
const escapeMdDest = (url: string) => url.replace(/([\\()])/g, '\\$1')
const docProxyUrl = (path: string) => decodeURI(encodeURI(`${privateBase}/p${path}`)).replace(/#/g, '%23').replace(/\?/g, '%3F')
const itemUrl = (item: FsItem) => String(item.raw_url || item.url || '')
const itemOpenUrl = (item: FsItem) => itemUrl(item) || docProxyUrl(itemPath(item))
const companionHref = (item: FsItem) => !item.is_dir && companionExts.has(extensionOf(item.name)) ? openListAbsoluteUrl(itemOpenUrl(item)) : undefined
function documentLink(item: FsItem, path: string) {
  const kind = fileKind(item)
  const url = itemOpenUrl(item) || docProxyUrl(path)
  if (kind === 'video')
    return `<video controls src="${escapeHtml(url)}"></video>`
  return `${kind === 'image' ? '!' : ''}[${escapeMdText(item.name)}](${escapeMdDest(url)})`
}

function triggerDownload(url: string, filename?: string) {
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

async function resolveDownloadUrl(path: string) {
  const local = items.value.find(item => itemPath(item) === path)
  if (local?.raw_url || local?.url)
    return String(local.raw_url || local.url)
  return (await resolveOpenListFile(path)).url
}

async function copyLink(item: FsItem, path: string) {
  await navigator.clipboard?.writeText(documentLink(item, path))
  showMessage(t('linkCopied'), 2000)
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

async function imageUrlFor(item: FsItem) {
  return resolveDownloadUrl(itemPath(item))
}

async function openImageViewer(item: FsItem) {
  const currentUrl = await imageUrlFor(item)
  const imageItems = items.value.filter(isImageFile)
  const urls = await Promise.all(imageItems.map(imageUrlFor))
  await loadViewerScript()
  const imagesElement = document.createElement('ul')
  urls.filter(Boolean).forEach((url) => {
    const li = document.createElement('li')
    const img = document.createElement('img')
    img.src = encodeURI(url)
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

function promptText(title: string, value = '', placeholder = '') {
  return new Promise<string | null>((resolve) => {
    const dialog = new Dialog({
      title,
      width: '520px',
      content: `<div class="b3-dialog__content">
  <input class="b3-text-field fn__block" id="siyuanCloudPromptInput" spellcheck="false" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="siyuanCloudPromptCancel">${escapeHtml(tf('cancel', 'Cancel'))}</button><div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="siyuanCloudPromptConfirm">${escapeHtml(tf('confirmAction', 'Confirm'))}</button>
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

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function refresh() {
  if (searchActive.value && searchInput.value.trim()) {
    await runSearch()
    return
  }
  const seq = ++refreshSeq
  loading.value = true
  const payload = await fsList(currentPath.value, '', 1, 200)
  if (seq !== refreshSeq)
    return
  handleResp(payload, (data: any) => {
    items.value = data?.content || []
    selectedPaths.value = selectedPaths.value.filter(path => items.value.some(item => itemKey(item) === path))
  })
  loading.value = false
}

async function runSearch() {
  const keywords = searchInput.value.trim()
  if (!keywords) {
    await clearSearch()
    return
  }
  const seq = ++refreshSeq
  loading.value = true
  const payload = await fsSearch(currentPath.value, keywords, 0, 1, 200)
  if (seq !== refreshSeq)
    return
  handleResp(payload, (data: any) => {
    items.value = (data?.content || []).map((entry: any) => {
      const path = normalizePath(`${entry.parent || '/'}/${entry.name}`)
      const parent = parentPath(path)
      return {
        name: entry.name,
        path,
        parent: parent === currentPath.value ? '' : parent,
        size: Number(entry.size || 0),
        is_dir: !!entry.is_dir,
        modified: entry.modified,
      }
    })
    searchActive.value = true
    clearSelection()
  })
  loading.value = false
}

async function clearSearch() {
  searchInput.value = ''
  searchActive.value = false
  searchInputOpen.value = false
  await refresh()
}

async function locatePath(path = '') {
  const target = normalizePath(path)
  if (!target || target === '/') {
    await refresh()
    return
  }
  const dir = parentPath(target)
  const name = target.split('/').pop() || ''
  if (!await goPath(dir))
    return
  const item = items.value.find(item => item.name === name)
  if (item?.is_dir) {
    await goPath(target)
    return
  }
  selectedPaths.value = item ? [target] : []
}

defineExpose({ openPath: locatePath })

async function goPath(path: string) {
  const nextPath = normalizePath(path || '/')
  searchInputOpen.value = false
  loading.value = true
  const payload = await fsList(nextPath, '', 1, 200)
  loading.value = false
  if (payload.code !== 200) {
    handleResp(payload)
    return false
  }
  currentPath.value = nextPath
  items.value = payload.data?.content || []
  searchInput.value = ''
  searchActive.value = false
  clearSelection()
  return true
}

async function openSearchInput() {
  searchInputOpen.value = true
  await nextTick()
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
}

function closeSearchInput() {
  searchInputOpen.value = false
}

async function goParent() {
  await goPath(parentPath(currentPath.value))
}

async function createFolder() {
  const value = await promptText(tf('createFolder', 'Create Folder'), '', tf('folderNamePlaceholder', 'Folder name'))
  const name = String(value || '').trim()
  if (!name)
    return
  const resp = await fsMkdir(joinPath(currentPath.value, name))
  handleRespWithNotifySuccess(resp, async () => {
    await refresh()
    notifyChanged()
  })
}

async function createFile() {
  const value = await promptText(tf('createFile', 'Create File'), '', tf('fileNamePlaceholder', 'File name'))
  const name = String(value || '').trim()
  if (!name)
    return
  const resp = await fsNewFile(joinPath(currentPath.value, name), '', false)
  handleRespWithNotifySuccess(resp, async () => {
    await refresh()
    notifyChanged()
  })
}

async function openFile(item: FsItem) {
  if (item.is_dir) {
    await goPath(itemPath(item))
    return
  }
  const kind = fileKind(item)
  if (kind === 'image') {
    await openImageViewer(item)
    return
  }
  if (kind !== 'text') {
    showMessage(tf('useDownloadAction', 'Use the toolbar or context menu to download this file.'), 3000)
    return
  }
  let content = ''
  try {
    const url = openListAbsoluteUrl(`/plugin/private/siyuan-cloud/d${itemPath(item)}`)
    const response = await fetch(url, { method: 'GET' })
    content = await response.text()
  } catch (error) {
    const payload = await fsGet(itemPath(item))
    content = payload.data?.content || (error instanceof Error ? error.message : String(error))
  }
  showTextPreview(item.name, content)
}

function showTextPreview(name: string, content: string) {
  new Dialog({
    title: `${t('filePreview')} - ${name}`,
    width: '720px',
    content: `<div class="b3-dialog__content">
  <textarea class="b3-text-field fn__block" rows="24" readonly>${escapeHtml(content)}</textarea>
</div>`,
  })
}

function selectedGroups() {
  return selectedOpenListGroups(selectedItems.value, currentPath.value)
}

async function deleteSelection() {
  await deleteOpenListSelection({
    clearSelection,
    currentPath: currentPath.value,
    items: selectedItems.value,
    refresh,
    t,
    tf,
  })
}

async function renameSelection() {
  const item = primarySelectedItem.value
  if (!item)
    return
  const value = await promptText(tf('rename', 'Rename'), item.name, tf('renamePlaceholder', 'New name'))
  const nextName = String(value || '').trim()
  if (!nextName || nextName === item.name)
    return
  const resp = await fsRename(itemPath(item), nextName, false)
  handleRespWithNotifySuccess(resp, async () => {
    await refresh()
    notifyChanged()
    const nextItem = items.value.find(entry => entry.name === nextName)
    if (nextItem)
      selectOnly(nextItem)
  })
}

async function runTransferAction(type: 'copy' | 'move') {
  if (!selectedItems.value.length)
    return
  const value = await promptText(
    tf(type, type === 'copy' ? 'Copy' : 'Move'),
    currentPath.value,
    tf(type === 'copy' ? 'copyTargetPlaceholder' : 'moveTargetPlaceholder', 'Target directory path'),
  )
  const dstDir = normalizePath(String(value || ''))
  if (!dstDir)
    return
  for (const group of selectedGroups()) {
    if (type === 'move' && group.dir === dstDir)
      continue
    const resp = type === 'copy'
      ? await fsCopy(group.dir, dstDir, group.names, false, false, false)
      : await fsMove(group.dir, dstDir, group.names, false, false)
    if (resp.code !== 200) {
      handleResp(resp)
      return
    }
  }
  showMessage(tf(type === 'copy' ? 'copyDone' : 'moveDone', type === 'copy' ? 'Copied' : 'Moved'), 2000)
  if (type === 'move')
    clearSelection()
  await refresh()
  notifyChanged()
}

async function copySelection() {
  await runTransferAction('copy')
}

async function moveSelection() {
  await runTransferAction('move')
}

async function shareSelection() {
  if (!selectedItems.value.length)
    return
  const files = selectedItems.value.map(item => itemPath(item))
  const id = await promptText(tf('shareCreate', 'Create Share'), '', tf('shareIdPlaceholder', 'Share ID, optional'))
  if (id === null)
    return
  const pwd = await promptText(tf('sharePassword', 'Share Password'), '', tf('sharePasswordPlaceholder', 'Password, optional'))
  if (pwd === null)
    return
  const resp = await shareCreate({
    id: String(id || '').trim() || undefined,
    files,
    pwd: String(pwd || ''),
    remark: files.length === 1 ? files[0] : `${files.length} files`,
  })
  handleRespWithNotifySuccess(resp, async (data: any) => {
    const shareId = encodeURIComponent(String(data?.id || ''))
    const url = await openListShareUrl(`${privateBase}/sd/${shareId}`)
    await navigator.clipboard?.writeText(url)
    window.dispatchEvent(new CustomEvent('siyuan-cloud:shares-changed'))
    showMessage(tf('shareCreated', 'Share created and copied'), 2000)
  })
}

function openUpload() {
  uploadInputRef.value?.click()
}

async function uploadFile(file: File) {
  const payload = await fsWriteFile(joinPath(currentPath.value, file.name), file)
  if (payload.code !== 200)
    throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
}

async function onUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length)
    return
  try {
    for (const file of files)
      await uploadFile(file)
    showMessage(tf('uploadDone', 'Upload completed'), 2000)
    await refresh()
    notifyChanged()
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), 4000, 'error')
  } finally {
    input.value = ''
  }
}

async function downloadItem(item: FsItem) {
  if (item.is_dir)
    return
  const url = await resolveDownloadUrl(itemPath(item))
  triggerDownload(url, item.name)
}

async function downloadSelection() {
  for (const item of downloadableSelection.value)
    await downloadItem(item)
}

function openSettings() {
  window._siyuan_cloud?.openDock?.()
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent('siyuan-cloud:changed'))
}

function openBackgroundMenu(event: MouseEvent) {
  if ((event.target as HTMLElement)?.closest?.('.b3-list-item'))
    return
  const menu = new Menu('siyuan-cloud-file-bg')
  menu.addItem({
    icon: 'iconRefresh',
    label: tf('refresh', 'Refresh'),
    click: () => refresh(),
  })
  menu.addItem({
    icon: 'iconUpload',
    label: tf('upload', 'Upload'),
    click: () => openUpload(),
  })
  menu.addSeparator({ id: 'separator_create' })
  menu.addItem({
    icon: 'iconFolder',
    label: t('createFolder'),
    click: () => createFolder(),
  })
  menu.addItem({
    icon: 'iconFile',
    label: t('createFile'),
    click: () => createFile(),
  })
  menu.open({ x: event.clientX, y: event.clientY })
}

function openItemMenu(event: MouseEvent, item: FsItem) {
  openOpenListFileItemMenu({
    copyLink,
    copySelection,
    deleteSelection,
    downloadItem,
    event,
    isSelected,
    item,
    itemPath,
    moveSelection,
    openFile,
    renameSelection,
    selectOnly,
    shareSelection,
    t,
    tf,
  })
}

onMounted(() => {
  window.addEventListener('siyuan-cloud:changed', refresh)
  locatePath('/')
})
onBeforeUnmount(() => {
  window.removeEventListener('siyuan-cloud:changed', refresh)
})
</script>
