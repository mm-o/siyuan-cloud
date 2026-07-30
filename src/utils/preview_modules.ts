import type { OpenListResp } from './request'

export interface PreviewModule {
  adapter: 'open-file-viewer' | 'file-viewer'
  key: string
  name: string
  version: string
  categories: PreviewModuleCategory[]
  assets: PreviewModuleAsset[]
}

export interface PreviewModuleCategory {
  key: string
  group?: string
  name: string
  desc: string
  icon: string
  exts: string[]
  plugins: string[]
  defaultEnabled?: boolean
}

export interface PreviewModuleAsset {
  content?: string
  source?: string
  target: string
}

const PREVIEW_MODULE_BASE = 'preview-modules'
const PREVIEW_MODULE_DIR = `/data/public/${PREVIEW_MODULE_BASE}`
const PREVIEW_MODULE_PUBLIC_BASE = `/public/${PREVIEW_MODULE_BASE}`
const PREVIEW_MODULE_SETTINGS_KEY = 'siyuan-cloud-preview-module-categories'
const makeCategories = (defs: Array<[string, string, string, string, string[], string, boolean?, string?]>) =>
  defs.map(([key, name, desc, icon, plugins, exts, defaultEnabled, group]) => ({ key, group, name, desc, icon, plugins, exts: exts.split(' '), defaultEnabled }))

const openFileViewerCategoryDefs: Array<[string, string, string, string, string[], string, boolean?, string?]> = [
  ['pdf-office', 'PDF / Office', 'PDF, Office, eBook, OFD', '#iconOpenListFileTextLine', ['officePlugin', 'pdfPlugin', 'epubPlugin', 'xpsPlugin', 'ofdPlugin'], 'pdf doc docx docm dot dotx dotm rtf odt fodt wps xls xlsx xlsm xlsb xlt xltx xltm ods fods numbers et csv tsv ppt pptx pptm pps ppsx ppsm potx potm odp fodp key dps epub xps oxps ofd'],
  ['image-media', 'Image / Media', 'Images, audio, video', '#iconOpenListImageLine', ['imagePlugin', 'videoPlugin', 'audioPlugin'], 'jpg jpeg jfif pjpe pjpeg png gif webp avif jxl svg bmp ico cur tif tiff apng heic heif mp4 mpg mpeg mpe mpv webm ogv mov m4v avi mkv flv wmv 3gp 3g2 m2ts m3u8 mp3 wav aif aiff aifc ogg oga aac m4a flac opus weba amr mid midi caf au snd wma'],
  ['text-code', 'Text / Code', 'Text, Markdown, source code', '#iconOpenListCode2', ['textPlugin'], 'txt log env gitignore dockerignore npmrc yarnrc pnpmrc editorconfig browserslistrc prettierrc eslintrc stylelintrc conf config properties lock json jsonc json5 ipynb jsonl ndjson xml yaml yml csv tsv md markdown mmd mermaid toml ini proto tf tfvars hcl tex latex bib gv http css scss less js mjs cjs ts tsx jsx html htm vue py java go rs rb swift kt kts scala lua r dart svelte astro elm ex exs clj cljs erl hrl fs fsx hs lhs php c cpp h hpp cs sql sh bash zsh fish ps1 bat cmd dockerfile nginxconf gradle graphql gql pem crt cer ics vcf diff patch sy', true],
  ['engineering', 'Engineering', 'CAD, 3D, GIS, diagrams', '#iconOpenListDraftingCompass', ['cadPlugin', 'model3dPlugin', 'gisPlugin', 'drawingPlugin'], 'dxf dwg dwf step stp iges igs ifc sat sab x_t x_b 3dm skp sldprt sldasm gds gdsii oas oasis gltf glb obj stl fbx dae ply 3mf 3ds usd usda usdc usdz wrl vrml geojson topojson kml kmz gpx shp drawio dio excalidraw tldraw'],
  ['archive-email', 'Archive / Email', 'Archives and mail', '#iconOpenListArchive', ['archivePlugin', 'emailPlugin'], 'zip rar 7z tar gz tgz bz2 xz eml msg mbox'],
  ['assets-data', 'Assets / Data', 'Design assets and data files', '#iconOpenListDatabaseLine', ['assetPlugin'], 'ttf otf woff woff2 eot psd psb ai eps ps webarchive sqlite sqlite3 db wasm parquet avro'],
]
const fileViewerCategoryDefs: Array<[string, string, string, string, string[], string, boolean?, string?]> =
  openFileViewerCategoryDefs.map(([key, name, desc, icon, plugins, exts]) => [`file-viewer-${key}`, name, desc, icon, [], exts, key === 'pdf-office', key])
const openFileViewerCategories = makeCategories(openFileViewerCategoryDefs)
const fileViewerCategories = makeCategories(fileViewerCategoryDefs)

