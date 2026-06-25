<template>
  <div class="siyuan-cloud-controller" />
</template>

<script setup lang="ts">
import { openTab } from 'siyuan'
import { createApp, onMounted } from 'vue'
import Dock from '@/components/Dock.vue'
import FileTab from '@/components/FileTab.vue'
import { usePlugin } from '@/main'
import { OPENLIST_APP_ICON_SVG, OPENLIST_ICON_ID_APP, registerOpenListIcons } from '@/utils/icon'

const plugin = usePlugin()
let dockApp: ReturnType<typeof createApp> | null = null
let dockMount: HTMLDivElement | null = null
let fileTabApp: ReturnType<typeof createApp> | null = null
let fileTabVm: { openPath?: (path: string) => void } | null = null
let pendingFilePath: string | undefined

interface FileTabContext {
  element: Element
}

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function openDock() {
  const dockType = `${plugin.name}cloud`
  const dockButton = document.querySelector(`.dock__item[data-type="${dockType}"]`) as HTMLElement | null
  dockButton?.click()
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

onMounted(() => {
  registerOpenListIcons(plugin)

  plugin.addTab({
    type: 'file-manager',
    init(this: FileTabContext) {
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
      dockMount?.remove()
      dockApp?.unmount()
      dockMount = document.createElement('div')
      dockMount.className = 'siyuan-cloud-dock'
      custom.element.appendChild(dockMount)
      dockApp = createApp(Dock)
      dockApp.mount(dockMount)
    },
    destroy() {
      dockApp?.unmount()
      dockApp = null
      dockMount?.remove()
      dockMount = null
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
    openDock,
    openFileManager,
  }
})
</script>
