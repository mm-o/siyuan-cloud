import { Plugin } from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'
const {
  version,
} = PluginInfoString
export default class SiyuanCloudPlugin extends Plugin {
  public readonly version = version
  private openSiyuanUrlHandler?: (event: CustomEvent<{ url: string }>) => void

  async onload() {
    init(this)

    this.openSiyuanUrlHandler = event => this.openSiyuanCloudUrl(event.detail?.url || '')
    this.eventBus.on('open-siyuan-url-plugin', this.openSiyuanUrlHandler as any)
  }

  onunload() {
    if (this.openSiyuanUrlHandler)
      this.eventBus.off('open-siyuan-url-plugin', this.openSiyuanUrlHandler as any)
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
}

function safeUrl(url: string) {
  try {
    return new URL(url)
  } catch {
    return new URL('about:blank')
  }
}
