<template>
  <div class="ol-file-tab fn__flex">
    <div class="fn__flex-1 fn__flex-column ol-file-tab__main">
      <div class="ol-file-tab__top">
        <div class="block__icons">
          <button class="block__icon block__icon--show b3-tooltips b3-tooltips__se" type="button" :aria-label="t('parentFolder')" @click="goParent">
            <svg><use xlink:href="#iconLeft" /></svg>
          </button>
          <ul class="layout-tab-bar fn__flex fn__flex-1">
            <li
              v-for="(crumb, index) in crumbs"
              :key="crumb.path"
              class="item"
              :class="{ 'item--focus': index === crumbs.length - 1 }"
              :title="crumb.label"
              @click="goPath(crumb.path)"
            >
              <span class="item__text">{{ crumb.label }}</span>
            </li>
          </ul>
          <div v-if="pathOpen" class="ol-file-tab__path">
            <input
              ref="pathInputRef"
              v-model="pathInput"
              class="b3-text-field fn__block"
              :placeholder="t('pathPlaceholder')"
              spellcheck="false"
              @keydown.enter="goPath(pathInput)"
              @keydown.esc="pathOpen = false"
              @blur="pathOpen = false"
            >
          </div>
          <button v-else class="block__icon block__icon--show b3-tooltips b3-tooltips__sw" type="button" :aria-label="t('pathJump')" @click="openPathInput">
            <svg><use xlink:href="#iconSearch" /></svg>
          </button>
          <button class="block__icon block__icon--show b3-tooltips b3-tooltips__sw" type="button" :aria-label="t('refresh')" @click="refresh">
            <svg><use xlink:href="#iconRefresh" /></svg>
          </button>
          <button class="block__icon block__icon--show b3-tooltips b3-tooltips__sw" type="button" :aria-label="t('createFolder')" @click="createFolder">
            <svg><use xlink:href="#iconFolder" /></svg>
          </button>
          <button class="block__icon block__icon--show b3-tooltips b3-tooltips__sw" type="button" :aria-label="t('createFile')" @click="createFile">
            <svg><use xlink:href="#iconFile" /></svg>
          </button>
          <button class="block__icon block__icon--show b3-tooltips b3-tooltips__sw" type="button" :aria-label="t('openSettings')" @click="openSettings">
            <svg><use xlink:href="#iconSettings" /></svg>
          </button>
        </div>
      </div>

      <div class="fn__flex-1 ol-file-tab__content">
        <div v-if="loading" class="ol-file-tab__loading">
          <div class="fn__loading" />
        </div>
        <div v-else-if="sortedItems.length" class="b3-list b3-list--background">
          <div
            v-for="item in sortedItems"
            :key="item.name"
            class="b3-list-item ol-file-row"
            @click="item.is_dir && goPath(joinPath(currentPath, item.name))"
            @dblclick="!item.is_dir && openFile(item)"
          >
            <span class="b3-list-item__text ol-file-row__name">
              <svg class="ol-file-row__icon" :class="`ol-file-row__icon--${openListFileIconName(item.name, item.is_dir)}`">
                <use :xlink:href="openListFileIconHref(item.name, item.is_dir)" />
              </svg>
              <span class="ol-file-row__label">{{ item.name }}</span>
              <span v-if="!item.is_dir" class="ol-file-row__actions">
                <button v-if="isImageFile(item)" class="block__icon b3-tooltips b3-tooltips__nw" type="button" :aria-label="t('openImageViewer')" @click.stop="openImageViewer(item)">
                  <svg><use xlink:href="#iconOpenListImage" /></svg>
                </button>
                <button v-if="isMediaFile(item)" class="block__icon b3-tooltips b3-tooltips__nw" type="button" :aria-label="t('openInMediaPlayer')" @click.stop="openWithMediaPlayer(item)">
                  <svg><use xlink:href="#iconPlay" /></svg>
                </button>
                <button class="block__icon b3-tooltips b3-tooltips__nw" type="button" :aria-label="t('deleteFile')" @click.stop="removeItem(item)">
                  <svg><use xlink:href="#iconTrashcan" /></svg>
                </button>
              </span>
            </span>
            <span class="b3-list-item__meta">{{ item.is_dir ? '' : formatSize(item.size) }}</span>
            <span class="b3-list-item__meta">{{ formatModified(item.modified) }}</span>
          </div>
        </div>
        <div v-else class="ol-file-tab__empty">
            <svg><use xlink:href="#iconOpenListFolder" /></svg>
            <span>{{ t('rootEmpty') }}</span>
        </div>
      </div>

      <footer class="ol-file-tab__preview">
        <div class="fn__flex ft__smaller">
          <span class="ft__on-surface">{{ t('filePreview') }}</span>
        </div>
        <textarea v-model="preview" class="b3-text-field fn__block" readonly :placeholder="t('filePreviewPlaceholder')" />
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showMessage } from 'siyuan'
import { computed, nextTick, onMounted, ref } from 'vue'
import { usePlugin } from '@/main'
import { openListJson } from '@/utils/api'
import { openListFileIconHref, openListFileIconName } from '@/utils/icon'

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
const preview = ref('')
const pathOpen = ref(false)
const pathInputRef = ref<HTMLInputElement>()
const sortedItems = computed(() => [...items.value].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)))
const crumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const list = [{ label: t('rootFolder'), path: '/' }]
  parts.forEach((part, index) => {
    list.push({ label: part, path: `/${parts.slice(0, index + 1).join('/')}` })
  })
  return list
})

