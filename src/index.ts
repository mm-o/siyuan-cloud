import type { Protyle } from 'siyuan'
import { Plugin, showMessage } from 'siyuan'
import { destroy, init } from '@/main'
import { openListDocumentLink } from '@/utils/file_actions'
import {
  openFilePicker,
  registerFileListBlock,
} from '@/utils/file_block'
import PluginInfoString from '../plugin.json'
import '@/index.scss'

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'
const {
  version,
} = PluginInfoString

interface OpenSiyuanUrlEventBus {
  on(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
  off(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
}

const slashRangeFromText = (range: Range) => {
  if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
    const beforeCursor = range.startContainer.textContent?.slice(0, range.startOffset) || ''
    const slashIndex = beforeCursor.lastIndexOf('/')
    if (slashIndex >= 0) {
      const slashRange = range.cloneRange()
      slashRange.setStart(range.startContainer, slashIndex)
      return slashRange
    }
  }
  return range.cloneRange()
}

const deleteSlashTrigger = (protyle: Protyle) => {
  const selection = window.getSelection()
  const currentRange = protyle.protyle?.toolbar?.range || (selection?.rangeCount ? selection.getRangeAt(0) : undefined)
  if (!currentRange)
    return
  const range = slashRangeFromText(currentRange)
  range.deleteContents()
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  if (protyle.protyle?.toolbar)
    protyle.protyle.toolbar.range = range.cloneRange()
}

export default class SiyuanCloudPlugin extends Plugin {
  public readonly version = version
  private openSiyuanUrlHandler?: (event: CustomEvent<{ url: string }>) => void
  private destroyFileListBlock?: () => void
  private closeFilePicker?: () => void

  async onload() {
    this.destroyFileListBlock = registerFileListBlock(this)
    init(this)

    this.protyleSlash.push({
      filter: [
        '思盘',
        '思盘文件列表',
        '网盘文件列表',
        'siyuan cloud',
        'cloud drive',
        '云盘',
        'sipan',
        'sp',
        'file list',
        'directory list',
      ],
      html: '<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconCloud"></use></svg><span class="b3-list-item__text">思盘</span></div>',
      id: 'siyuanCloudPicker',
      callback: (protyle) => {
        deleteSlashTrigger(protyle)
        const targetElement = protyle.protyle?.hint?.element
        if (!targetElement) {
          window._siyuan_cloud?.openFileManager?.('/')
          return
        }
        this.closeFilePicker?.()
        this.closeFilePicker = openFilePicker(this, {
          targetElement,
          onClose: () => {
            this.closeFilePicker = undefined
          },
          onSelect: (item, event) => {
            const insertList = item.is_dir && !event.shiftKey
            const markdown = openListDocumentLink({
              item: { ...item, name: item.name.replace(/[\r\n]/g, ' ') },
              path: item.path,
            })
            const lute = protyle.protyle?.lute
            const html = insertList
              ? lute?.Md2BlockDOM?.(`;;;${encodeURIComponent(this.name)}/file-list\n${markdown}\n;;;`)
              : lute?.SpinBlockDOM?.(markdown) ?? markdown
            if (html)
              protyle.insert(html, insertList, true)
            else
              showMessage(String(this.i18n.fileListInsertFailed), 3000, 'error')
          },
        })
      },
    })

    this.openSiyuanUrlHandler = event => this.openSiyuanCloudUrl(event.detail?.url || '')
    this.siyuanUrlEventBus().on('open-siyuan-url-plugin', this.openSiyuanUrlHandler)
  }

  onunload() {
    this.closeFilePicker?.()
    this.destroyFileListBlock?.()
    this.destroyFileListBlock = undefined
    if (this.openSiyuanUrlHandler)
      this.siyuanUrlEventBus().off('open-siyuan-url-plugin', this.openSiyuanUrlHandler)
    destroy()
  }

  async uninstall() {
    await this.removeData(DOCK_SETTINGS)
  }

  openSetting() {
    window._siyuan_cloud?.openPanel?.()
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
    window._siyuan_cloud?.openFileManager?.(path)
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
