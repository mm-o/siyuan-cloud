import { fetchSyncPost, openTab } from 'siyuan'
import { fetchOpenListJson } from '@/utils/request'

const DRIVER_DOC_GROUPS = [
  { drivers: ['OpenList', 'AListV3', 'AList V3'], en: 'OpenList Compatible', zh: 'OpenList 兼容挂载' },
  { drivers: ['S3'], en: 'S3 Compatible', zh: 'S3 兼容存储' },
  { drivers: ['Doge'], en: 'DogeCloud', zh: 'DogeCloud 挂载' },
  { drivers: ['115 Cloud'], en: '115 Cloud', zh: '115 Cloud 挂载' },
  { drivers: ['115 Open'], en: '115 Open', zh: '115 Open 挂载' },
  { drivers: ['115 Share'], en: '115 Share', zh: '115 Share 挂载' },
  { drivers: ['123Pan'], en: '123Pan', zh: '123Pan 挂载' },
  { drivers: ['189Cloud', '189CloudPC', '189CloudTV'], en: '189Cloud Series', zh: '189Cloud 系列' },
  { drivers: ['AliyundriveOpen'], en: 'Aliyundrive Open', zh: '阿里云盘开放平台' },
  { drivers: ['BaiduNetdisk'], en: 'Baidu Netdisk', zh: '百度网盘挂载' },
  { drivers: ['Onedrive', 'OneDrive'], en: 'OneDrive', zh: 'OneDrive 挂载' },
  { drivers: ['Quark', 'UC', 'QuarkOpen', 'QuarkTV', 'UCTV'], en: 'Quark UC Series', zh: 'Quark UC 系列' },
  { drivers: ['WPS'], en: 'WPS', zh: 'WPS 云文档' },
  { drivers: ['Local'], en: 'Local Storage', zh: 'Local 本地存储' },
  { drivers: ['SiYuanWorkspace'], en: 'SiYuan Workspace', zh: '思源工作空间' },
  { drivers: ['WebDav'], en: 'WebDAV', zh: 'WebDAV 挂载' },
]

const DRIVER_DOCS = Object.fromEntries(
  DRIVER_DOC_GROUPS.flatMap(group => group.drivers.map(driver => [normalizeDriverName(driver), group])),
)

function normalizeDriverName(value: string) {
  const driver = String(value || '').trim()
  if (/^alist\s*v3$/i.test(driver))
    return 'AListV3'
  if (/^onedrive$/i.test(driver))
    return 'OneDrive'
  if (/^webdav$/i.test(driver))
    return 'WebDav'
  return driver
}

