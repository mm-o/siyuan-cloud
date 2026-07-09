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
      <div class="block__icons">
        <div class="fn__flex-1 fn__flex ol-file-tab__crumbs">
          <button
            class="block__icon block__icon--show ariaLabel"
            type="button"
            :aria-label="tf('parentFolder', 'Parent Folder')"
            @click="goPath(parentPath(currentPath))"
          >
            <svg><use xlink:href="#iconLeft" /></svg>
          </button>
          <template
            v-for="(crumb, index) in crumbs"
            :key="crumb.path"
          >
            <span
              class="b3-list-item__text ariaLabel"
              :title="crumb.label"
              @click="goPath(crumb.path)"
            >
              {{ crumb.label }}
            </span>
            <span
              v-if="index < crumbs.length - 1"
              class="ft__on-surface"
            >/</span>
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
          v-for="action in primaryToolbarActions"
          :key="action.key"
          class="block__icon block__icon--show ariaLabel"
          type="button"
          :disabled="action.disabled"
          :aria-label="action.label"
          @click="action.run"
        >
          <svg><use :xlink:href="`#${action.icon}`" /></svg>
        </button>
        <button
          class="block__icon block__icon--show ariaLabel"
          type="button"
          :aria-label="tf('more', 'More')"
          @click.stop="openToolbarMoreMenu"
        >
          <svg><use xlink:href="#iconMore" /></svg>
        </button>
      </div>

      <div
        ref="contentRef"
        class="fn__flex-1 ol-file-tab__content"
        @click="onContentClick"
        @contextmenu.prevent="openBackgroundMenu"
        @mousedown="shortcutSelecting = hasModifier($event)"
      >
        <div
          v-if="loading"
          class="ol-file-tab__loading"
        >
          <div class="fn__loading" />
        </div>
        <ul
          v-else-if="sortedItems.length && viewMode === 'list'"
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
              @click.stop
            >
            <span class="b3-list-item__text ft__on-surface">{{ selectedSummary }}</span>
            <span class="b3-list-item__meta ft__on-surface">{{ tf('size', 'Size') }}</span>
            <span class="b3-list-item__meta ft__on-surface">{{ tf('modified', 'Modified') }}</span>
          </li>
          <li
            v-for="item in sortedItems"
            :key="itemPath(item)"
            class="b3-list-item ol-file-row"
            :data-path="itemPath(item)"
            draggable="true"
            :class="{
              'ol-file-row--selecting': selectionMode,
              'ol-file-row--focus': focusPath === itemPath(item) || isSelected(item),
            }"
            @click="onItemClick($event, item)"
            @contextmenu.stop.prevent="openItemMenu($event, item)"
            @dragstart="onItemDragStart($event, item)"
          >
            <input
              v-if="selectionMode"
              type="checkbox"
              :checked="isSelected(item)"
              :aria-label="item.name"
              @click.stop="changeSelection(item, $event)"
            >
            <span
              class="b3-list-item__text"
              :title="item.name"
              :data-href="companionDataHref(item)"
            >
              <svg
                class="ol-file-row__icon"
                :class="`ol-file-row__icon--${openListFileIconName(item.name, item.is_dir)}`"
              >
                <use :xlink:href="openListFileIconHref(item.name, item.is_dir)" />
              </svg>
              <span class="fn__space" />
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
          v-else-if="sortedItems.length"
          class="ol-file-grid"
        >
          <div
            v-for="(column, columnIndex) in masonryColumns"
            :key="columnIndex"
            class="ol-file-grid__column"
          >
            <div
              v-for="item in column"
              :key="itemPath(item)"
              class="ol-file-card"
              :class="{ 'ol-file-row--focus': focusPath === itemPath(item) || isSelected(item) }"
              :data-path="itemPath(item)"
              draggable="true"
              @click="onItemClick($event, item)"
              @contextmenu.stop.prevent="openItemMenu($event, item)"
              @dragstart="onItemDragStart($event, item)"
            >
              <input
                v-if="selectionMode"
                type="checkbox"
                :checked="isSelected(item)"
                :aria-label="item.name"
                @click.stop="changeSelection(item, $event)"
              >
              <div
                class="ol-file-card__thumb"
                :style="imageThumbStyle(item)"
                :data-href="companionDataHref(item)"
              >
                <svg
                  class="ol-file-row__icon"
                  :class="`ol-file-row__icon--${openListFileIconName(item.name, item.is_dir)}`"
                >
                  <use :xlink:href="openListFileIconHref(item.name, item.is_dir)" />
                </svg>
                <img
                  v-if="isImageFile(item)"
                  :src="imagePreviewUrl(item)"
                  :alt="item.name"
                  decoding="async"
                  loading="lazy"
                  @load="cacheImageRatio(item, $event)"
                >
                <span
                  class="ol-file-card__meta"
                  :title="item.name"
                >
                  <span>{{ item.name }}</span>
                  <small>{{ item.is_dir ? tf('dir', 'DIR') : formatSize(item.size) }}</small>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="ol-file-tab__empty"
        >
          <svg><use xlink:href="#iconOpenListFolder" /></svg>
          <span>{{ t('rootEmpty') }}</span>
        </div>
      </div>

    </div>
    <div
      class="ol-file-transfer"
      :class="{ 'ol-file-transfer--active': transferItems.length, 'ol-file-transfer--dragging': transferDragging }"
      @dragenter.prevent="transferDragging = true"
      @dragover.prevent="transferDragging = true"
      @dragleave="onTransferDragLeave"
      @drop.prevent="onTransferDrop"
    >
      <div class="ol-file-transfer__head">
        <svg><use :xlink:href="transferIcon" /></svg>
        <b>{{ transferTitle }}</b>
        <button
          v-if="finishedTransferCount"
          class="block__icon fn__flex-center ariaLabel"
          type="button"
          :aria-label="tf('clear', 'Clear')"
          @click.stop="clearFinishedTransfers"
        >
          <svg><use xlink:href="#iconTrashcan" /></svg>
        </button>
      </div>
      <div class="ol-file-transfer__hint">
        {{ tf('dropFilesHere', 'Drop files here') }}
      </div>
      <div
        v-if="transferItems.length"
        class="ol-file-transfer__list"
      >
        <div
          v-for="item in visibleTransferItems"
          :key="item.id"
          class="ol-file-transfer__item"
          :class="`ol-file-transfer__item--${item.status}`"
        >
          <div class="b3-list-item b3-list-item--hide-action">
            <span class="b3-list-item__text">{{ item.name }}</span>
            <span class="b3-list-item__meta">{{ item.message }}</span>
          </div>
          <div class="ol-file-transfer__bar">
            <i :style="{ width: item.progress === null ? undefined : `${item.progress}%` }" />
          </div>
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
  fsUploadFile,
  resolveOpenListFile,
} from '@/utils/api'
import { handleResp, handleRespWithNotifySuccess } from '@/utils/handle_resp'
import {
  isArchiveFileName,
  openArchiveBrowser,
} from '@/utils/archive'
import {
  copyOpenListItemLink,
  deleteOpenListSelection,
  downloadOpenListItem,
  itemOpenListPath,
  joinOpenListPath as joinPath,
  normalizeOpenListPath as normalizePath,
  openListDragHtml,
  openListDocumentLink,
  openOpenListFileItemMenu,
  parentOpenListPath as parentPath,
  selectedOpenListGroups,
  sendOpenListItemToMotrixNext,
  shareOpenListSelection,
} from '@/utils/file_actions'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import {
  itemOpenUrl as openListItemOpenUrl,
  formatSize,
  openLazyImageViewer,
  openListCompanionHref,
  openListFileKind,
  openOpenListMediaPreview,
  promptText,
  selectSavePath,
  showErrorMessage,
} from '@/utils/file_ui'

