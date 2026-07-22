<template>
  <div class="siyuan-cloud-controller" />
</template>

<script setup lang="ts">
import { openTab } from 'siyuan'
import { createApp, onMounted } from 'vue'
import Dock from '@/components/Dock.vue'
import FileTab from '@/components/FileTab.vue'
import TreePicker from '@/components/TreePicker.vue'
import { usePlugin } from '@/main'
import { FEISHU_DOCS } from '@/utils/feishuDocs.generated'
import { OPENLIST_APP_ICON_SVG, OPENLIST_ICON_ID_APP, registerOpenListIcons } from '@/utils/icon'

const plugin = usePlugin()
let dockApp: ReturnType<typeof createApp> | null = null
let fileTabApp: ReturnType<typeof createApp> | null = null
let fileTabVm: { openPath?: (path: string) => void } | null = null
let pendingFilePath: string | undefined
let pickerApp: ReturnType<typeof createApp> | null = null
let pickerElement: HTMLElement | null = null

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
  window._siyuan_cloud_docs = [
    { key: '/README', icon: '#iconHelp', title: t('openHelp'), desc: t('pluginHelp'), href: roots.readme },
    { key: '/API', icon: '#iconOpen', title: t('openApi'), desc: roots.api, href: roots.api },
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

function closePicker() {
  pickerApp?.unmount()
  pickerApp = null
  if (pickerElement) {
    pickerElement.innerHTML = ''
    pickerElement.classList.add('fn__none')
  }
  pickerElement = null
  document.removeEventListener('mousedown', closePickerByOutside)
}

function closePickerByOutside(event: MouseEvent) {
  if (pickerElement?.contains(event.target as Node))
    return
  closePicker()
}

function openPicker(options: {
  targetElement: HTMLElement
  onSelect: (item: { name: string; path: string; is_dir?: boolean }) => void
}) {
  closePicker()
  pickerElement = options.targetElement
  const left = parseFloat(pickerElement.style.left || '0')
  const top = parseFloat(pickerElement.style.top || '0')
  const fit = () => {
    if (!pickerElement)
      return
    const minTop = document.getElementById('sidebar') ? 0 : (document.getElementById('toolbar')?.clientHeight || document.querySelector<HTMLElement>('.layout-tab-bar')?.clientHeight || 0)
    pickerElement.style.left = `${left}px`
    pickerElement.style.top = `${top}px`
    let rect = pickerElement.getBoundingClientRect()
    if (rect.top < minTop) {
      pickerElement.style.top = `${minTop}px`
    } else if (rect.bottom > window.innerHeight) {
      const above = top - rect.height - 30
      pickerElement.style.top = above > minTop && above + rect.height < window.innerHeight
        ? `${above}px`
        : `${Math.max(minTop, window.innerHeight - rect.height)}px`
    }
    rect = pickerElement.getBoundingClientRect()
    if (rect.right > window.innerWidth)
      pickerElement.style.left = `${window.innerWidth - rect.width}px`
    else if (rect.left < 0)
      pickerElement.style.left = '0'
  }
  pickerElement.innerHTML = ''
  pickerElement.classList.remove('fn__none')
  pickerApp = createApp(TreePicker, {
    onLayout: () => requestAnimationFrame(fit),
    onSelect: (item: { name: string; path: string; is_dir?: boolean }) => {
      options.onSelect(item)
      closePicker()
    },
  })
  pickerApp.mount(pickerElement)
  requestAnimationFrame(fit)
  window.setTimeout(() => document.addEventListener('mousedown', closePickerByOutside), 0)
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
      closePicker()
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
    openPicker,
  }
})
</script>
