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
const tabApps = new WeakMap<Element, ReturnType<typeof createApp>>()

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function openDock() {
  const dockType = `${plugin.name}cloud`
  const dockButton = document.querySelector(`.dock__item[data-type="${dockType}"]`) as HTMLElement | null
  dockButton?.click()
}

function openFileManager(path = '/') {
  openTab({
    app: plugin.app,
    custom: {
      id: `${plugin.name}file-manager`,
      icon: 'iconFolder',
      title: t('fileManagerTitle'),
      data: {
        path,
      },
    },
    openNewTab: true,
  })
}

onMounted(() => {
  registerOpenListIcons(plugin)

  plugin.addTab({
    type: 'file-manager',
    init(this: any) {
      this.element.innerHTML = ''
      const mount = document.createElement('div')
      mount.className = 'siyuan-cloud-file-tab'
      this.element.appendChild(mount)
      const app = createApp(FileTab, { initialPath: this.data?.path || '/' })
      app.mount(mount)
      tabApps.set(this.element, app)
    },
    destroy(this: any) {
      tabApps.get(this.element)?.unmount()
      tabApps.delete(this.element)
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

  ;(window as any)._siyuan_cloud = {
    openPanel: openDock,
    openDock,
    openFileManager,
  }
})
</script>
