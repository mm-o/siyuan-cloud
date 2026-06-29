<template>
  <div class="siyuan-cloud-controller" />
</template>

<script setup lang="ts">
import { openTab } from 'siyuan'
import { createApp, onMounted } from 'vue'
import Dock from '@/components/Dock.vue'
import FileTab from '@/components/FileTab.vue'
import { usePlugin } from '@/main'
import { createDocs } from '@/utils/docs'
import { OPENLIST_APP_ICON_SVG, OPENLIST_ICON_ID_APP, registerOpenListIcons } from '@/utils/icon'

const plugin = usePlugin()
let dockApp: ReturnType<typeof createApp> | null = null
let fileTabApp: ReturnType<typeof createApp> | null = null
let fileTabVm: { openPath?: (path: string) => void } | null = null
let pendingFilePath: string | undefined

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

const docs = createDocs(plugin, t)

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

onMounted(async () => {
  registerOpenListIcons(plugin)
  await docs.loadDocList()

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
    openApiDoc: docs.openApiDoc,
    openReadmeDoc: docs.openReadmeDoc,
    openPackagedDoc: docs.openPackagedDoc,
    openDock,
    openFileManager,
  }
})
</script>