interface FsItem {
  name: string
  size: number
  is_dir: boolean
  path?: string
  parent?: string
  modified?: string
  raw_url?: string
  thumb?: string
  url?: string
}

interface TransferItem {
  id: number
  name: string
  progress: number | null
  status: 'running' | 'done' | 'error'
  type: 'upload' | 'download'
  message: string
}

const plugin = usePlugin()
const currentPath = ref('/')
const searchInput = ref('')
const searchActive = ref(false)
const searchInputOpen = ref(false)
const items = ref<FsItem[]>([])
const loading = ref(false)
const contentRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const uploadInputRef = ref<HTMLInputElement>()
const selectedPaths = ref<string[]>([])
const selectionMode = ref(false)
const shortcutSelecting = ref(false)
const focusPath = ref('')
const transferDragging = ref(false)
const transferItems = ref<TransferItem[]>([])
const VIEW_MODE_KEY = 'siyuan-cloud-file-view-mode'
const IMAGE_RATIO_KEY = 'siyuan-cloud-file-image-ratios'
const IMAGE_COLUMN_WIDTH = 180
const viewMode = ref(localStorage.getItem(VIEW_MODE_KEY) === 'image' ? 'image' : 'list')
const imageRatios = ref<Record<string, string>>(storedJson(IMAGE_RATIO_KEY, {}))
const gridColumnCount = ref(1)
let refreshSeq = 0
let transferSeq = 0
let gridResizeObserver: ResizeObserver | undefined
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)),
)
const masonryColumns = computed(() => {
  const columns = Array.from({ length: Math.min(gridColumnCount.value, sortedItems.value.length || 1) }, () => [] as FsItem[])
  const heights = columns.map(() => 0)
  sortedItems.value.forEach((item) => {
    const index = heights.indexOf(Math.min(...heights))
    columns[index].push(item)
    heights[index] += itemHeight(item)
  })
  return columns
})
const crumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const list = [{ label: t('rootFolder'), path: '/' }]
  parts.forEach((part, index) => {
    list.push({ label: part, path: `/${parts.slice(0, index + 1).join('/')}` })
  })
  return list
})
const selectedItems = computed(() =>
  sortedItems.value.filter(item => selectedPaths.value.includes(itemPath(item))),
)
const primarySelectedItem = computed(() => selectedItems.value[0] || null)
const downloadableSelection = computed(() => selectedItems.value.filter(item => !item.is_dir))
const allItemsSelected = computed(() => Boolean(sortedItems.value.length) && sortedItems.value.every(isSelected))
const selectedSummary = computed(() =>
  selectedItems.value.length
    ? tf('selectedCount', '{count} selected').replace('{count}', String(selectedItems.value.length))
    : tf('name', 'Name'),
)
const visibleTransferItems = computed(() => transferItems.value.slice(-5).reverse())
const runningTransferCount = computed(() => transferItems.value.filter(item => item.status === 'running').length)
const finishedTransferCount = computed(() => transferItems.value.filter(item => item.status !== 'running').length)
const transferIcon = computed(() =>
  visibleTransferItems.value.some(item => item.type === 'download') ? '#iconDownload' : '#iconUpload',
)
const transferTitle = computed(() =>
  runningTransferCount.value
    ? tf('transferRunning', '{count} running').replace('{count}', String(runningTransferCount.value))
    : tf('transferPanel', 'Transfers'),
)
const primaryToolbarActions = computed(() => [
  { key: 'refresh', icon: 'iconRefresh', label: tf('refresh', 'Refresh'), run: refresh },
  searchActive.value
    ? { key: 'clearSearch', icon: 'iconClose', label: tf('clearSearch', 'Clear Search'), run: clearSearch }
    : { key: 'search', icon: 'iconSearch', label: tf('search', 'Search'), run: openSearchInput },
  { key: 'view', icon: viewMode.value === 'image' ? 'iconList' : 'iconOpenListGrid', label: viewMode.value === 'image' ? tf('listView', 'List View') : tf('imageView', 'Image View'), run: toggleViewMode },
  { key: 'upload', icon: 'iconUpload', label: tf('upload', 'Upload'), run: openUpload },
  { key: 'selection', icon: selectionMode.value ? 'iconCheck' : 'iconUncheck', label: tf('toggleCheckbox', 'Toggle selection'), run: toggleSelectionMode },
  { key: 'download', icon: 'iconDownload', label: tf('download', 'Download'), disabled: !downloadableSelection.value.length, run: downloadSelection },
])
const moreToolbarActions = computed(() => [
  { key: 'createFolder', icon: 'iconFolder', label: t('createFolder'), run: createFolder },
  { key: 'createFile', icon: 'iconFile', label: t('createFile'), run: createFile },
  { key: 'rename', icon: 'iconEdit', label: tf('rename', 'Rename'), disabled: selectedItems.value.length !== 1, run: renameSelection },
  { key: 'copy', icon: 'iconCopy', label: tf('copy', 'Copy'), disabled: !selectedItems.value.length, run: copySelection },
  { key: 'move', icon: 'iconMove', label: tf('move', 'Move'), disabled: !selectedItems.value.length, run: moveSelection },
  { key: 'share', icon: 'iconLink', label: tf('share', 'Share'), disabled: !selectedItems.value.length, run: shareSelection },
  { key: 'delete', icon: 'iconTrashcan', label: t('deleteFile'), disabled: !selectedItems.value.length, run: deleteSelection },
  { key: 'settings', icon: 'iconSettings', label: t('openSettings'), run: openSettings },
])
const moreToolbarSeparators = new Set(['rename', 'share', 'settings'])

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function tf(key: string, fallback: string) {
  const value = (plugin.i18n as Record<string, string>)?.[key]
  return value === undefined ? fallback : String(value)
}

function storedJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') || fallback
  } catch {
    return fallback
  }
}

function itemPath(item: FsItem) {
  return itemOpenListPath(item, currentPath.value)
}

function isSelected(item: FsItem) {
  return selectedPaths.value.includes(itemPath(item))
}

function clearSelection() {
  selectedPaths.value = []
}

function clearSelectionMode() {
  selectionMode.value = false
  clearSelection()
}

function selectOnly(item: FsItem) {
  selectedPaths.value = [itemPath(item)]
}

function setSelected(item: FsItem, checked: boolean) {
  const key = itemPath(item)
  selectedPaths.value = checked
    ? Array.from(new Set([...selectedPaths.value, key]))
    : selectedPaths.value.filter(path => path !== key)
}

function selectRange(item: FsItem, additive = false) {
  const paths = sortedItems.value.map(itemPath)
  const start = paths.indexOf(selectedPaths.value[selectedPaths.value.length - 1])
  const end = paths.indexOf(itemPath(item))
  if (start < 0 || end < 0) {
    selectOnly(item)
    return
  }
  const range = paths.slice(Math.min(start, end), Math.max(start, end) + 1)
  selectedPaths.value = additive ? Array.from(new Set([...selectedPaths.value, ...range])) : range
}

function selectByMouse(event: MouseEvent, item: FsItem, checked = !isSelected(item)) {
  if (hasModifier(event)) {
    selectionMode.value = true
    if (event.shiftKey)
      selectRange(item, event.ctrlKey || event.metaKey)
    else
      setSelected(item, checked)
    return
  }
  setSelected(item, checked)
}

