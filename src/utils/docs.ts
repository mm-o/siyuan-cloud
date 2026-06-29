import { fetchSyncPost, openTab } from 'siyuan'
import { fetchOpenListJson } from '@/utils/request'

export function createDocs(plugin: any, t: (key: string) => string) {
  const lang = () => t('openHelp') === '打开说明' ? 'zh_CN' : 'en_US'
  const notebookName = () => lang() === 'zh_CN' ? '思盘文档' : 'Siyuan Cloud Docs'
  const asset = (path: string) => `/plugins/${plugin.name}/${path.replace(/^\/+/, '')}`
  const docPath = (file: string) => `/${file.replace(`${lang()}/`, '').replace(/\.md$/, '')}`
  const docTitle = (path: string) => path.split('/').pop() || ''
  const docParent = (path: string) => path.split('/')[1] || ''
  const docRef = (id: string, title: string) => `((${id} '${title}'))`
  const docIndex = (title: string, refs: string[]) => [`# ${title}`, '', ...refs.map(ref => `- ${ref}`), ''].join('\n')

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
    if (open)
      openTab({ app: plugin.app, doc: { id } })
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
    const files = await docFiles()
    for (const parent of new Set(files.map(file => docPath(file)).filter(path => path.split('/').length > 2).map(docParent)))
      await writeDoc(`/${parent}`, `# ${parent}\n`)
    for (const file of files) {
      const path = docPath(file)
      const title = docTitle(path)
      const ref = docRef(await writeDoc(path, await fetchText(asset(`assets/docs/${file}`), `# ${title}\n`)), title)
      refs.set(title, ref)
      if (path.split('/').length > 2) {
        const parent = docParent(path)
        groups.set(parent, [...(groups.get(parent) || []), ref])
      }
    }
    for (const [title, items] of groups)
      refs.set(title, docRef(await writeDoc(`/${title}`, docIndex(title, items)), title))
    refs.set('API', docRef(await writeDoc('/API', await apiDoc()), 'API'))
    return refs
  }

  async function openApiDoc() {
    await writeDoc('/API', await apiDoc(), true)
  }

  async function openReadmeDoc() {
    const refs = await syncDocs()
    let markdown = await fetchText(asset(lang() === 'zh_CN' ? 'README_zh_CN.md' : 'README.md'), '# README\n')
    for (const [title, ref] of refs)
      markdown = markdown.split(`[[${title}]]`).join(ref)
    await writeDoc('/README', markdown, true)
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
    const files = await docFiles()
    const children = files.filter(file => docPath(file).startsWith(`/${key}/`))
    if (children.length) {
      const refs = []
      for (const file of children) {
        const path = docPath(file)
        const title = docTitle(path)
        refs.push(docRef(await writeDoc(path, await fetchText(asset(`assets/docs/${file}`), `# ${title}\n`)), title))
      }
      await writeDoc(`/${key}`, docIndex(key, refs), true)
      return
    }
    const file = files.find(file => docPath(file) === key)
    if (!file)
      return
    const path = docPath(file)
    await writeDoc(path, await fetchText(asset(`assets/docs/${file}`), `# ${docTitle(path)}\n`), true)
  }

  return { loadDocList, openApiDoc, openReadmeDoc, openPackagedDoc }
}
