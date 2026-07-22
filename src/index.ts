import { Plugin, showMessage } from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'
import { openListDocumentLink } from '@/utils/file_actions'

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'
const {
  version,
} = PluginInfoString

interface SiyuanCloudBridge {
  openPanel?: () => void
  openDock?: () => void
  openFileManager?: (path?: string) => void
  openPicker?: (options: {
    targetElement: HTMLElement
    onSelect: (item: { name: string, path: string, is_dir?: boolean, raw_url?: string, url?: string }) => void
  }) => void
}

interface OpenSiyuanUrlEventBus {
  on(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
  off(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
}

interface ProtyleSlashInstance {
  protyle?: {
    hint?: {
      element?: HTMLElement
    }
    toolbar?: {
      range?: Range
    }
    lute?: {
      SpinBlockDOM?: (html: string) => string
    }
  }
  insert: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void
}

const cloudBridge = () => window._siyuan_cloud as SiyuanCloudBridge | undefined

const pickerLinkMarkdown = (item: { name: string, path: string, is_dir?: boolean, raw_url?: string, url?: string }) =>
  openListDocumentLink({ item, path: item.path })

const slashRangeFromText = (range: Range) => {
  if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer as Text
    const beforeCursor = textNode.textContent?.slice(0, range.startOffset) || ''
    const slashIndex = beforeCursor.lastIndexOf('/')
    if (slashIndex >= 0) {
      const slashRange = range.cloneRange()
      slashRange.setStart(textNode, slashIndex)
      return slashRange
    }
  }
  return range.cloneRange()
}

const deleteSlashTrigger = (protyle: ProtyleSlashInstance) => {
  const selection = window.getSelection()
  const currentRange = protyle.protyle?.toolbar?.range || (selection?.rangeCount ? selection.getRangeAt(0) : undefined)
  if (!currentRange)
    return undefined
  const range = slashRangeFromText(currentRange)
  range.deleteContents()
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  if (protyle.protyle?.toolbar)
    protyle.protyle.toolbar.range = range.cloneRange()
  return range
}

export default class SiyuanCloudPlugin extends Plugin {
  public readonly version = version
  private openSiyuanUrlHandler?: (event: CustomEvent<{ url: string }>) => void

  async onload() {
    init(this)

    this.protyleSlash.push({
      filter: ['思盘', 'siyuan cloud', 'cloud drive', '云盘', 'sipan', 'sp'],
      html: '<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconCloud"></use></svg><span class="b3-list-item__text">思盘</span></div>',
      id: 'siyuanCloudPicker',
      callback: (protyle) => {
        deleteSlashTrigger(protyle as ProtyleSlashInstance)
        const bridge = cloudBridge()
        if (!bridge?.openPicker) {
          bridge?.openFileManager?.('/')
          showMessage('请先启用或更新思盘插件')
          return
        }
        const targetElement = protyle.protyle?.hint?.element
        if (!targetElement) {
          bridge.openFileManager?.('/')
          return
        }
        bridge.openPicker({
          targetElement,
          onSelect: (item) => {
            const markdown = pickerLinkMarkdown(item)
            const lute = protyle.protyle?.lute
            const html = lute?.SpinBlockDOM ? lute.SpinBlockDOM(markdown) : markdown
            protyle.insert(html, false, true)
          },
        })
      },
    })

    this.openSiyuanUrlHandler = event => this.openSiyuanCloudUrl(event.detail?.url || '')
    this.siyuanUrlEventBus().on('open-siyuan-url-plugin', this.openSiyuanUrlHandler)
  }

  onunload() {
    if (this.openSiyuanUrlHandler)
      this.siyuanUrlEventBus().off('open-siyuan-url-plugin', this.openSiyuanUrlHandler)
    destroy()
  }

  async uninstall() {
    await this.removeData(DOCK_SETTINGS)
  }

  openSetting() {
    cloudBridge()?.openPanel?.()
  }

  private async openSiyuanCloudUrl(url: string) {
    const urlObj = safeUrl(url)
    if (urlObj.protocol !== 'siyuan:' || urlObj.hostname !== 'plugins')
      return
    const pluginName = urlObj.pathname.split('/').filter(Boolean)[0]
    if (pluginName !== this.name || !urlObj.pathname.endsWith('/open'))
      return

    const path = urlObj.searchParams.get('path') || ''
    if (!path)
      return
    cloudBridge()?.openFileManager?.(path)
  }

  private siyuanUrlEventBus() {
    return this.eventBus as unknown as OpenSiyuanUrlEventBus
  }
}

function safeUrl(url: string) {
  try {
    return new URL(url)
  } catch {
    return new URL('about:blank')
  }
}