const audioExts = new Set('mp3,flac,ogg,m4a,wav,opus,wma'.split(','))
const videoExts = new Set('mp4,mkv,avi,mov,rmvb,webm,flv,m3u8'.split(','))
const imageExts = new Set('jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(','))

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function joinPath(dir: string, name: string) {
  return `${dir.replace(/\/+$/, '')}/${name}`.replace(/^$/, '/')
}

function parentPath(path: string) {
  const clean = path.replace(/\/+$/, '')
  if (!clean || clean === '/')
    return '/'
  return clean.slice(0, clean.lastIndexOf('/')) || '/'
}

function formatSize(size = 0) {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
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

function mediaTypeFor(name: string) {
  const ext = extensionOf(name)
  if (audioExts.has(ext))
    return 'audio'
  if (videoExts.has(ext))
    return 'video'
  return ''
}

function isMediaFile(item: FsItem) {
  return !item.is_dir && Boolean(mediaTypeFor(item.name))
}

function isImageFile(item: FsItem) {
  return !item.is_dir && imageExts.has(extensionOf(item.name))
}

function absoluteUrl(url: string) {
  if (!url)
    return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return url
  return `${location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

function openListDownloadUrl(path: string, data: Record<string, any>) {
  const rawUrl = String(data.raw_url || data.url || '')
  if (rawUrl)
    return absoluteUrl(rawUrl)
  const sign = data.sign ? `?sign=${encodeURIComponent(String(data.sign))}` : ''
  return absoluteUrl(`/plugin/private/siyuan-cloud/d${path}${sign}`)
}

async function openWithMediaPlayer(item: FsItem) {
  const path = joinPath(currentPath.value, item.name)
  const payload = await openListJson('/api/fs/get', { path })
  const data = payload.data || {}
  const url = openListDownloadUrl(path, data)
  const mediaItem = {
    id: `siyuan-cloud:${path}`,
    title: item.name,
    name: item.name,
    type: mediaTypeFor(item.name),
    url,
    originalUrl: url,
    source: 'standard',
    sourcePath: path,
    provider: data.provider || 'Siyuan Cloud',
    raw_url: data.raw_url || '',
    sign: data.sign || '',
    size: item.size,
    is_dir: false,
  }
  const runtime = window.siyuanMediaPlayer
  if (runtime?.playMediaItem) {
    await runtime.playMediaItem(mediaItem)
    showMessage(t('mediaPlayerOpened'), 2000)
    return
  }
  if (runtime?.openPlayerTab) {
    await runtime.openPlayerTab(mediaItem)
    showMessage(t('mediaPlayerOpened'), 2000)
    return
  }
  showMessage(t('mediaPlayerUnavailable'), 4000, 'error')
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
  const path = joinPath(currentPath.value, item.name)
  const payload = await openListJson('/api/fs/get', { path })
  return openListDownloadUrl(path, payload.data || {})
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
  const initialViewIndex = Math.max(0, urls.findIndex((url) => url === currentUrl))
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

async function refresh() {
  loading.value = true
  preview.value = ''
  try {
    const payload = await openListJson('/api/fs/list', { path: currentPath.value, page: 1, per_page: 100 })
    items.value = payload.data?.content || []
    pathInput.value = currentPath.value
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), 4000, 'error')
  } finally {
    loading.value = false
  }
}

async function goPath(path: string) {
  currentPath.value = path || '/'
  pathOpen.value = false
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
  const name = `folder-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  await openListJson('/api/fs/mkdir', { path: joinPath(currentPath.value, name) })
  await refresh()
}

async function createFile() {
  const name = `note-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  await openListJson('/api/fs/put', { path: joinPath(currentPath.value, name), content: 'hello siyuan cloud' }, { method: 'PUT' })
  await refresh()
}

async function openFile(item: FsItem) {
  if (isImageFile(item)) {
    await openImageViewer(item)
    return
  }
  if (isMediaFile(item)) {
    await openWithMediaPlayer(item)
    return
  }
  const payload = await openListJson('/api/fs/get', { path: joinPath(currentPath.value, item.name) })
  preview.value = payload.data?.content || ''
}

async function removeItem(item: FsItem) {
  await openListJson('/api/fs/remove', {
    dir: currentPath.value,
    names: [item.name],
  })
  await refresh()
}

function openSettings() {
  window._siyuan_cloud?.openDock?.()
}

onMounted(refresh)
</script>
