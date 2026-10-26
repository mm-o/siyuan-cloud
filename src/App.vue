<template>
  <div class="siyuan-cloud-controller" />
</template>

<script setup lang="ts">
import { openTab } from 'siyuan'
import { createApp, onMounted } from 'vue'
import Dock from '@/components/Dock.vue'
import FileTab from '@/components/FileTab.vue'
import PreviewTab from '@/components/PreviewTab.vue'
import { usePlugin } from '@/main'
import { FEISHU_DOCS } from '@/utils/feishuDocs.generated'
import { OPENLIST_APP_ICON_SVG, OPENLIST_ICON_ID_APP, registerOpenListIcons } from '@/utils/icon'
import { privateBase, withOpenListAuthQuery } from '@/utils/request'

const plugin = usePlugin()
let dockApp: ReturnType<typeof createApp> | null = null
let fileTabApp: ReturnType<typeof createApp> | null = null
let fileTabVm: { openPath?: (path: string) => void } | null = null
let pendingFilePath: string | undefined
const previewModuleTabs = new WeakMap<Element, ReturnType<typeof createApp>>()

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function docLang() {
  const siyuanLang = String((window as any).siyuan?.config?.lang || '')
  if (siyuanLang.startsWith('zh'))
    return 'zh_CN'
  return t('openHelp') === '打开说明' ? 'zh_CN' : 'en_US'
}

function openUrl(url?: string) {
  if (url)
    window.open(url, '_blank', 'noopener')
}

function normalizeDriverName(value: string) {
  const driver = String(value || '').trim()
  if (/^alist\s*v3$/i.test(driver))
    return 'AListV3'
  if (/^onedrive$/i.test(driver))
    return 'OneDrive'
  if (/^webdav$/i.test(driver))
    return 'WebDav'
  return driver
}

function loadDocList() {
  const locale = docLang()
  const roots = FEISHU_DOCS.roots[locale]
  const apiHref = withOpenListAuthQuery(new URL(`${privateBase}/api/public/api`, location.href).href)
  window._siyuan_cloud_docs = [
    { key: '/README', icon: '#iconHelp', title: t('openHelp'), desc: t('pluginHelp'), href: roots.readme },
    { key: '/API', icon: '#iconOpen', title: t('openApi'), desc: '/api/public/api', open: () => openPreviewModule('/api/public/api', 'api.json', apiHref) },
    ...FEISHU_DOCS.items[locale],
  ]
}

function openDriverDoc(driver: string) {
  const locale = docLang()
  openUrl(FEISHU_DOCS.driverDocs[normalizeDriverName(driver)]?.[locale] || FEISHU_DOCS.roots[locale].drivers)
}

function openDock() {
  (document.querySelector(`.dock__item[data-type="${plugin.name}cloud"]`) as HTMLElement | null)?.click()
}

function openPendingFilePath() {
  if (!pendingFilePath || !fileTabVm?.openPath)
    return
  const path = pendingFilePath
  pendingFilePath = undefined
  fileTabVm.openPath(path)
}

function openFileManager(path?: string) {
  pendingFilePath = path
  openPendingFilePath()
  openTab({
    app: plugin.app,
    custom: {
      id: `${plugin.name}file-manager`,
      icon: 'iconFolder',
      title: t('fileManagerTitle'),
      data: {
        singleton: true,
      },
    },
    afterOpen: openPendingFilePath,
  })
}

function openPreviewModule(path: string, name = '', url = '') {
  const title = name || path.split('/').pop() || path
  openTab({
    app: plugin.app,
    custom: {
      id: `${plugin.name}preview-module`,
      icon: 'iconFile',
      title,
      data: { name: title, path, url },
    },
  })
}

function openSiyuanDoc(id: string) {
  openTab({
    app: plugin.app,
    doc: {
      id,
      action: ['cb-get-focus', 'cb-get-hl'],
    },
  })
}

onMounted(async () => {
  registerOpenListIcons(plugin)
  loadDocList()

  plugin.addTab({
    type: 'file-manager',
    init(this: { element: Element }) {
      this.element.innerHTML = ''
      const mount = document.createElement('div')
      mount.className = 'siyuan-cloud-file-tab'
      this.element.appendChild(mount)
      fileTabApp = createApp(FileTab)
      fileTabVm = fileTabApp.mount(mount) as { openPath?: (path: string) => void }
      openPendingFilePath()
    },
    destroy() {
      fileTabApp?.unmount()
      fileTabApp = null
      fileTabVm = null
    },
  })

  plugin.addTab({
    type: 'preview-module',
    init(this: { element: Element; data?: { name?: string; path?: string; url?: string } }) {
      this.element.innerHTML = ''
      const mount = document.createElement('div')
      mount.className = 'siyuan-cloud-preview-tab'
      this.element.appendChild(mount)
      const data = this.data || {}
      const app = createApp(PreviewTab, {
        name: String(data.name || data.path || ''),
        path: String(data.path || ''),
        url: String(data.url || ''),
      })
      app.mount(mount)
      previewModuleTabs.set(this.element, app)
    },
    destroy(this: { element: Element }) {
      previewModuleTabs.get(this.element)?.unmount()
      previewModuleTabs.delete(this.element)
      this.element.innerHTML = ''
    },
  })

  plugin.addDock({
    type: 'cloud',
    data: {},
    config: {
      position: 'RightTop',
      size: { width: 360, height: 480 },
      icon: OPENLIST_ICON_ID_APP,
      title: t('addTopBarIcon'),
      hotkey: '',
    },
    init(custom) {
      dockApp?.unmount()
      custom.element.innerHTML = ''
      const mount = document.createElement('div')
      mount.className = 'siyuan-cloud-dock'
      custom.element.appendChild(mount)
      dockApp = createApp(Dock)
      dockApp.mount(mount)
    },
    destroy() {
      dockApp?.unmount()
      dockApp = null
    },
  })

  plugin.addTopBar({
    icon: OPENLIST_APP_ICON_SVG,
    title: t('openFileManager'),
    position: 'right',
    callback: () => openFileManager(),
  })

  window._siyuan_cloud = {
    openPanel: openDock,
    openDriverDoc,
    openDock,
    openFileManager,
    openPreviewModule,
    openSiyuanDoc,
  }
})
</script>
