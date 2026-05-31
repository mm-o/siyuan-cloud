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
          v-if="pathOpen"
          class="fn__flex-1"
        >
          <input
            ref="pathInputRef"
            v-model="pathInput"
            class="b3-text-field fn__block"
            :placeholder="tf('pathPlaceholder', 'Enter path and press Enter')"
            spellcheck="false"
            @keydown.enter="goPath(pathInput)"
            @keydown.esc="pathOpen = false"
            @blur="pathOpen = false"
          >
        </div>
        <button
          v-else
          class="block__icon fn__flex-center ariaLabel"
          type="button"
          :aria-label="tf('pathJump', 'Jump to Path')"
          @click="openPathInput"
        >
          <svg><use xlink:href="#iconSearch" /></svg>
        </button>
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
            :key="item.name"
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
              <span class="ol-file-row__label">{{ item.name }}</span>
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
  confirm,
  showMessage,
} from 'siyuan'
import {
  computed,
  nextTick,
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
  fsRemove,
  fsRename,
  openListAbsoluteUrl,
  resolveOpenListFile,
} from '@/utils/api'
import { handleResp, handleRespWithNotifySuccess } from '@/utils/handle_resp'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import { privateBase } from '@/utils/request'

interface FsItem {
  name: string
  size: number
  is_dir: boolean
  modified?: string
  raw_url?: string
  url?: string
}

const plugin = usePlugin()
const currentPath = ref('/')
const pathInput = ref('/')
const items = ref<FsItem[]>([])
const loading = ref(false)
const pathOpen = ref(false)
const pathInputRef = ref<HTMLInputElement>()
const uploadInputRef = ref<HTMLInputElement>()
const selectedNames = ref<string[]>([])
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
  items.value.filter(item => selectedNames.value.includes(item.name)),
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
  { key: 'upload', icon: 'iconUpload', label: tf('upload', 'Upload'), run: openUpload },
  { key: 'selection', icon: selectionMode.value ? 'iconCheck' : 'iconUncheck', label: tf('toggleCheckbox', 'Toggle selection'), run: toggleSelectionMode },
  { key: 'download', icon: 'iconDownload', label: tf('download', 'Download'), disabled: !downloadableSelection.value.length, run: downloadSelection },
  { key: 'createFolder', icon: 'iconFolder', label: t('createFolder'), run: createFolder },
  { key: 'createFile', icon: 'iconFile', label: t('createFile'), run: createFile },
  { key: 'rename', icon: 'iconEdit', label: tf('rename', 'Rename'), disabled: selectedItems.value.length !== 1, run: renameSelection },
  { key: 'copy', icon: 'iconCopy', label: tf('copy', 'Copy'), disabled: !selectedItems.value.length, run: copySelection },
  { key: 'move', icon: 'iconMove', label: tf('move', 'Move'), disabled: !selectedItems.value.length, run: moveSelection },
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
  const input = path === undefined || path === null || path === '' ? '/' : String(path)
  if (!input)
    return '/'
  const slash = input.startsWith('/') ? input : `/${input}`
  const normalized = slash.replace(/\/+/g, '/')
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

function joinPath(dir: string, name: string) {
  return normalizePath(`${normalizePath(dir)}/${String(name || '').replace(/^\/+/, '')}`)
}

function parentPath(path: string) {
  const clean = normalizePath(path)
  if (clean === '/')
    return '/'
  return clean.slice(0, clean.lastIndexOf('/')) || '/'
}

function itemPath(item: FsItem) {
  return joinPath(currentPath.value, item.name)
}

function isSelected(item: FsItem) {
  return selectedNames.value.includes(item.name)
}

function clearSelection() {
  selectedNames.value = []
}

function selectOnly(item: FsItem) {
  selectedNames.value = [item.name]
}

function setSelected(item: FsItem, checked: boolean) {
  selectedNames.value = checked
    ? Array.from(new Set([...selectedNames.value, item.name]))
    : selectedNames.value.filter(name => name !== item.name)
}

function changeSelection(item: FsItem, event: Event) {
  setSelected(item, (event.target as HTMLInputElement).checked)
}

