<template>
  <section class="ol-dock dockPanel fn__flex-1 fn__flex-column">
    <nav class="block__icons fn__hidescrollbar" aria-label="Siyuan Cloud management">
      <template
        v-for="tab in tabs"
        :key="tab.key"
      >
        <DockActionButton :icon="tab.icon" :label="t(tab.labelKey)" :active="currentTab === tab.key" @run="currentTab = tab.key" />
        <span class="fn__space" />
      </template>
      <span class="fn__flex-1" />
    </nav>

    <DockSectionHeader :icon="currentPage.icon" :title="t(currentPage.labelKey)" :actions="currentPageActions" />
    <section
      v-if="currentTab === 'files'"
      class="fn__flex-1 fn__flex-column file-tree sy__file"
      @pointerdown.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <div
        class="fn__flex-1 fn__hidescrollbar"
        @click="onTreeClick"
        @mouseover.stop
        v-html="treeHtml"
      />
    </section>

    <main
      v-else
      class="ol-body"
      @pointerdown.stop
      @click.stop
      @input.stop
      @change.stop
      @contextmenu.stop
    >
      <template v-if="currentTab === 'settings'">
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <label class="ol-field">
              <span>{{ t('verifyUsername') }}</span>
              <input v-model="verifyUsername" class="b3-text-field" type="text">
            </label>
          </div>
          <div class="b3-list-item">
            <label class="ol-field">
              <span>{{ t('verifyPassword') }}</span>
              <input v-model="verifyPassword" class="b3-text-field" type="password">
            </label>
            <DockActionButton list icon="#iconKey" :label="t('verifyLogin')" @run="verifyLogin" />
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ t('currentSession') }}</span>
            <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="accountInfo || verifySession || t('unknown')">{{ accountInfo || verifySession || t('unknown') }}</span>
          </div>
        </div>

        <DockSectionHeader icon="#iconSettings" :title="t('configImportExport')" :actions="sectionActions.config" />
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <textarea v-model="configText" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('configJsonPlaceholder')" />
          </div>
        </div>

        <DockSectionHeader icon="#iconOpen" :title="t('externalPreviews')" :actions="sectionActions.external" />
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <label class="ol-field">
              <textarea v-model="externalPreviews" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('externalPreviewsHelp')" />
              <small>{{ t('externalPreviewsHelp') }}</small>
            </label>
          </div>
        </div>
      </template>

      <template v-else-if="currentTab === 'tasks'">
        <div class="b3-list b3-list--background">
          <div v-for="item in verifyLog" :key="item.id" class="b3-list-item">
            <svg class="b3-list-item__graphic" :class="{ 'ft__error': !item.ok }"><use :xlink:href="item.ok ? '#iconCheck' : '#iconClose'" /></svg>
            <span class="b3-list-item__text">{{ item.title }}</span>
            <span class="b3-list-item__meta">{{ item.detail }}</span>
          </div>
          <div v-if="!verifyLog.length" class="b3-list--empty">{{ t('verifyEmpty') }}</div>
        </div>
      </template>

      <template v-else-if="currentTab === 'shares'">
        <div class="b3-list b3-list--background">
          <div v-for="item in shareItems" :key="item.id || item.sid" class="b3-list-item">
            <svg class="b3-list-item__graphic"><use xlink:href="#iconLink" /></svg>
            <span class="b3-list-item__text ariaLabel" :aria-label="shareDetail(item)">{{ shareTitle(item) }}</span>
            <span class="b3-list-item__meta">{{ item.disabled ? t('disabled') : item.sid }}</span>
            <DockActionButton list icon="#iconCopy" :label="t('copyRoute')" @run="copyShare(item)" />
            <DockActionButton list :icon="item.disabled ? '#iconEye' : '#iconEyeoff'" :label="item.disabled ? t('mountEnable') : t('mountDisable')" @run="toggleShare(item)" />
            <DockActionButton list icon="#iconTrashcan" :label="t('mountDelete')" @run="deleteShare(item)" />
          </div>
          <div v-if="!shareItems.length" class="b3-list--empty">{{ t('shareEmpty') }}</div>
        </div>
      </template>

      <template v-else-if="currentTab === 'about'">
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <svg class="b3-list-item__graphic" :class="{ 'ft__error': statusClass.offline }"><use :xlink:href="statusIcon" /></svg>
            <span class="b3-list-item__text">{{ statusTitle }}</span>
            <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="statusDetail">{{ statusDetail }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ t('stateFile') }}</span>
            <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="storageInfo.state_file || '/storage/petal/siyuan-cloud/siyuan-cloud/state.json'">{{ storageInfo.state_file || '/storage/petal/siyuan-cloud/siyuan-cloud/state.json' }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ t('sync') }}</span>
            <span class="b3-list-item__meta">{{ storageSyncLabel }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ storageInfo.source || t('waitingStatus') }}</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="ol-mount-list">
          <div
            v-for="item in verifyStorages"
            :key="item.id || item.mount_path"
            class="ol-mount-row b3-list-item--hide-action"
            role="button"
            tabindex="0"
            @click="openMount(item)"
            @keydown.enter.space.prevent="openMount(item)"
          >
            <div class="ol-mount-row__cover">
              <svg><use xlink:href="#iconDatabase" /></svg>
            </div>
            <div class="ol-mount-row__title ariaLabel" :aria-label="mountPath(item)">{{ mountPath(item) }}</div>
            <DockActionButton list icon="#iconEdit" :label="t('mountEdit')" @run="openEditMount(item)" />
            <DockActionButton list :icon="item.disabled ? '#iconEye' : '#iconEyeoff'" :label="item.disabled ? t('mountEnable') : t('mountDisable')" @run="toggleMount(item)" />
            <DockActionButton list icon="#iconTrashcan" :label="t('mountDelete')" @run="deleteMount(item)" />
            <div v-if="storageDescription(item)" class="ol-mount-row__desc ariaLabel" :aria-label="storageDescription(item)">{{ storageDescription(item) }}</div>
            <div class="ol-mount-tags">
              <span v-for="tag in storageTags(item)" :key="tag.key" class="b3-chip b3-chip--small ariaLabel" :class="tag.className" :aria-label="tag.text">{{ tag.text }}</span>
            </div>
          </div>
          <div v-if="!mountFormOpen" class="ol-mount-row" role="button" tabindex="0" @click="openAddMount" @keydown.enter.space.prevent="openAddMount">
            <div class="ol-mount-row__cover">
              <svg><use xlink:href="#iconAdd" /></svg>
            </div>
            <div class="ol-mount-row__title ariaLabel" :aria-label="t('mountAdd')">{{ t('mountAdd') }}</div>
            <div class="ol-mount-row__desc ariaLabel" :aria-label="t('verifyStorageDriver')">{{ t('verifyStorageDriver') }}</div>
          </div>
          <div v-else class="ol-mount-form">
            <label class="ol-field">
              <span>{{ t('verifyMountPath') }}</span>
              <input v-model="verifyMountPath" class="b3-text-field" type="text">
            </label>
            <label class="ol-field">
              <span>{{ t('verifyStorageDriver') }}</span>
              <select v-model="verifyDriver" class="b3-select">
                <option v-for="driver in driverOptions" :key="driver" :value="driver">{{ driverDisplayName(driver) }}</option>
              </select>
            </label>
            <small v-if="selectedStorageId">{{ t('mountEditing') }} #{{ selectedStorageId }}</small>
            <div v-if="driverInfo" class="ol-driver-note">
              <b>{{ driverDisplayName(driverInfo.config?.name || verifyDriver) }}</b>
              <span>{{ driverNote(driverInfo.config?.name || verifyDriver, driverInfo.config?.note || t('driverMetadataOnly')) }}</span>
            </div>
            <div v-if="driverQrLoginAvailable" class="ol-driver-note">
              <button class="b3-button b3-button--outline" type="button" :disabled="mountCreating || driverVerifyPolling" @click="refreshDriverQrCode">
                {{ driverVerifyPolling ? t('qrPolling') : t('qrRefresh') }}
              </button>
              <span>{{ driverVerifyMessage || t('qrRefreshHelp') }}</span>
              <img v-if="driverVerifyQrSrc" :src="driverVerifyQrSrc" :alt="t('qrScanPrompt')">
            </div>
            <div class="ol-driver-fields">
              <template v-for="row in driverFormRows" :key="row.key">
                <button v-if="row.more" class="b3-list-item b3-list-item--narrow" type="button" @pointerdown.prevent.stop @click.stop="mountMoreOpen = !mountMoreOpen">
                  <span class="b3-list-item__toggle b3-list-item__toggle--hl">
                    <svg class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': mountMoreOpen }"><use xlink:href="#iconRight" /></svg>
                  </span>
                  <span class="b3-list-item__text">{{ t('optionalFields') }}</span>
                </button>
                <label v-else-if="row.field" class="ol-field">
                  <span :title="row.field.name">{{ fieldLabel(row.field) }}{{ row.field.required ? ' *' : '' }}</span>
                  <select v-if="row.field.type === 'select'" v-model="driverForm[row.field.name]" class="b3-select">
                    <option v-for="option in fieldOptions(row.field)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <input v-else-if="row.field.type === 'bool'" v-model="driverForm[row.field.name]" class="b3-switch fn__flex-center" type="checkbox">
                  <input
                    v-else
                    v-model="driverForm[row.field.name]"
                    class="b3-text-field"
                    :type="row.field.type === 'password' ? 'password' : row.field.type === 'number' || row.field.type === 'float' ? 'number' : 'text'"
                    :step="row.field.type === 'float' ? '0.1' : undefined"
                  >
                  <small v-if="fieldHelp(row.field)">{{ fieldHelp(row.field) }}</small>
                </label>
              </template>
              <textarea v-if="mountMoreOpen" v-model="verifyAddition" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('additionJson')" />
            </div>
            <div class="ol-mount-form__actions">
              <button class="b3-button" type="button" :disabled="mountCreating" @click="submitMount">{{ mountCreating ? t('mountCreating') : selectedStorageId ? t('mountUpdate') : t('mountAdd') }}</button>
              <DockActionButton icon="#iconClose" :label="t('cancel')" @run="closeMountForm" />
              <DockActionButton icon="#iconUpload" :label="t('mountExport')" @run="exportAddition" />
              <DockActionButton icon="#iconFile" :label="t('mountImport')" @run="importAddition" />
            </div>
            <small v-if="mountCreateResult" :class="{ 'ft__error': !mountCreateOk }">{{ mountCreateResult }}</small>
          </div>
        </div>
      </template>
    </main>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  onMounted,
  ref,
  type PropType,
} from 'vue'
import { showMessage } from 'siyuan'
import { usePlugin } from '@/main'
import {
  fsList,
  openListAbsoluteUrl,
  resolveOpenListFile,
} from '@/utils/api'
import { useDock } from '@/utils/dock'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import { privateBase } from '@/utils/request'

