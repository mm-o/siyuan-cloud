import { Plugin } from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'

let plugin: Plugin | null = null
export function usePlugin(pluginProps?: Plugin): Plugin {
  if (pluginProps) {
    plugin = pluginProps
  }
  if (!plugin && !pluginProps) {
    throw new Error('Siyuan Cloud plugin is not bound')
  }
  return plugin!
}

let app: ReturnType<typeof createApp> | null = null
let container: HTMLDivElement | null = null
export function init(plugin: Plugin) {
  usePlugin(plugin)

  container = document.createElement('div')
  container.className = 'siyuan-cloud-app'
  container.id = `${plugin.name}-app`
  app = createApp(App)
  app.mount(container)
  document.body.appendChild(container)
}

export function destroy() {
  app?.unmount()
  app = null
  container?.remove()
  container = null
}