function onItemClick(event: MouseEvent, item: FsItem) {
  if (hasModifier(event)) {
    event.preventDefault()
    selectByMouse(event, item)
    return
  }
  if ((event.target as HTMLElement).closest('[data-href]'))
    return
  if (!(event.target as HTMLElement).closest('.b3-list-item__text, .ol-file-card__thumb')) {
    clearSelectionMode()
    return
  }
  openFile(item)
}

function changeSelection(item: FsItem, event: MouseEvent) {
  selectByMouse(event, item, (event.target as HTMLInputElement).checked)
}

function changeAllSelection(event: Event) {
  if ((event.target as HTMLInputElement).checked)
    selectAllItems()
  else
    clearSelection()
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value)
    clearSelection()
}

function selectAllItems() {
  const paths = sortedItems.value.map(itemPath)
  selectedPaths.value = paths
  selectionMode.value = Boolean(paths.length)
}

function hasModifier(event: MouseEvent) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!contentRef.value?.matches(':hover'))
    return
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable="true"]'))
    return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selectAllItems()
    return
  }
  if (event.key === 'Escape' && selectionMode.value) {
    event.preventDefault()
    clearSelectionMode()
    return
  }
  if (event.key === 'Delete' && selectedItems.value.length) {
    event.preventDefault()
    deleteSelection()
    return
  }
  if (event.key === 'Enter' && selectedItems.value.length === 1) {
    event.preventDefault()
    openFile(selectedItems.value[0])
  }
}

function onContentClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('[data-path], input'))
    return
  clearSelectionMode()
}

function formatModified(value?: string) {
  if (!value)
    return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleString()
}

function fileKind(item: FsItem) {
  return openListFileKind(item.name, item.is_dir)
}

const isImageFile = (item: FsItem) => fileKind(item) === 'image'
const isArchiveFile = (item: FsItem) => !item.is_dir && isArchiveFileName(item.name)

const itemOpenUrl = (item: FsItem) => openListItemOpenUrl(item, itemPath)
const companionHref = (item: FsItem) => openListCompanionHref(item.name, itemPath(item), item.is_dir)
const companionDataHref = (item: FsItem) => shortcutSelecting.value ? undefined : companionHref(item)
const documentLink = (item: FsItem, path: string) => openListDocumentLink({ item, path })

async function resolveDownloadUrl(path: string, preferFresh = false) {
  const local = items.value.find(item => itemPath(item) === path)
  if (!preferFresh && (local?.raw_url || local?.url))
    return itemOpenUrl(local)
  return (await resolveOpenListFile(path)).url
}

const copyLink = (item: FsItem, path: string) => copyOpenListItemLink({ item, link: documentLink, path, t })

function onItemDragStart(event: DragEvent, item: FsItem) {
  if (!event.dataTransfer)
    return
  const items = isSelected(item) ? selectedItems.value : [item]
  event.dataTransfer.setData('text/html', items.map(item => openListDragHtml(documentLink(item, itemPath(item)))).join('<br>'))
  event.dataTransfer.effectAllowed = 'copy'
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'image' ? 'list' : 'image'
  localStorage.setItem(VIEW_MODE_KEY, viewMode.value)
}

function imagePreviewUrl(item: FsItem) {
  return item.thumb || itemOpenUrl(item)
}

function imageThumbStyle(item: FsItem) {
  return isImageFile(item) ? { aspectRatio: imageRatios.value[itemPath(item)] || '1 / 1' } : undefined
}

function itemHeight(item: FsItem) {
  const ratio = imageRatios.value[itemPath(item)]?.split('/').map(Number)
  return isImageFile(item) && ratio?.[0] && ratio?.[1] ? ratio[1] / ratio[0] : 1
}

function cacheImageRatio(item: FsItem, event: Event) {
  const img = event.target as HTMLImageElement
  if (!img.naturalWidth || !img.naturalHeight)
    return
  const key = itemPath(item)
  const ratio = `${img.naturalWidth} / ${img.naturalHeight}`
  if (imageRatios.value[key] === ratio)
    return
  imageRatios.value = { ...imageRatios.value, [key]: ratio }
  // ponytail: local ratios; backend width/height would remove first-load square placeholders.
  localStorage.setItem(IMAGE_RATIO_KEY, JSON.stringify(imageRatios.value))
}

async function openImageViewer(item: FsItem) {
  await openLazyImageViewer({
    current: item,
    items: items.value.filter(isImageFile),
    keyOf: itemPath,
    onError: showErrorMessage,
    urlOf: item => resolveDownloadUrl(itemPath(item)),
  })
}