export const PREVIEW_MODULES: PreviewModule[] = [
  {
    adapter: 'open-file-viewer',
    key: 'open-file-viewer',
    name: 'Open File Viewer',
    version: '0.1.32',
    categories: openFileViewerCategories,
    assets: [
      { source: 'https://cdn.jsdelivr.net/npm/@open-file-viewer/core@0.1.32/+esm', target: 'open-file-viewer.js' },
      { source: 'https://cdn.jsdelivr.net/npm/@open-file-viewer/core@0.1.32/dist/style.css', target: 'open-file-viewer.css' },
    ],
  },
  {
    adapter: 'file-viewer',
    key: 'file-viewer-office',
    name: 'Flyfish File Viewer',
    version: '2.2.4',
    categories: fileViewerCategories,
    assets: [
      {
        target: 'file-viewer.js',
        content: `const VERSION = '2.2.4'
const ASSET_BASE = \`https://unpkg.com/@file-viewer/web@\${VERSION}/viewer/\`
let web
let preset

async function loadWeb() {
  if (!web) {
    preset = await import('./file-viewer-preset-all.bundle.js')
    web = await import('./file-viewer-web.bundle.js')
  }
  return web
}

export async function createViewer(options) {
  const { mountViewer } = await loadWeb()
  const controller = mountViewer(options.container, {
    filename: options.fileName,
    name: options.fileName,
    options: preset.mergeFullAssetOptions({
      locale: options.locale,
      theme: options.theme,
    }, ASSET_BASE),
    url: options.file,
  })
  return { destroy: () => controller?.destroy?.() }
}
`,
      },
      { source: 'https://esm.sh/@file-viewer/preset-all@2.2.4/es2022/preset-all.bundle.mjs', target: 'file-viewer-preset-all.bundle.js' },
      { source: 'https://esm.sh/@file-viewer/web@2.2.4/es2022/web.bundle.mjs', target: 'file-viewer-web.bundle.js' },
    ],
  },
]
const DEFAULT_ENABLED_CATEGORY_KEYS = Object.fromEntries(PREVIEW_MODULES.map(module => [
  module.key,
  module.categories.filter(category => category.defaultEnabled).map(category => category.key),
])) as Record<string, string[]>

function previewModuleSettings() {
  if (typeof localStorage === 'undefined')
    return null
  const raw = localStorage.getItem(PREVIEW_MODULE_SETTINGS_KEY)
  if (!raw)
    return null
  try {
    return JSON.parse(raw) || {}
  } catch {
    return null
  }
}

function previewModuleByKey(moduleKey: string) {
  return PREVIEW_MODULES.find(module => module.key === moduleKey) || null
}

function previewModuleCategories(moduleKey: string) {
  return previewModuleByKey(moduleKey)?.categories || []
}

export function previewModuleEnabledCategoryKeys(moduleKey: string) {
  const validCategories = previewModuleCategories(moduleKey)
  const sanitize = (keys: unknown) => Array.isArray(keys) ? keys.filter(key => validCategories.some(category => category.key === key)) : []
  const settings = previewModuleSettings()
  if (!settings)
    return DEFAULT_ENABLED_CATEGORY_KEYS[moduleKey] || []
  return sanitize(settings[moduleKey])
}

export function setPreviewModuleEnabledCategoryKeys(moduleKey: string, keys: string[]) {
  if (typeof localStorage !== 'undefined') {
    const saved = previewModuleSettings() || {}
    localStorage.setItem(PREVIEW_MODULE_SETTINGS_KEY, JSON.stringify({
      ...DEFAULT_ENABLED_CATEGORY_KEYS,
      ...saved,
      [moduleKey]: [...new Set(keys)].filter(key => previewModuleCategories(moduleKey).some(category => category.key === key)),
    }))
  }
}

function previewModuleEnabledCategories(moduleKey: string) {
  const keys = new Set(previewModuleEnabledCategoryKeys(moduleKey))
  return previewModuleCategories(moduleKey).filter(category => keys.has(category.key))
}

function previewModuleCategoryForName(name: string, categories: PreviewModuleCategory[]) {
  const ext = previewModuleExt(name)
  return categories.find(category => category.exts.includes(ext)) || null
}

export function previewModuleForName(name: string) {
  return previewModulesForName(name)[0] || null
}

export function previewModuleForFile(name: string, kind = '') {
  return previewModuleCandidates(name, kind)[0] || null
}

function previewModulesForName(name: string) {
  return PREVIEW_MODULES.filter((module) => {
    const category = previewModuleCategoryForName(name, module.categories)
    return !!category && previewModuleEnabledCategoryKeys(module.key).includes(category.key)
  })
}

