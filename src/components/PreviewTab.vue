<template>
  <div class="ol-preview-module fn__flex-column">
    <div v-if="loading" class="ol-preview-module__state">
      <div class="ol-loading" />
    </div>
    <pre v-else-if="error" class="ol-preview-module__error">{{ error }}</pre>
    <div v-show="!loading && !error" ref="viewerRef" class="ol-preview-module__viewer" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { resolveOpenListFile } from '@/utils/api'
import { usePlugin } from '@/main'
import {
  previewModuleAssetPublicUrl,
  previewModuleEntryAsset,
  previewModuleForName,
  previewModuleForFileReady,
  previewModulePluginNames,
  previewModuleStyleAsset,
  type PreviewModule,
} from '@/utils/preview_modules'

const props = defineProps<{
  name: string
  path: string
  url?: string
}>()

const plugin = usePlugin()
const error = ref('')
const loading = ref(true)
const viewerRef = ref<HTMLElement>()
let viewer: { destroy?: () => void } | null = null

async function load() {
  loading.value = true
  error.value = ''
  viewer?.destroy?.()
  viewer = null
  try {
    const previewName = props.name || props.path
    const readyModule = await previewModuleForFileReady(previewName)
    const moduleInfo = readyModule || previewModuleForName(previewName)
    if (!moduleInfo)
      throw new Error(t('previewModuleUnsupported', 'No preview module for this file.'))
    if (!readyModule)
      throw new Error(t('previewModuleMissing', 'Not installed'))
    loadModuleStyle(moduleInfo)
    const script = previewModuleEntryAsset(moduleInfo)
    if (!script)
      throw new Error(t('previewModuleUnsupported', 'No preview module for this file.'))
    const entry = await import(/* @vite-ignore */ previewModuleAssetPublicUrl(script))
    const { createViewer } = entry
    if (typeof createViewer !== 'function')
      throw new Error('open-file-viewer createViewer export is missing')
    const plugins = previewPlugins(moduleInfo, entry, previewName)
    const file = props.url ? { url: props.url } : await resolveOpenListFile(props.path)
    const viewerOptions: Record<string, any> = {
      container: viewerRef.value,
      file: file.url,
      fileName: props.name || props.path.split('/').pop() || props.path,
      locale: previewLocale(),
      theme: previewTheme(),
    }
    if (moduleInfo.adapter === 'open-file-viewer') {
      viewerOptions.height = '100%'
      viewerOptions.plugins = plugins
      viewerOptions.toolbar = true
      viewerOptions.width = '100%'
    }
    viewer = createViewer(viewerOptions)
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    loading.value = false
  }
}

function previewPlugins(moduleInfo: PreviewModule, entry: Record<string, any>, previewName: string) {
  if (moduleInfo.adapter !== 'open-file-viewer')
    return []
  const plugins = previewModulePluginNames(previewName, moduleInfo.key)
    .map(name => typeof entry[name] === 'function' ? entry[name]() : null)
    .filter(Boolean)
  if (!plugins.length)
    throw new Error(t('previewModuleUnsupported', 'No preview module for this file.'))
  return plugins
}

function t(key: string, fallback: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] ?? fallback)
}

function previewLocale() {
  return String((window as any).siyuan?.config?.lang || '').startsWith('zh') ? 'zh-CN' : 'en-US'
}

function previewTheme() {
  const mode = (window as any).siyuan?.config?.appearance?.mode
  if (mode === 0)
    return 'light'
  if (mode === 1)
    return 'dark'
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadModuleStyle(moduleInfo: PreviewModule) {
  const style = previewModuleStyleAsset(moduleInfo)
  if (!style)
    return
  const id = `siyuan-cloud-preview-module-style-${moduleInfo.key}`
  if (document.getElementById(id))
    return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = previewModuleAssetPublicUrl(style)
  document.head.appendChild(link)
}

onMounted(load)
onBeforeUnmount(() => {
  viewer?.destroy?.()
  viewer = null
})
</script>
