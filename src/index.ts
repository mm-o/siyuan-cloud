import { Plugin } from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'
const {
  version,
} = PluginInfoString

interface SiyuanCloudBridge {
  openPanel?: () => void
  openDock?: () => void
  openFileManager?: (path?: string) => void
}

interface OpenSiyuanUrlEventBus {
  on(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
  off(type: 'open-siyuan-url-plugin', listener: (event: CustomEvent<{ url: string }>) => void): void
}

const cloudBridge = () => window._siyuan_cloud as SiyuanCloudBridge | undefined

export default class SiyuanCloudPlugin extends Plugin {
  public readonly version = version
  private openSiyuanUrlHandler?: (event: CustomEvent<{ url: string }>) => void

  async onload() {
    init(this)

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