function previewModuleCandidates(name: string, kind = '') {
  const modules = previewModulesForName(name)
  return modules.length || kind !== 'text' || !previewModuleEnabledCategoryKeys('open-file-viewer').includes('text-code')
    ? modules
    : PREVIEW_MODULES.filter(module => module.key === 'open-file-viewer')
}

export async function previewModuleForFileReady(name: string, kind = '') {
  for (const module of previewModuleCandidates(name, kind)) {
    if (await previewModuleInstalled(module))
      return module
  }
  return null
}

export function previewModulePluginNames(name: string, moduleKey: string) {
  return [...new Set(previewModuleEnabledCategories(moduleKey)
    .filter(category => previewModuleCategoryForName(name, [category]))
    .flatMap(category => category.plugins))]
}

function previewModuleExt(name: string) {
  const clean = String(name || '').split(/[?#]/, 1)[0].split('/').pop() || ''
  return clean.includes('.') ? clean.split('.').pop()?.toLowerCase() || '' : ''
}

export function previewModuleEntryAsset(module: PreviewModule) {
  return previewModuleAsset(module, '.js')
}

export function previewModuleStyleAsset(module: PreviewModule) {
  return previewModuleAsset(module, '.css')
}

function previewModuleAsset(module: PreviewModule, suffix: string) {
  return module.assets.find(asset => asset.target.endsWith(suffix)) || null
}

export function previewModuleAssetInstallPath(asset: PreviewModuleAsset) {
  return `${PREVIEW_MODULE_DIR}/${asset.target}`
}

export function previewModuleAssetPublicUrl(asset: PreviewModuleAsset) {
  return `${PREVIEW_MODULE_PUBLIC_BASE}/${asset.target}`
}

export function previewModulePublicUrl(module: PreviewModule) {
  const entry = previewModuleEntryAsset(module) || module.assets[0]
  return entry ? previewModuleAssetPublicUrl(entry) : ''
}

async function previewModuleInstalled(module: PreviewModule) {
  const assets = await previewModuleInstalledAssets()
  return previewModuleInstalledWithAssets(module, assets)
}

export async function previewModuleInstalledMap() {
  const assets = await previewModuleInstalledAssets()
  return Object.fromEntries(PREVIEW_MODULES.map(module => [module.key, previewModuleInstalledWithAssets(module, assets)])) as Record<string, boolean>
}

function previewModuleInstalledWithAssets(module: PreviewModule, assets: Set<string> | null) {
  return !!assets && module.assets.every(asset => assets.has(asset.target))
}

async function previewModuleInstalledAssets() {
  const response = await fetch('/api/file/readDir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: PREVIEW_MODULE_DIR }),
  }).catch(() => null)
  if (!response?.ok)
    return null
  const payload = await response.json().catch(() => null)
  if (payload?.code !== 0 || !Array.isArray(payload?.data))
    return null
  return new Set(payload.data
    .filter((item: any) => item?.name)
    .map((item: any) => String(item.name)))
}

export async function installPreviewModule(module: PreviewModule): Promise<OpenListResp> {
  try {
    for (const asset of module.assets)
      await installPreviewModuleAsset(asset)
    return { code: 200, message: 'success', data: { url: previewModulePublicUrl(module) } }
  } catch (error) {
    return { code: -1, message: error instanceof Error ? error.message : String(error), data: null }
  }
}

async function installPreviewModuleAsset(asset: PreviewModuleAsset) {
  const form = new FormData()
  form.append('path', previewModuleAssetInstallPath(asset))
  const file = asset.content
    ? new Blob([asset.content], { type: 'text/javascript;charset=utf-8' })
    : await previewModuleAssetBlob(asset)
  form.append('file', file, asset.target)
  const saved = await fetch('/api/file/putFile', {
    method: 'POST',
    body: form,
  })
  const payload = await saved.json().catch(() => null)
  if (!saved.ok || payload?.code !== 0)
    throw new Error(payload?.msg || payload?.message || `${asset.target}: HTTP ${saved.status}`)
}

async function previewModuleAssetBlob(asset: PreviewModuleAsset) {
  if (!asset.source)
    throw new Error(`${asset.target}: missing source`)
  const response = await fetch(asset.source)
  if (!response.ok)
    throw new Error(`${asset.source}: HTTP ${response.status}`)
  return asset.target.endsWith('.js')
    ? new Blob([rewritePreviewModuleScript(await response.text())], { type: 'text/javascript;charset=utf-8' })
    : await response.blob()
}

export function rewritePreviewModuleScript(code: string) {
  return code
    .replaceAll(/(["'])\/npm\//g, '$1https://cdn.jsdelivr.net/npm/')
    .replaceAll(/(["'])\/node\//g, '$1https://esm.sh/node/')
    .replaceAll(/(["'])\/(@file-viewer\/[^"']+)/g, '$1https://esm.sh/$2')
}
