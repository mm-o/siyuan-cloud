import { showMessage, type Plugin } from 'siyuan'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  fsGet,
  fsMkdir,
  fsNewFile,
} from '@/utils/api'
import {
  fetchOpenListJson,
  fetchOpenListText,
  openListJson,
  privateBase,
} from '@/utils/request'
import { fetchKernelStatus } from '@/utils/status'

type Status = 'checking' | 'online' | 'offline'

interface StorageInfo {
  persistent?: boolean
  syncable_by_default?: boolean
  ignored_by_syncignore?: boolean
  state_file?: string
  source?: string
}

export interface DriverField {
  name: string
  type: string
  default?: string
  options?: string
  required?: boolean
  help?: string
}

interface DriverInfo {
  common?: DriverField[]
  additional?: DriverField[]
  config?: Record<string, any>
}

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'

export function useDock(plugin: Plugin) {
  const tabs = [
    { key: 'mounts', labelKey: 'tabMounts', icon: '#iconDatabase' },
    { key: 'tasks', labelKey: 'tabTask', icon: '#iconList' },
    { key: 'shares', labelKey: 'tabShares', icon: '#iconLink' },
    { key: 'settings', labelKey: 'openSettings', icon: '#iconSettings' },
    { key: 'about', labelKey: 'tabAbout', icon: '#iconInfo' },
  ]
  const currentTab = ref('mounts')
  const status = ref<Status>('checking')
  const statusDetail = ref(t('waitingKernel'))
  const storageInfo = ref<StorageInfo>({})
  const accountInfo = ref('')
  const verifyUsername = ref('admin')
  const verifyPassword = ref('')
  const verifyMountPath = ref(`/verify-${new Date().toISOString().slice(0, 10)}`)
  const verifyDriver = ref('SiYuanKernel')
  const verifyAddition = ref('{}')
  const verifySession = ref('')
  const verifyStorages = ref<any[]>([])
  const selectedStorageId = ref<number | null>(null)
  const selectedStorage = ref<any | null>(null)
  const driverOptions = ref(['SiYuanKernel', 'SiYuanWorkspace'])
  const driverInfo = ref<DriverInfo | null>(null)
  const driverForm = ref<Record<string, any>>({})
  const mountCreating = ref(false)
  const mountCreateOk = ref(false)
  const mountCreateResult = ref('')
  const mountFormOpen = ref(false)
  const driverVerifyQr = ref('')
  const driverVerifyMessage = ref('')
  const driverVerifyPolling = ref(false)
  const configText = ref('')
  const externalPreviews = ref('')
  const verifyLog = ref<Array<{ id: string, ok: boolean, title: string, detail: string }>>([])
  let driverVerifyTimer: ReturnType<typeof window.setInterval> | undefined

  function t(key: string) {
    return String((plugin.i18n as Record<string, string>)?.[key] || key)
  }

  function tFallback(key: string, fallback = '') {
    const value = (plugin.i18n as Record<string, string>)?.[key]
    return value === undefined ? fallback : String(value)
  }

  function fieldLabel(field: DriverField) {
    return tFallback(`driverField.${field.name}`, field.name)
  }

  function fieldHelp(field: DriverField) {
    return tFallback(`driverFieldHelp.${field.name}`, field.help || '')
  }

  function normalizeDriverName(value: string) {
    const driver = String(value || '').trim()
    if (!driver)
      return 'OpenList'
    if (/^alist\s*v3$/i.test(driver))
      return 'AListV3'
    if (/^alist$/i.test(driver))
      return 'AList'
    if (/^aliyundriveopen$/i.test(driver))
      return 'AliyundriveOpen'
    if (/^aliyundriveshare$/i.test(driver))
      return 'AliyundriveShare'
    if (/^aliyundrive$/i.test(driver))
      return 'Aliyundrive'
    if (/^baidunetdisk$/i.test(driver))
      return 'BaiduNetdisk'
    if (/^googledrive$/i.test(driver))
      return 'GoogleDrive'
    if (/^googlephoto$/i.test(driver))
      return 'GooglePhoto'
    if (/^onedriveapp$/i.test(driver))
      return 'OnedriveAPP'
    if (/^onedrive$/i.test(driver))
      return 'Onedrive'
    if (/^webdav$/i.test(driver))
      return 'WebDav'
    if (/^s3$/i.test(driver))
      return 'S3'
    if (/^doge$/i.test(driver))
      return 'Doge'
    if (/^123pan$/i.test(driver) || /^123$/i.test(driver))
      return '123Pan'
    if (/^123open$/i.test(driver))
      return '123Open'
    if (/^189cloud$/i.test(driver))
      return '189Cloud'
    if (/^115cloud$/i.test(driver))
      return '115 Cloud'
    if (/^115open$/i.test(driver))
      return '115 Open'
    return driver
  }

  function driverDisplayName(value: string) {
    const driver = normalizeDriverName(value)
    return tFallback(`driverName.${driver}`, driver)
  }

  function driverNote(value: string, fallback = '') {
    const driver = normalizeDriverName(value)
    return tFallback(`driverNote.${driver}`, fallback)
  }

  function defaultMountPathForDriver(driver: string) {
    const name = driverDisplayName(driver).replace(/[\\/:*?"<>|#]/g, '').trim()
    return `/${name || normalizeDriverName(driver)}`
  }

  const statusTitle = computed(() => {
    if (status.value === 'online')
      return t('kernelOnline')
    if (status.value === 'offline')
      return t('kernelPending')
    return t('checking')
  })

  const statusClass = computed(() => ({
    online: status.value === 'online',
    offline: status.value === 'offline',
  }))

  const driverFields = computed(() => {
    const info = driverInfo.value
    if (!info)
      return []
    const seen = new Set<string>()
    return [...(info.common || []), ...(info.additional || [])].filter((item) => {
      if (!item?.name || seen.has(item.name))
        return false
      seen.add(item.name)
      return true
    })
  })

  const storageSyncLabel = computed(() => {
    if (storageInfo.value.ignored_by_syncignore)
      return t('ignoredBySyncignore')
    if (storageInfo.value.syncable_by_default)
      return t('syncableByDefault')
    return t('unknown')
  })

  const driverQrLoginAvailable = computed(() => {
    const driver = normalizeDriverName(verifyDriver.value)
    return driverFields.value.some(field => field.name === 'query_token')
      || driverForm.value.login_type === 'qrcode'
      || ['QuarkTV', 'UCTV', '189CloudTV'].includes(driver)
  })

  const driverVerifyQrSrc = computed(() =>
    driverVerifyQr.value
      ? `data:image/jpeg;base64,${driverVerifyQr.value.replace(/^data:image\/[^;]+;base64,/, '')}`
      : '',
  )

  function storageTags(item: any) {
    const driver = driverDisplayName(String(item?.driver || item?.type || 'OpenList'))
    const statusText = String(item?.disabled ? t('disabled') : item?.status || 'work')
    const statusClass = item?.disabled || /fail|error|disabled|offline/i.test(statusText)
      ? 'b3-chip--error'
      : /work|ready|ok|success|enable/i.test(statusText)
        ? 'b3-chip--success'
        : 'b3-chip--warning'
    return [
      { key: 'driver', text: driver, className: 'b3-chip--info' },
      { key: 'status', text: statusText, className: statusClass },
    ]
  }

  function storageDescription(item: any) {
    return [
      driverDisplayName(String(item?.driver || '')),
      item?.remark || item?.addition?.remark || '',
      item?.id ? `id=${item.id}` : '',
    ].filter(Boolean).join(' / ')
  }

  async function loadDockSettings() {
    try {
      const settings = await plugin.loadData(DOCK_SETTINGS)
      const tab = settings?.currentTab
      if (tabs.some(item => item.key === tab))
        currentTab.value = tab
    } catch {
      currentTab.value = 'mounts'
    }
  }

  async function saveDockSettings() {
    await plugin.saveData(DOCK_SETTINGS, { currentTab: currentTab.value })
  }

  function pushVerify(ok: boolean, title: string, detail: string) {
    verifyLog.value.unshift({ id: `${Date.now()}-${Math.random()}`, ok, title, detail })
  }

  async function verifyStep(title: string, runner: () => Promise<string>) {
    try {
      const detail = await runner()
      pushVerify(true, title, detail)
      return true
    } catch (error) {
      pushVerify(false, title, error instanceof Error ? error.message : String(error))
      return false
    }
  }

  async function verifyLogin() {
    return verifyStep(t('verifyLogin'), async () => {
      const payload = await openListJson('/api/auth/login', {
        username: verifyUsername.value,
        password: verifyPassword.value,
      })
      verifySession.value = payload.data?.token || payload.data?.username || verifyUsername.value
      accountInfo.value = JSON.stringify(payload.data || {})
      return JSON.stringify(payload.data || {})
    })
  }

  async function loadMe() {
    try {
      const payload = await fetchOpenListJson('/api/me')
      accountInfo.value = JSON.stringify(payload.data || {})
      verifySession.value = payload.data?.username || verifySession.value
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function logout() {
    try {
      await openListJson('/api/auth/logout')
      verifySession.value = ''
      accountInfo.value = ''
      showMessage(t('logoutDone'))
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  function fieldOptions(field: DriverField) {
    return String(field.options || '').split(',').map(item => item.trim()).filter(Boolean)
  }

  function normalizeFieldValue(field: DriverField, value: any) {
    if (field.type === 'bool')
      return value === true || value === 'true'
    if (field.type === 'number' || field.type === 'float')
      return value === '' || value === undefined ? '' : Number(value)
    return value ?? ''
  }

  function defaultDriverForm(info: DriverInfo) {
    const next: Record<string, any> = {}
    for (const field of [...(info.common || []), ...(info.additional || [])]) {
      if (field?.name)
        next[field.name] = normalizeFieldValue(field, field.default ?? '')
    }
    return next
  }

  function additionFromForm() {
    const addition: Record<string, any> = {}
    for (const field of driverFields.value) {
      const value = normalizeFieldValue(field, driverForm.value[field.name])
      if (field.type === 'bool' || value !== '')
        addition[field.name] = value
    }
    return addition
  }

  function syncJsonFromForm() {
    verifyAddition.value = JSON.stringify(additionFromForm(), null, 2)
  }

  function syncFormFromJson() {
    const raw = JSON.parse(verifyAddition.value || '{}')
    const next = defaultDriverForm(driverInfo.value || {})
    for (const field of driverFields.value) {
      if (Object.prototype.hasOwnProperty.call(raw, field.name))
        next[field.name] = normalizeFieldValue(field, raw[field.name])
    }
    driverForm.value = next
  }

  function parseAddition(addition: any) {
    if (!addition)
      return {}
    if (typeof addition === 'object')
      return addition
    return JSON.parse(String(addition || '{}'))
  }

  function mergedAddition(clearQrSession = false) {
    const rawAddition = JSON.parse(verifyAddition.value || '{}')
    const addition = { ...rawAddition, ...additionFromForm() }
    if (clearQrSession) {
      for (const key of ['query_token', 'QueryToken', 'access_token', 'AccessToken', 'refresh_token', 'RefreshToken'])
        delete addition[key]
    }
    verifyAddition.value = JSON.stringify(addition, null, 2)
    syncFormFromJson()
    return addition
  }

  function applyDriverTestData(data: any) {
    if (data?.addition) {
      verifyAddition.value = JSON.stringify(data.addition, null, 2)
      syncFormFromJson()
    }
    const verify = data?.verify || {}
    driverVerifyQr.value = verify.qr_data || ''
    if (driverVerifyQr.value)
      driverVerifyMessage.value = t('qrScanPrompt')
  }

  async function requestDriverTest(addition: Record<string, any>) {
    const payload = await fetchOpenListJson('/api/admin/driver/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver: verifyDriver.value, addition }),
    })
    applyDriverTestData(payload.data)
    return payload
  }

  function stopDriverQrPolling() {
    if (driverVerifyTimer)
      window.clearInterval(driverVerifyTimer)
    driverVerifyTimer = undefined
    driverVerifyPolling.value = false
  }

  function startDriverQrPolling() {
    stopDriverQrPolling()
    driverVerifyPolling.value = true
    driverVerifyTimer = window.setInterval(async () => {
      try {
        const payload = await requestDriverTest(JSON.parse(verifyAddition.value || '{}'))
        if (payload.code === 200) {
          stopDriverQrPolling()
          driverVerifyQr.value = ''
          driverVerifyMessage.value = t('qrLoginDone')
          mountCreateOk.value = true
          mountCreateResult.value = t('driverTestPassed')
          showMessage(t('qrLoginDone'))
        }
      } catch {
        // Keep polling while the QR session is waiting for scan confirmation.
      }
    }, 2500)
  }

  async function refreshDriverQrCode() {
    if (mountCreating.value)
      return
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('qrRefreshing')
    driverVerifyQr.value = ''
    driverVerifyMessage.value = ''
    stopDriverQrPolling()
    try {
      const payload = await requestDriverTest(mergedAddition(true))
      if (payload.code === 200) {
        mountCreateOk.value = true
        mountCreateResult.value = t('driverTestPassed')
        driverVerifyMessage.value = t('qrLoginDone')
        return
      }
      if (!driverVerifyQr.value)
        throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
      mountCreateOk.value = true
      mountCreateResult.value = t('qrScanPrompt')
      startDriverQrPolling()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateOk.value = false
      mountCreateResult.value = message
      driverVerifyMessage.value = message
      showMessage(message, 3000, 'error')
    } finally {
      mountCreating.value = false
    }
  }

  async function loadDriverInfo() {
    try {
      stopDriverQrPolling()
      driverVerifyQr.value = ''
      driverVerifyMessage.value = ''
      const payload = await fetchOpenListJson(`/api/admin/driver/info?driver=${encodeURIComponent(verifyDriver.value)}`)
      driverInfo.value = payload.data || null
      driverForm.value = defaultDriverForm(driverInfo.value || {})
      syncJsonFromForm()
      mountCreateResult.value = ''
      mountCreateOk.value = false
    } catch (error) {
      driverInfo.value = null
      driverForm.value = {}
      verifyAddition.value = '{}'
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function loadDriverInfoForEdit(driver: string) {
    const payload = await fetchOpenListJson(`/api/admin/driver/info?driver=${encodeURIComponent(driver)}`)
    driverInfo.value = payload.data || null
    driverForm.value = defaultDriverForm(driverInfo.value || {})
  }

  async function verifyCreateMount() {
    if (mountCreating.value)
      return false
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('mountCreating')
    try {
      const rawAddition = JSON.parse(verifyAddition.value || '{}')
      const addition = { ...rawAddition, ...additionFromForm() }
      verifyAddition.value = JSON.stringify(addition, null, 2)
      const payload = await openListJson('/api/admin/storage/create', {
        mount_path: verifyMountPath.value,
        driver: verifyDriver.value,
        addition,
        order: 0,
      })
      await verifyStorageList()
      mountCreateOk.value = true
      mountCreateResult.value = `${t('mountCreatePassed')}: id=${payload.data?.id ?? ''}, path=${verifyMountPath.value}`
      pushVerify(true, t('verifyCreateMount'), mountCreateResult.value)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateResult.value = message
      pushVerify(false, t('verifyCreateMount'), message)
      return false
    } finally {
      mountCreating.value = false
    }
  }

  async function tryDriverTest(addition: Record<string, any>) {
    const payload = await requestDriverTest(addition)
    if (payload.code === 501 || payload.message?.includes('does not expose a test method yet') || payload.message?.includes('not found'))
      return ''
    if (payload.code && payload.code !== 200)
      throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
    const user = payload.data?.user || {}
    return user.nickname ? `${t('driverTestPassed')}: ${user.nickname}` : t('driverTestPassed')
  }

  async function addMount() {
    if (mountCreating.value)
      return false
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('mountCreating')
    try {
      const rawAddition = JSON.parse(verifyAddition.value || '{}')
      const addition = { ...rawAddition, ...additionFromForm() }
      verifyAddition.value = JSON.stringify(addition, null, 2)
      const testMessage = await tryDriverTest(addition)
      const payload = await openListJson('/api/admin/storage/create', {
        mount_path: verifyMountPath.value,
        driver: verifyDriver.value,
        addition: JSON.parse(verifyAddition.value || '{}'),
        order: 0,
      })
      await verifyStorageList()
      mountCreateOk.value = true
      mountCreateResult.value = [
        testMessage,
        `${t('mountCreatePassed')}: id=${payload.data?.id ?? ''}, path=${verifyMountPath.value}`,
      ].filter(Boolean).join(' / ')
      pushVerify(true, t('mountAdd'), mountCreateResult.value)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateResult.value = message
      pushVerify(false, t('mountAdd'), message)
      return false
    } finally {
      mountCreating.value = false
    }
  }

  async function updateMount() {
    if (!selectedStorageId.value || mountCreating.value)
      return false
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('mountCreating')
    try {
      const rawAddition = JSON.parse(verifyAddition.value || '{}')
      const addition = { ...rawAddition, ...additionFromForm() }
      verifyAddition.value = JSON.stringify(addition, null, 2)
      const testMessage = await tryDriverTest(addition)
      await openListJson('/api/admin/storage/update', {
        ...(selectedStorage.value || {}),
        id: selectedStorageId.value,
        mount_path: verifyMountPath.value,
        driver: verifyDriver.value,
        addition: JSON.parse(verifyAddition.value || '{}'),
        status: selectedStorage.value?.status || 'work',
        disabled: !!selectedStorage.value?.disabled,
      })
      await verifyStorageList()
      mountCreateOk.value = true
      mountCreateResult.value = [
        testMessage,
        `${t('mountUpdatePassed')}: id=${selectedStorageId.value}, path=${verifyMountPath.value}`,
      ].filter(Boolean).join(' / ')
      pushVerify(true, t('mountUpdate'), mountCreateResult.value)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateResult.value = message
      pushVerify(false, t('mountUpdate'), message)
      return false
    } finally {
      mountCreating.value = false
    }
  }

  function clearMountEdit() {
    selectedStorageId.value = null
    selectedStorage.value = null
    mountCreateOk.value = false
    mountCreateResult.value = ''
    loadDriverInfo()
  }

  function openAddMount() {
    clearMountEdit()
    verifyMountPath.value = defaultMountPathForDriver(verifyDriver.value)
    mountFormOpen.value = true
  }

  async function editMount(item: any) {
    const storage = item?.id ? (await fetchOpenListJson(`/api/admin/storage/get?id=${encodeURIComponent(item.id)}`)).data : item
    selectedStorageId.value = Number(storage.id)
    selectedStorage.value = storage
    verifyMountPath.value = storage.mount_path || '/'
    verifyDriver.value = storage.driver || 'SiYuanKernel'
    await loadDriverInfoForEdit(verifyDriver.value)
    verifyAddition.value = JSON.stringify(parseAddition(storage.addition), null, 2)
    syncFormFromJson()
    mountCreateOk.value = true
    mountCreateResult.value = `${t('mountEditing')}: id=${selectedStorageId.value}, path=${verifyMountPath.value}`
  }

  async function openEditMount(item: any) {
    await editMount(item)
    mountFormOpen.value = true
  }

  function closeMountForm() {
    stopDriverQrPolling()
    mountFormOpen.value = false
  }

  async function submitAddMount() {
    if (await addMount())
      closeMountForm()
  }

  async function submitUpdateMount() {
    if (await updateMount())
      closeMountForm()
  }

  async function toggleMount(item: any) {
    const id = Number(item.id)
    if (!id)
      return
    await openListJson(item.disabled ? '/api/admin/storage/enable' : '/api/admin/storage/disable', { id })
    await verifyStorageList()
  }

  async function deleteMount(item: any) {
    const id = Number(item.id)
    if (!id || id === 1)
      return
    await openListJson('/api/admin/storage/delete', { id })
    if (selectedStorageId.value === id)
      clearMountEdit()
    await verifyStorageList()
  }

  async function exportAddition() {
    try {
      syncJsonFromForm()
      await navigator.clipboard?.writeText(verifyAddition.value)
      mountCreateOk.value = true
      mountCreateResult.value = t('additionExported')
      showMessage(t('additionExported'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateOk.value = false
      mountCreateResult.value = message
      showMessage(message, 3000, 'error')
    }
  }

  function importAddition() {
    try {
      syncFormFromJson()
      syncJsonFromForm()
      mountCreateOk.value = true
      mountCreateResult.value = t('additionImported')
      showMessage(t('additionImported'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateOk.value = false
      mountCreateResult.value = message
      showMessage(message, 3000, 'error')
    }
  }

  async function loadDriverOptions() {
    try {
      const payload = await fetchOpenListJson('/api/admin/driver/names')
      if (Array.isArray(payload.data) && payload.data.length)
        driverOptions.value = payload.data
      if (!driverOptions.value.includes(verifyDriver.value))
        verifyDriver.value = driverOptions.value[0] || 'SiYuanKernel'
      await loadDriverInfo()
    } catch {
      driverOptions.value = ['SiYuanKernel', 'SiYuanWorkspace']
    }
  }

  async function exportConfig() {
    try {
      const payload = await fetchOpenListJson('/api/admin/config/export')
      configText.value = JSON.stringify(payload.data || {}, null, 2)
      await navigator.clipboard?.writeText(configText.value)
      showMessage(t('configExported'))
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function importConfig() {
    try {
      const config = JSON.parse(configText.value || '{}')
      const payload = await openListJson('/api/admin/config/import', { config, mode: 'replace' })
      await verifyStorageList()
      await refreshStatus()
      showMessage(`${t('configImported')}: ${JSON.stringify(payload.data || {})}`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function loadExternalPreviews() {
    try {
      const payload = await fetchOpenListJson('/api/admin/setting/get?key=external_previews')
      externalPreviews.value = payload.data?.value || '{}'
    } catch (error) {
      externalPreviews.value = '{}'
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function saveExternalPreviews() {
    try {
      const parsed = JSON.parse(externalPreviews.value || '{}')
      externalPreviews.value = JSON.stringify(parsed, null, 2)
      await openListJson('/api/admin/setting/save', {
        key: 'external_previews',
        value: externalPreviews.value,
      })
      showMessage(t('externalPreviewsSaved'))
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 3000, 'error')
    }
  }

  async function loadStorageList() {
    const payload = await fetchOpenListJson('/api/admin/storage/list')
    verifyStorages.value = payload.data?.content || payload.data || []
    return verifyStorages.value
  }

  async function verifyStorageList() {
    return verifyStep(t('verifyStorageList'), async () => {
      await loadStorageList()
      return `${verifyStorages.value.length} ${t('verifyStorages')}`
    })
  }

  async function verifyFsRoundTrip() {
    return verifyStep(t('verifyFsRoundTrip'), async () => {
      const dir = `${verifyMountPath.value}/fs`
      const path = `${dir}/note.txt`
      await fsMkdir(dir)
      await fsNewFile(path, '', true)
      const got = await fsGet(path)
      if (got.code !== 200)
        throw new Error(got.message || `Siyuan Cloud code ${got.code}`)
      return got.data?.name || path
    })
  }

  async function verifyWebDavRoundTrip() {
    return verifyStep(t('verifyWebDavRoundTrip'), async () => {
      const path = `${verifyMountPath.value}/webdav.txt`
      await fetchOpenListText(`/dav${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: 'hello webdav',
      })
      const got = await fetchOpenListText(`/dav${path}`)
      if (got.text !== 'hello webdav')
        throw new Error('WebDAV readback mismatch')
      return path
    })
  }

  async function verifyS3RoundTrip() {
    return verifyStep(t('verifyS3RoundTrip'), async () => {
      const key = `${verifyMountPath.value.replace(/^\/+/, '')}/s3.txt`
      await fetchOpenListText(`/s3/siyuan-cloud/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: 'hello s3',
      })
      const got = await fetchOpenListText(`/s3/siyuan-cloud/${key}`)
      if (got.text !== 'hello s3')
        throw new Error('S3 readback mismatch')
      return key
    })
  }

  async function verifyTaskList() {
    return verifyStep(t('verifyTaskList'), async () => {
      const payload = await fetchOpenListJson('/api/task/copy/done')
      return `${payload.data?.total ?? 0} done`
    })
  }

  async function runVerifySuite() {
    verifyLog.value = []
    await verifyLogin()
    await verifyCreateMount()
    await verifyFsRoundTrip()
    await verifyWebDavRoundTrip()
    await verifyS3RoundTrip()
    await verifyTaskList()
    await refreshAll()
  }

  async function refreshStatus() {
    status.value = 'checking'
    statusDetail.value = `${t('callingStatus')} ${privateBase}/siyuan-cloud/status`
    try {
      const result = await fetchKernelStatus()
      const data = result.data
      const routeCount = data.routes?.length || 0
      storageInfo.value = data.storage || {}
      status.value = 'online'
      statusDetail.value = `${data.version || 'kernel'} / ${data.entries || 0} entries / ${routeCount} routes / ${result.source}`
    } catch (error) {
      status.value = 'offline'
      statusDetail.value = error instanceof Error ? error.message : t('kernelUnavailable')
    }
  }

  async function refreshAll() {
    await loadDriverOptions()
    await loadStorageList()
    await loadExternalPreviews()
    await refreshStatus()
  }

  function openPrivateEntry() {
    window.open(`${privateBase}/`, '_blank', 'noopener')
  }

  function openFileManager() {
    window._siyuan_cloud?.openFileManager?.()
  }

  async function copyRoute() {
    const route = `${location.origin}${privateBase}/`
    try {
      await navigator.clipboard.writeText(route)
      showMessage(t('routeCopied'))
    } catch {
      showMessage(route, 3000, 'info')
    }
  }

  watch(currentTab, saveDockSettings)
  watch(verifyDriver, async (driver) => {
    if (!selectedStorageId.value)
      verifyMountPath.value = defaultMountPathForDriver(driver)
    await loadDriverInfo()
  })
  onMounted(async () => {
    await loadDockSettings()
    await refreshAll()
  })
  onBeforeUnmount(stopDriverQrPolling)

  return {
    accountInfo,
    addMount,
    clearMountEdit,
    configText,
    copyRoute,
    currentTab,
    deleteMount,
    driverDisplayName,
    driverFields,
    driverForm,
    driverInfo,
    driverNote,
    driverOptions,
    driverQrLoginAvailable,
    driverVerifyMessage,
    driverVerifyPolling,
    driverVerifyQrSrc,
    editMount,
    exportAddition,
    exportConfig,
    externalPreviews,
    fieldHelp,
    fieldLabel,
    fieldOptions,
    importAddition,
    importConfig,
    loadMe,
    logout,
    mountCreateOk,
    mountCreateResult,
    mountCreating,
    mountFormOpen,
    openFileManager,
    openAddMount,
    openEditMount,
    openPrivateEntry,
    refreshDriverQrCode,
    refreshAll,
    runVerifySuite,
    saveExternalPreviews,
    selectedStorageId,
    statusClass,
    statusDetail,
    statusTitle,
    storageDescription,
    storageInfo,
    storageSyncLabel,
    storageTags,
    t,
    tabs,
    closeMountForm,
    submitAddMount,
    submitUpdateMount,
    toggleMount,
    updateMount,
    verifyAddition,
    verifyDriver,
    verifyLogin,
    verifyLog,
    verifyMountPath,
    verifyPassword,
    verifySession,
    verifyStorages,
    verifyStorageList,
    verifyTaskList,
    verifyUsername,
  }
}
