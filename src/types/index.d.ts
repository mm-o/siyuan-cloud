interface Window {
  _siyuan_cloud?: {
    openPanel?: () => void
    openDriverDoc?: (driver: string) => void
    openDock?: () => void
    openFileManager?: (path?: string) => void
    openPicker?: (options: {
      targetElement: HTMLElement
      onSelect: (item: { name: string, path: string, is_dir?: boolean }) => void
    }) => void
  }
  _siyuan_cloud_docs?: Array<{ key: string, icon: string, title: string, desc: string, href: string }>
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