interface DockAction {
  key: string
  icon: string
  label: string
  run: () => void | Promise<void>
}

interface DockTreeItem {
  name: string
  path: string
  size: number
  is_dir: boolean
}

const DockActionButton = defineComponent({
  emits: ['run'],
  props: {
    active: { type: Boolean, default: false },
    icon: { type: String, required: true },
    label: { type: String, required: true },
    list: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const run = (event: MouseEvent | KeyboardEvent) => {
      event.stopPropagation()
      emit('run')
    }
    return () => h('span', {
      class: props.list
        ? 'b3-list-item__action b3-tooltips b3-tooltips__nw'
        : ['block__icon block__icon--show ariaLabel', { 'block__icon--active': props.active }],
      'aria-label': props.label,
      'data-position': props.list ? undefined : 'north',
      role: 'button',
      tabindex: 0,
      onClick: run,
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ')
          return
        event.preventDefault()
        run(event)
      },
    }, [h('svg', [h('use', { 'xlink:href': props.icon })])])
  },
})

const DockSectionHeader = defineComponent({
  props: {
    actions: { type: Array as PropType<DockAction[]>, default: () => [] },
    icon: { type: String, required: true },
    title: { type: String, required: true },
  },
  setup(props) {
    return () => h('div', { class: 'b3-list-item' }, [
      h('svg', { class: 'b3-list-item__graphic' }, [h('use', { 'xlink:href': props.icon })]),
      h('span', { class: 'b3-list-item__text' }, props.title),
      ...props.actions.map(action =>
        h(DockActionButton, { icon: action.icon, label: action.label, list: true, onRun: action.run }),
      ),
    ])
  },
})

