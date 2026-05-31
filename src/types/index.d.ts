interface Window {
  _siyuan_cloud?: {
    openPanel?: () => void
    openDock?: () => void
    openFileManager?: (path?: string) => void
  }
  Viewer?: any
  siyuan: {
    viewer?: any
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}