const promptInput = (title: string, value = '', placeholder = '') => promptText({
  title,
  value,
  placeholder,
  cancelText: tf('cancel', 'Cancel'),
  confirmText: tf('confirmAction', 'Confirm'),
})

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
    selectedPaths.value = selectedPaths.value.filter(path => items.value.some(item => itemPath(item) === path))
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
        thumb: entry.thumb,
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
  if (item)
    focusPath.value = target
  await nextTick()
  document.querySelector(`.siyuan-cloud-file-tab [data-path="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'center' })
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
  focusPath.value = ''
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

async function createFolder() {
  const value = await promptInput(tf('createFolder', 'Create Folder'), '', tf('folderNamePlaceholder', 'Folder name'))
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
  const value = await promptInput(tf('createFile', 'Create File'), '', tf('fileNamePlaceholder', 'File name'))
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
  if (isArchiveFile(item)) {
    await browseArchive(item)
    return
  }
  const kind = fileKind(item)
  if (kind === 'image') {
    await openImageViewer(item)
    return
  }
  if (kind === 'audio' || kind === 'video') {
    await openOpenListMediaPreview(item.name, itemPath(item), kind, resolveDownloadUrl)
    return
  }
  if (kind !== 'text') {
    showMessage(tf('useDownloadAction', 'Use the toolbar or context menu to download this file.'), 3000)
    return
  }
  let content = ''
  try {
    const url = await resolveDownloadUrl(itemPath(item))
    const response = await fetch(url, { method: 'GET' })
    content = await response.text()
  } catch (error) {
    const payload = await fsGet(itemPath(item))
    content = payload.data?.content || (error instanceof Error ? error.message : String(error))
  }
  showTextPreview(item.name, content)
}

async function browseArchive(item: FsItem) {
  await openArchiveBrowser({
    archivePath: itemPath(item),
    tf,
    title: `${tf('browseArchive', 'Browse archive')} - ${item.name}`,
  })
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
  const value = await promptInput(tf('rename', 'Rename'), item.name, tf('renamePlaceholder', 'New name'))
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
  const value = await promptInput(
    tf(type, type === 'copy' ? 'Copy' : 'Move'),
    currentPath.value,
    tf(type === 'copy' ? 'copyTargetPlaceholder' : 'moveTargetPlaceholder', 'Target directory path'),
  )
  const dstDir = normalizePath(String(value || ''))
  if (!dstDir)
    return
  for (const group of selectedOpenListGroups(selectedItems.value, currentPath.value)) {
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
  await shareOpenListSelection({ itemPath, items: selectedItems.value, tf })
}

function openUpload() {
  uploadInputRef.value?.click()
}

function pushTransfer(type: 'upload' | 'download', name: string) {
  const item: TransferItem = {
    id: ++transferSeq,
    name,
    progress: null,
    status: 'running',
    type,
    message: type === 'upload' ? tf('uploading', 'Uploading') : tf('downloadStarting', 'Starting'),
  }
  transferItems.value.push(item)
  return item
}

function finishTransfer(item: TransferItem, status: TransferItem['status'], message: string, progress = item.progress) {
  item.status = status
  item.message = message
  item.progress = progress
}

function clearFinishedTransfers() {
  transferItems.value = transferItems.value.filter(item => item.status === 'running')
}

function onTransferDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement
  const next = event.relatedTarget as Node | null
  if (!next || !current.contains(next))
    transferDragging.value = false
}

async function uploadFile(file: File) {
  const item = pushTransfer('upload', file.name)
  try {
    const payload = await fsUploadFile(joinPath(currentPath.value, file.name), file, (progress) => {
      item.progress = progress
      item.message = progress >= 95 && progress < 100 ? tf('processing', 'Processing') : `${progress}%`
    })
    if (payload.code !== 200)
      throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
    finishTransfer(item, 'done', tf('done', 'Done'), 100)
    return true
  } catch (error) {
    finishTransfer(item, 'error', error instanceof Error ? error.message : String(error))
    return false
  }
}

async function uploadFiles(files: File[]) {
  if (!files.length)
    return
  let failed = false
  for (const file of files)
    failed = !await uploadFile(file) || failed
  if (!failed)
    showMessage(tf('uploadDone', 'Upload completed'), 2000)
  await refresh()
  notifyChanged()
}

async function onTransferDrop(event: DragEvent) {
  transferDragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  await uploadFiles(files)
}

async function onUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  try {
    await uploadFiles(files)
  } finally {
    input.value = ''
  }
}

async function downloadItem(item: FsItem) {
  let transfer: TransferItem | null = null
  try {
    const targetPath = await selectSavePath(item.name, {
      cancel: tf('cancel', 'Cancel'),
      confirm: tf('download', 'Download'),
      title: tf('saveAs', 'Save as'),
    })
    if (!targetPath)
      return
    transfer = pushTransfer('download', item.name)
    transfer.message = tf('downloading', 'Downloading')
    const result = await downloadOpenListItem({
      item,
      itemPath,
      tf,
      targetPath,
      onProgress: (progress) => {
        transfer.progress = progress
        transfer.message = `${progress}%`
      },
    })
    if (result === 'cancelled') {
      transferItems.value = transferItems.value.filter(current => current.id !== transfer.id)
      return
    }
    finishTransfer(transfer, 'done', tf('done', 'Done'), 100)
  } catch (error) {
    if (transfer)
      finishTransfer(transfer, 'error', error instanceof Error ? error.message : String(error))
    else
      showErrorMessage(error)
  }
}

async function downloadSelection() {
  for (const item of downloadableSelection.value)
    await downloadItem(item)
}

async function sendSelectionToMotrixNext() {
  for (const item of downloadableSelection.value)
    await sendOpenListItemToMotrixNext({ item, itemPath, tf })
}

function openSettings() {
  window._siyuan_cloud?.openDock?.()
}

function openToolbarMoreMenu(event: MouseEvent) {
  const menu = new Menu('siyuan-cloud-file-toolbar')
  moreToolbarActions.value.forEach((action) => {
    if (moreToolbarSeparators.has(action.key))
      menu.addSeparator({ id: `toolbar_${action.key}` })
    menu.addItem({
      icon: action.icon,
      label: action.label,
      disabled: action.disabled,
      click: () => action.run(),
    })
  })
  menu.open({ x: event.clientX, y: event.clientY })
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
    browseArchive: isArchiveFile(item) ? browseArchive : undefined,
    copyLink,
    copySelection,
    deleteSelection,
    downloadItem: (target: FsItem) => isSelected(target) && downloadableSelection.value.length > 1 ? downloadSelection() : downloadItem(target),
    event,
    isSelected,
    item,
    itemPath,
    moveSelection,
    openFile,
    renameSelection,
    selectOnly,
    sendToMotrixNext: (target: FsItem) => isSelected(target) && downloadableSelection.value.length > 1 ? sendSelectionToMotrixNext() : sendOpenListItemToMotrixNext({ item: target, itemPath, tf }),
    shareSelection,
    t,
    tf,
  })
}

onMounted(() => {
  window.addEventListener('siyuan-cloud:changed', refresh)
  window.addEventListener('keydown', onWindowKeydown)
  gridResizeObserver = new ResizeObserver(([entry]) => {
    gridColumnCount.value = Math.max(1, Math.floor(entry.contentRect.width / IMAGE_COLUMN_WIDTH))
  })
  if (contentRef.value)
    gridResizeObserver.observe(contentRef.value)
  locatePath('/')
})
onBeforeUnmount(() => {
  window.removeEventListener('siyuan-cloud:changed', refresh)
  window.removeEventListener('keydown', onWindowKeydown)
  gridResizeObserver?.disconnect()
})
</script>