const {
  accountInfo,
  closeMountForm,
  configText,
  copyShare,
  currentTab,
  deleteMount,
  deleteShare,
  driverDisplayName,
  driverFields,
  driverForm,
  driverInfo,
  driverOptions,
  driverNote,
  driverQrLoginAvailable,
  driverVerifyMessage,
  driverVerifyPolling,
  driverVerifyQrSrc,
  exportAddition,
  externalPreviews,
  fieldHelp,
  fieldLabel,
  fieldOptions,
  importAddition,
  mountCreateOk,
  mountCreateResult,
  mountCreating,
  mountFormOpen,
  openAddMount,
  openFileManager,
  openEditMount,
  refreshDriverQrCode,
  selectedStorageId,
  shareDetail,
  shareItems,
  shareTitle,
  sectionActions,
  statusClass,
  statusDetail,
  statusIcon,
  statusTitle,
  storageDescription,
  storageInfo,
  storageSyncLabel,
  storageTags,
  submitMount,
  t,
  tabs,
  toggleMount,
  toggleShare,
  verifyAddition,
  verifyDriver,
  verifyLogin,
  verifyLog,
  verifyMountPath,
  verifyPassword,
  verifySession,
  verifyStorages,
  verifyUsername,
} = useDock(usePlugin())

const pageActionMap: Record<string, keyof typeof sectionActions.value> = {
  about: 'about',
  settings: 'account',
  shares: 'shares',
  tasks: 'tasks',
}