export function createDocs(plugin: any, t: (key: string) => string) {
  const lang = () => t('openHelp') === '打开说明' ? 'zh_CN' : 'en_US'
  const notebookName = () => lang() === 'zh_CN' ? '思盘文档' : 'Siyuan Cloud Docs'
  const driverDocRoot = () => lang() === 'zh_CN' ? '驱动说明' : 'Drivers'
  const asset = (path: string) => `/plugins/${plugin.name}/${path.replace(/^\/+/, '')}`
  const docPath = (file: string) => `/${file.replace(`${lang()}/`, '').replace(/\.md$/, '')}`
  const docTitle = (path: string) => path.split('/').pop() || ''
  const docParent = (path: string) => path.split('/')[1] || ''
  const docRef = (id: string, title: string) => `((${id} '${title}'))`
  const docIndex = (title: string, refs: string[]) => [`# ${title}`, '', ...refs.map(ref => `- ${ref}`), ''].join('\n')
  const replaceDocRefs = (markdown: string, refs: Map<string, string>) => {
    for (const [title, ref] of refs)
      markdown = markdown.split(`[[${title}]]`).join(ref)
    return markdown
  }

  async function fetchText(url: string, fallback = '') {
    const response = await fetch(url)
    return response.ok ? response.text() : fallback
  }

  async function siyuanData<T = any>(url: string, body: unknown = {}) {
    const payload = await fetchSyncPost(url, body)
    if (payload.code)
      throw new Error(payload.msg || payload.message || `SiYuan code ${payload.code}`)
    return payload.data as T
  }

  async function writeDoc(path: string, markdown: string, open = false) {
    const name = notebookName()
    const notebooks = (await siyuanData<{ notebooks: any[] }>('/api/notebook/lsNotebooks')).notebooks || []
    const notebook = notebooks.find(item => item.name === name) || (await siyuanData<{ notebook: any }>('/api/notebook/createNotebook', { name })).notebook
    if (notebook.closed)
      await siyuanData('/api/notebook/openNotebook', { notebook: notebook.id })
    let [id] = await siyuanData<string[]>('/api/filetree/getIDsByHPath', { path, notebook: notebook.id })
    if (id)
      await siyuanData('/api/block/updateBlock', { id, dataType: 'markdown', data: markdown })
    else
      id = await siyuanData('/api/filetree/createDocWithMd', { notebook: notebook.id, path, markdown })
    if (open) {
      openTab({ app: plugin.app, doc: { id } })
      await fetchSyncPost('/api/notification/pushErrMsg', { msg: t('docEditWarning'), timeout: 7000 })
    }
    return id
  }

  async function docFiles() {
    return (await (await fetch(asset('assets/docs/index.json'))).json() as string[]).filter(file => file.startsWith(`${lang()}/`))
  }

  async function apiDoc() {
    const { data = {} } = await fetchOpenListJson('/api/public/api')
    const zh = lang() === 'zh_CN'
    const endpoints = Object.entries(data.endpoints || {}).map(([key, value]) => `- \`${key}\`: \`${value}\``)
    const capabilities = (data.capabilities || []).map((item: string) => `- \`${item}\``)
    const routes = (data.routes || []).map((route: any) => `- \`${route.method || 'ANY'} ${route.path || ''}\``)
    return [
      `# ${data.name || '思盘'} API`,
      '',
      zh ? '- 私有路由，不是公网 OpenList 服务。' : '- Private route, not a public OpenList server.',
      `- ${zh ? '响应' : 'Response'}: \`{ "code": 200, "message": "success", "data": ... }\``,
      `- ${zh ? '版本' : 'Version'}: \`${data.version || 'unknown'}\``,
      `- Base URL: \`${data.base_url || '/plugin/private/siyuan-cloud'}\``,
      `- API Base: \`${data.api_base || '/plugin/private/siyuan-cloud/api'}\``,
      '',
      `## ${zh ? '端点' : 'Endpoints'}`,
      '',
      ...(endpoints.length ? endpoints : ['- `/plugin/private/siyuan-cloud/api`']),
      '',
      `## ${zh ? '能力' : 'Capabilities'}`,
      '',
      ...capabilities,
      '',
      `## ${zh ? '路由' : 'Routes'}`,
      '',
      ...routes,
      '',
    ].join('\n')
  }

  async function syncDocs() {
    const refs = new Map<string, string>()
    const groups = new Map<string, string[]>()
    const docs: Array<{ path: string; markdown: string }> = []
    const files = await docFiles()
    for (const parent of new Set(files.map(file => docPath(file)).filter(path => path.split('/').length > 2).map(docParent)))
      await writeDoc(`/${parent}`, `# ${parent}\n`)
    for (const file of files) {
      const path = docPath(file)
      const title = docTitle(path)
      const markdown = await fetchText(asset(`assets/docs/${file}`), `# ${title}\n`)
      const ref = docRef(await writeDoc(path, markdown), title)
      refs.set(title, ref)
      docs.push({ path, markdown })
      if (path.split('/').length > 2) {
        const parent = docParent(path)
        groups.set(parent, [...(groups.get(parent) || []), ref])
      }
    }
    for (const [title, items] of groups)
      refs.set(title, docRef(await writeDoc(`/${title}`, docIndex(title, items)), title))
    refs.set('API', docRef(await writeDoc('/API', await apiDoc()), 'API'))
    for (const item of docs)
      await writeDoc(item.path, replaceDocRefs(item.markdown, refs))
    return { refs, groups }
  }

  async function openApiDoc() {
    await writeDoc('/API', await apiDoc(), true)
  }

  async function openReadmeDoc() {
    const { refs } = await syncDocs()
    let markdown = await fetchText(asset(lang() === 'zh_CN' ? 'README_zh_CN.md' : 'README.md'), '# README\n')
    await writeDoc('/README', replaceDocRefs(markdown, refs), true)
  }

  async function loadDocList() {
    const roots = new Map<string, any>()
    for (const file of await docFiles()) {
      const path = docPath(file)
      const parts = path.slice(1).split('/')
      const key = parts.length > 1 ? parts[0] : path
      if (!roots.has(key)) {
        const title = parts.length > 1 ? parts[0] : docTitle(path)
        roots.set(key, {
          key,
          icon: parts.length > 1 ? '#iconFolder' : title === 'CHANGELOG' || title === '更新日志' ? '#iconList' : '#iconHelp',
          title,
          desc: `assets/docs/${file}`,
        })
      }
    }
    window._siyuan_cloud_docs = [...roots.values()]
  }

  async function openPackagedDoc(key: string) {
    const { refs, groups } = await syncDocs()
    if (groups.has(key)) {
      await writeDoc(`/${key}`, docIndex(key, groups.get(key) || []), true)
      return
    }
    const files = await docFiles()
    const file = files.find(file => docPath(file) === key)
    if (!file)
      return
    const path = docPath(file)
    await writeDoc(path, replaceDocRefs(await fetchText(asset(`assets/docs/${file}`), `# ${docTitle(path)}\n`), refs), true)
  }

  async function openDriverDoc(driver: string) {
    const doc = DRIVER_DOCS[normalizeDriverName(driver)]
    const root = driverDocRoot()
    if (!doc) {
      await openPackagedDoc(root)
      return
    }
    const title = lang() === 'zh_CN' ? doc.zh : doc.en
    await openPackagedDoc(`/${root}/${title}`)
  }

  return { loadDocList, openApiDoc, openDriverDoc, openReadmeDoc, openPackagedDoc }
}