function changeAllSelection(event: Event) {
  selectedNames.value = (event.target as HTMLInputElement).checked
    ? sortedItems.value.map(item => item.name)
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
const companionHref = (item: FsItem) => !item.is_dir && companionExts.has(extensionOf(item.name)) ? openListAbsoluteUrl(docProxyUrl(itemPath(item))) : undefined
function documentLink(item: FsItem, path: string) {
  const kind = fileKind(item)
  const url = docProxyUrl(path)
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
  const seq = ++refreshSeq
  loading.value = true
  const payload = await fsList(currentPath.value, '', 1, 200)
  if (seq !== refreshSeq)
    return
  handleResp(payload, (data: any) => {
    items.value = data?.content || []
    pathInput.value = currentPath.value
    selectedNames.value = selectedNames.value.filter(name => items.value.some(item => item.name === name))
  })
  loading.value = false
}

async function locatePath(path = '') {
  const target = normalizePath(path)
  if (!target || target === '/') {
    await refresh()
    return
  }
  const dir = parentPath(target)
  const name = target.split('/').pop() || ''
  currentPath.value = dir
  pathInput.value = dir
  await refresh()
  const item = items.value.find(item => item.name === name)
  if (item?.is_dir) {
    await goPath(target)
    return
  }
  selectedNames.value = item ? [name] : []
}

defineExpose({ openPath: locatePath })

async function goPath(path: string) {
  currentPath.value = normalizePath(path || '/')
  pathOpen.value = false
  clearSelection()
  await refresh()
}

async function openPathInput() {
  pathInput.value = currentPath.value
  pathOpen.value = true
  await nextTick()
  pathInputRef.value?.focus()
  pathInputRef.value?.select()
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

async function removeItems(names: string[]) {
  if (!names.length)
    return
  const resp = await fsRemove(currentPath.value, names)
  handleRespWithNotifySuccess(resp, async () => {
    clearSelection()
    await refresh()
  })
}

async function deleteSelection() {
  const names = selectedItems.value.map(item => item.name)
  if (!names.length)
    return
  confirm(
    tf('deleteFile', 'Delete'),
    tf('deleteConfirm', 'Delete selected items?'),
    async () => {
      await removeItems(names)
    },
  )
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
  if (!dstDir || dstDir === currentPath.value && type === 'move')
    return
  const resp = type === 'copy'
    ? await fsCopy(currentPath.value, dstDir, selectedItems.value.map(item => item.name), false, false, false)
    : await fsMove(currentPath.value, dstDir, selectedItems.value.map(item => item.name), false, false)
  handleRespWithNotifySuccess(resp, async () => {
    if (type === 'move')
      clearSelection()
    await refresh()
  })
}

async function copySelection() {
  await runTransferAction('copy')
}

async function moveSelection() {
  await runTransferAction('move')
}

function openUpload() {
  uploadInputRef.value?.click()
}

async function uploadFile(file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch(`${privateBase}/api/fs/form`, {
    method: 'PUT',
    headers: {
      'File-Path': encodeURIComponent(joinPath(currentPath.value, file.name)),
      Overwrite: 'false',
    },
    body: form,
  })
  const payload = await response.json()
  if (!response.ok || (payload.code && payload.code !== 200))
    throw new Error(payload.message || `HTTP ${response.status}`)
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
  if (!isSelected(item))
    selectOnly(item)
  const menu = new Menu('siyuan-cloud-file-item')
  const path = itemPath(item)
  menu.addItem({
    icon: item.is_dir ? 'iconFolder' : 'iconOpen',
    label: t('open'),
    click: () => openFile(item),
  })
  if (!item.is_dir) {
    menu.addItem({
      icon: 'iconDownload',
      label: tf('download', 'Download'),
      click: () => downloadItem(item),
    })
    menu.addItem({
      icon: 'iconLink',
      label: t('copyLink'),
      click: () => copyLink(item, path),
    })
  }
  menu.addSeparator({ id: 'separator_edit' })
  menu.addItem({
    icon: 'iconEdit',
    label: tf('rename', 'Rename'),
    click: () => renameSelection(),
  })
  menu.addItem({
    icon: 'iconCopy',
    label: tf('copy', 'Copy'),
    click: () => copySelection(),
  })
  menu.addItem({
    icon: 'iconMove',
    label: tf('move', 'Move'),
    click: () => moveSelection(),
  })
  menu.addSeparator({ id: 'separator_remove' })
  menu.addItem({
    icon: 'iconTrashcan',
    label: t('deleteFile'),
    click: () => deleteSelection(),
  })
  menu.open({ x: event.clientX, y: event.clientY })
}

onMounted(() => locatePath('/'))
</script>