const currentPage = computed(() => tabs.find(tab => tab.key === currentTab.value) || tabs[0])
const currentPageActions = computed(() => {
  if (currentTab.value === 'files')
    return [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: refreshTree },
      { key: 'open', icon: '#iconFolder', label: t('openFileManager'), run: openFileManager },
    ]
  return sectionActions.value[pageActionMap[currentTab.value]] || []
})
const driverFormRows = computed(() => {
  const optional = driverFields.value.filter(field => !field.required)
  return [
    ...driverFields.value.filter(field => field.required).map(field => ({ key: field.name, field })),
    { key: '__more', more: true },
    ...(mountMoreOpen.value ? optional.map(field => ({ key: field.name, field })) : []),
  ]
})

const mountPath = (item: any) => normalizePath(item?.mount_path || item?.path || '/')
const openMount = (item: any) => openFileManager(mountPath(item))

const rootItems = ref<DockTreeItem[]>([])
const childrenByPath = ref<Record<string, DockTreeItem[]>>({})
const expandedPaths = ref<string[]>([])
const mountMoreOpen = ref(false)
const loading = ref(false)
const lastError = ref('')
const emptyText = computed(() => lastError.value || t('rootEmpty'))
const imageExts = new Set('jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(','))
const companionExts = new Set('mp3,wav,aac,m4a,flac,ogg,mp4,m3u8,webm,mov,m4v,mkv,avi,flv,wmv,epub,pdf,mobi,azw3,azw,fb2,cbz,txt'.split(','))
const treeHtml = computed(() => {
  if (loading.value && !rootItems.value.length)
    return '<div class="fn__loading"></div>'
  if (!rootItems.value.length) {
    return `<ul class="b3-list b3-list--background"><li class="b3-list-item">
  <span class="b3-list-item__toggle fn__hidden"></span>
  <span class="b3-list-item__text ft__secondary">${escapeHtml(emptyText.value)}</span>
</li></ul>`
  }
  return rootItems.value
    .map(root => `<ul class="b3-list b3-list--background">${renderNode(root, 0)}</ul>`)
    .join('')
})
const visibleNodes = computed(() => {
  const nodes: DockTreeItem[] = []
  const walk = (items: DockTreeItem[]) => {
    for (const node of items) {
      nodes.push(node)
      if (node.is_dir && expandedPaths.value.includes(node.path))
        walk(childrenByPath.value[node.path] || [])
    }
  }
  walk(rootItems.value)
  return nodes
})
const visibleNodeMap = computed(() => new Map(visibleNodes.value.map(node => [node.path, node])))

function renderNode(node: DockTreeItem, level: number): string {
  const paddingLeft = level * 18
  const iconName = openListFileIconName(node.name, node.is_dir)
  const href = companionHref(node)
  const children = node.is_dir && expandedPaths.value.includes(node.path)
    ? childrenByPath.value[node.path] || []
    : []
  return `<li class="b3-list-item b3-list-item--hide-action" data-type="${level === 0 ? 'navigation-root' : 'navigation-file'}" data-path="${escapeAttr(node.path)}" style="--file-toggle-width:${paddingLeft + 18}px">
  <span style="padding-left:${paddingLeft}px" class="b3-list-item__toggle b3-list-item__toggle--hl${node.is_dir ? '' : ' fn__hidden'}">
    <svg class="b3-list-item__arrow${expandedPaths.value.includes(node.path) ? ' b3-list-item__arrow--open' : ''}"><use xlink:href="#iconRight"></use></svg>
  </span>
  <svg class="b3-list-item__graphic ol-file-row__icon ol-file-row__icon--${iconName}"><use xlink:href="${openListFileIconHref(node.name, node.is_dir)}"></use></svg>
  <span class="b3-list-item__text ariaLabel" data-position="parentE"${href ? ` data-href="${escapeAttr(href)}"` : ''} aria-label="${escapeAttr(node.name)}">${escapeHtml(node.name)}</span>${!node.is_dir && node.size ? `
  <span class="b3-list-item__meta">${formatSize(node.size)}</span>` : ''}
</li>${children.length ? `<ul style="--QYL-indent-1:${paddingLeft + 12}px">${children.map(child => renderNode(child, level + 1)).join('')}</ul>` : ''}`
}

function normalizePath(path: string) {
  const input = path === undefined || path === null || path === '' ? '/' : String(path)
  const slash = input.startsWith('/') ? input : `/${input}`
  const normalized = slash.replace(/\/+/g, '/')
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

function joinPath(dir: string, name: string) {
  return normalizePath(`${normalizePath(dir)}/${String(name || '').replace(/^\/+/, '')}`)
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

const isImageFile = (item: DockTreeItem) => !item.is_dir && imageExts.has(extensionOf(item.name))
const isCompanionFile = (item: DockTreeItem) => !item.is_dir && companionExts.has(extensionOf(item.name))
const docProxyUrl = (path: string) => decodeURI(encodeURI(`${privateBase}/p${path}`)).replace(/#/g, '%23').replace(/\?/g, '%3F')
const companionHref = (item: DockTreeItem) => isCompanionFile(item) ? openListAbsoluteUrl(docProxyUrl(item.path)) : undefined

function toTreeItem(item: any, dir: string): DockTreeItem {
  return {
    name: String(item?.name || ''),
    path: joinPath(dir, String(item?.name || '')),
    size: Number(item?.size || 0),
    is_dir: !!item?.is_dir,
  }
}

function sortItems(items: DockTreeItem[]) {
  return [...items].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
}

async function loadPath(path = '/', refresh = false) {
  const dir = normalizePath(path)
  if (!refresh && dir !== '/' && childrenByPath.value[dir])
    return
  loading.value = true
  lastError.value = ''
  try {
    const payload = await fsList(dir, '', 1, 0, refresh)
    if (payload.code !== 200)
      throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
    const content = sortItems((payload.data?.content || []).map((item: any) => toTreeItem(item, dir)))
    if (dir === '/')
      rootItems.value = content
    else
      childrenByPath.value = { ...childrenByPath.value, [dir]: content }
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    showMessage(lastError.value, 3000, 'error')
  } finally {
    loading.value = false
  }
}

function refreshTree() {
  expandedPaths.value = []
  childrenByPath.value = {}
  loadPath('/', true)
}

async function openNode(node: DockTreeItem) {
  if (!node.is_dir) {
    if (isImageFile(node)) {
      await openImageViewer(node)
      return
    }
    if (!isCompanionFile(node))
      openFileManager(node.path)
    return
  }
  if (expandedPaths.value.includes(node.path)) {
    expandedPaths.value = expandedPaths.value.filter(path => path !== node.path)
    return
  }
  expandedPaths.value = [...expandedPaths.value, node.path]
  await loadPath(node.path)
}

function onTreeClick(event: MouseEvent) {
  const li = (event.target as HTMLElement).closest('li[data-path]') as HTMLElement | null
  const node = li ? visibleNodeMap.value.get(li.dataset.path || '') : null
  if (!node)
    return
  event.stopPropagation()
  openNode(node)
}

async function resolveDownloadUrl(path: string) {
  return (await resolveOpenListFile(path)).url
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

async function openImageViewer(item: DockTreeItem) {
  const siblings = visibleNodes.value.filter(isImageFile)
  const urls = await Promise.all(siblings.map(node => resolveDownloadUrl(node.path)))
  const currentUrl = await resolveDownloadUrl(item.path)
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

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string) {
  return escapeHtml(value)
}

function formatSize(size = 0) {
  if (!size)
    return ''
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

onMounted(() => loadPath('/'))
</script>
