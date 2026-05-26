import {
  Plugin,
  getFrontend,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'

let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
}
const {
  version,
} = PluginInfo
export default class SiyuanCloudPlugin extends Plugin {
  // Run as mobile
  public isMobile: boolean
  // Run in browser
  public isBrowser: boolean
  // Run as local
  public isLocal: boolean
  // Run in Electron
  public isElectron: boolean
  // Run in window
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version
  private openSiyuanUrlHandler?: (event: CustomEvent<{ url: string }>) => void

  async onload() {
    const frontEnd = getFrontend();
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal =
      location.href.includes('127.0.0.1')
      || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')

    try {
      require("@electron/remote")
        .require("@electron/remote/main")
      this.isElectron = true
    } catch (err) {
      this.isElectron = false
    }

    init(this)

    this.openSiyuanUrlHandler = event => this.openSiyuanCloudUrl(event.detail?.url || '')
    this.eventBus.on('open-siyuan-url-plugin', this.openSiyuanUrlHandler as any)
  }

  onunload() {
    if (this.openSiyuanUrlHandler)
      this.eventBus.off('open-siyuan-url-plugin', this.openSiyuanUrlHandler as any)
    destroy()
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
