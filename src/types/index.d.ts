interface Window {
  _siyuan_cloud?: {
    openPanel?: () => void
    openApiDoc?: () => void
    openDriverDoc?: (driver: string) => void
    openReadmeDoc?: () => void
    openPackagedDoc?: (key: string) => void
    openDock?: () => void
    openFileManager?: (path?: string) => void
  }
  _siyuan_cloud_docs?: Array<{ key: string, icon: string, title: string, desc: string }>
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
