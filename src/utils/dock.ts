import { Menu, confirm, showMessage, type Plugin } from 'siyuan'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import {
  fetchOpenListJson,
  openListShareUrl,
  openListJson,
  privateBase,
} from '@/utils/request'
import {
  indexBuild,
  indexProgress,
  fsTorrentGenerate,
  fsTorrentParse,
} from '@/utils/api'
import { testOpenListDirect } from '@/utils/openlist_direct'
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

interface DockSettings {
  currentTab?: string
  compactViews?: Record<string, boolean>
}

const DOCK_SETTINGS = 'siyuan-cloud-dock-settings.json'
const USER_PERMISSION_KEYS = [
  'see_hides',
  'access_without_password',
  'offline_download',
  'write_content',
  'rename',
  'move',
  'copy',
  'delete',
  'webdav_read',
  'webdav_manage',
  'ftp_read',
  'ftp_manage',
  'read_archives',
  'decompress',
  'share',
  'customize_share_id',
] as const
const TASK_TYPES = ['copy', 'move', 'upload', 'offline_download', 'offline_download_transfer', 'decompress', 'decompress_upload']
const QR_SESSION_KEYS = ['query_token', 'QueryToken', 'access_token', 'AccessToken', 'refresh_token', 'RefreshToken', 'temp_uuid', 'TempUuid', 'qrcode_token', 'QRCodeToken', 'qrcode_sign', 'QRCodeSign', 'qrcode_time', 'QRCodeTime', 'qrcode_content', 'QRCodeContent', 'qrcode_cookie', 'QRCodeCookie']
const COOKIE_OR_QR_DRIVERS = new Set(['115 Cloud', '115 Share'])
const ZH_OPTION_LABELS: Record<string, string> = { password: '密码', qrcode: '二维码', personal: '个人云', family: '家庭云', stream: '普通上传', rapid: '秒传', old: '旧版上传', default: '默认', resource: '资源库', backup: '备份盘', trash: '移入回收站', delete: '直接删除', official: '官方', crack: '破解', crack_video: '视频破解', download: '下载链接', streaming: '流式链接', asc: '升序', desc: '降序', ASC: '升序', DESC: '降序', none: '不排序', name: '名称', file_name: '文件名', filename: '文件名', size: '大小', file_size: '文件大小', filesize: '文件大小', file_type: '文件类型', time: '时间', updated_at: '更新时间', created_at: '创建时间', lastOpTime: '最后操作时间', user_utime: '用户更新时间', sharepoint: 'SharePoint', other: '其它', alipanTV: '阿里云盘 TV' }
const humanizeOption = (option: string) => option.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())

export function useDock(plugin: Plugin) {
  const tabs = [
    { key: 'files', labelKey: 'fileManagerTitle', icon: '#iconFolder' },
    { key: 'mounts', labelKey: 'tabMounts', icon: '#iconDatabase' },
    { key: 'users', labelKey: 'tabUsers', icon: '#iconAccount' },
    { key: 'shares', labelKey: 'tabShares', icon: '#iconLink' },
    { key: 'tasks', labelKey: 'tabTask', icon: '#iconList' },
    { key: 'tools', labelKey: 'tabTools', icon: '#iconSettings' },
    { key: 'status', labelKey: 'tabStatus', icon: '#iconInfo' },
  ]
  const currentTab = ref('files')
  const dockCompactViews = ref<Record<string, boolean>>({})
  const status = ref<Status>('checking')
  const statusDetail = ref(t('waitingKernel'))
  const storageInfo = ref<StorageInfo>({})
  const verifyMountPath = ref('/')
  const verifyDriver = ref('SiYuanWorkspace')
  const verifyAddition = ref('{}')
  const verifyStorages = ref<any[]>([])
  const taskType = ref('copy')
  const taskDone = ref<'undone' | 'done'>('undone')
  const taskItems = ref<any[]>([])
  const torrentPath = ref('')
  const torrentData = ref('')
  const torrentResult = ref('')
  const selectedStorageId = ref<number | null>(null)
  const selectedStorage = ref<any | null>(null)
  const driverOptions = ref(['SiYuanWorkspace'])
  const driverInfo = ref<DriverInfo | null>(null)
  const driverForm = ref<Record<string, any>>({})
  const mountCreating = ref(false)
  const mountCreateOk = ref(false)
  const mountCreateResult = ref('')
  const mountFormOpen = ref(false)
  const driverVerifyQr = ref('')
  const driverVerifyMessage = ref('')
  const driverVerifyPolling = ref(false)
  const driverVerifySmsCode = ref('')
  const driverVerifySmsContext = ref<Record<string, any> | null>(null)
  const driverVerifySmsRequired = ref(false)
  const configText = ref('')
  const externalPreviews = ref('')
  const shareItems = ref<any[]>([])
  const shareFormOpen = ref(false)
  const selectedShareId = ref('')
  const shareForm = ref<Record<string, any>>({})
  const userItems = ref<any[]>([])
  const userFormOpen = ref(false)
  const selectedUserId = ref<number | null>(null)
  const userForm = ref<Record<string, any>>({})
  let dockSettingsLoaded = false
  let driverVerifyTimer: ReturnType<typeof window.setInterval> | undefined
  let loadingMountEdit = false

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
    const driver = normalizeDriverName(verifyDriver.value)
    return tFallback(`driverFieldHelp.${driver}.${field.name}`, tFallback(`driverFieldHelp.${field.name}`, field.help || ''))
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
    if (/^115share$/i.test(driver))
      return '115 Share'
    return driver
  }

  function driverDisplayName(value: string) {
    const driver = normalizeDriverName(value)
    return tFallback(`driverName.${driver}`, driver)
  }

  function driverNote(value: string, fallback = '') {
    const driver = normalizeDriverName(value)
    const translated = tFallback(`driverNote.${driver}`, '')
    if (translated)
      return translated
    if (/placeholder|notimplement|remain|metadata/i.test(fallback))
      return t('driverRuntimePartial')
    if (/runtime|ported|wired|ports/i.test(fallback))
      return t('driverRuntimePorted')
    return fallback || t('driverMetadataOnly')
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

  const docItems = computed(() => window._siyuan_cloud_docs || [])

  const statusIcon = computed(() => (status.value === 'offline' ? '#iconClose' : '#iconCheck'))

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
    return driverFields.value.some(field => ['query_token', 'qrcode_token'].includes(field.name))
      || driverForm.value.login_type === 'qrcode'
      || ['QuarkTV', 'UCTV', '189CloudTV'].includes(driver)
  })

  const driverVerifyQrSrc = computed(() =>
    driverVerifyQr.value
      ? driverVerifyQr.value.startsWith('data:image/')
        ? driverVerifyQr.value
        : `data:image/jpeg;base64,${driverVerifyQr.value.replace(/^data:image\/[^;]+;base64,/, '')}`
      : '',
  )

  function storageDescription(item: any) {
    return [
      item?.remark || item?.addition?.remark || '',
      item?.id ? `id=${item.id}` : '',
    ].filter(Boolean).join(' / ')
  }

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

  function defaultUserForm(user?: any) {
    return {
      id: user?.id || null,
      username: user?.username || '',
      password: '',
      base_path: user?.base_path || '/',
      permission: Number(user?.permission ?? 0),
      disabled: !!user?.disabled,
      allow_ldap: !!user?.allow_ldap,
      sso_id: user?.sso_id || '',
    }
  }

  function userRoleLabel(user: any) {
    const role = Number(user?.role ?? 0)
    if (role === 2)
      return t('userRoleAdmin')
    if (role === 1)
      return t('userRoleGuest')
    return t('userRoleGeneral')
  }

  function userDetail(user: any) {
    return [
      user?.base_path || '/',
      userPermissionSummary(user),
      user?.siyuan_account ? t('siyuanAccount') : '',
      user?.sso_id ? `sso=${user.sso_id}` : '',
    ].filter(Boolean).join(' / ')
  }

  function userPermissionLabel(key: string) {
    return tFallback(`userPermission.${key}`, key)
  }

  function userPermissionNames(permission: any) {
    const value = Number(permission || 0)
    return USER_PERMISSION_KEYS.filter((_, index) => ((value >> index) & 1) === 1)
  }

  function userPermissionSummary(user: any) {
    if (Number(user?.role) === 2)
      return t('userPermissionAdmin')
    const names = userPermissionNames(user?.permission).map(userPermissionLabel)
    if (!names.length)
      return t('userPermissionNone')
    const visible = names.slice(0, 2).join(', ')
    return names.length > 2 ? `${visible} +${names.length - 2}` : visible
  }

  function userPermissionFormSummary() {
    return userPermissionSummary(userForm.value)
  }

  function userPermissionChecked(index: number) {
    return ((Number(userForm.value.permission || 0) >> index) & 1) === 1
  }

  function toggleUserPermission(index: number, checked: boolean) {
    const current = Number(userForm.value.permission || 0)
    userForm.value.permission = checked
      ? current | (1 << index)
      : current & ~(1 << index)
  }

  function userTags(user: any) {
    return [
      { key: 'role', text: userRoleLabel(user), className: Number(user?.role) === 2 ? 'b3-chip--success' : 'b3-chip--info' },
      { key: 'status', text: user?.disabled ? t('disabled') : t('enabled'), className: user?.disabled ? 'b3-chip--error' : 'b3-chip--success' },
    ]
  }

  async function loadDockSettings() {
    try {
      const settings = (await plugin.loadData(DOCK_SETTINGS)) as DockSettings | undefined
      const tab = settings?.currentTab
      if (tabs.some(item => item.key === tab))
        currentTab.value = tab
      if (settings?.compactViews && typeof settings.compactViews === 'object')
        dockCompactViews.value = Object.fromEntries(Object.entries(settings.compactViews).map(([key, value]) => [key, value === true]))
    } catch {
      currentTab.value = 'files'
    } finally {
      dockSettingsLoaded = true
    }
  }

  async function saveDockSettings() {
    if (!dockSettingsLoaded)
      return
    await plugin.saveData(DOCK_SETTINGS, { currentTab: currentTab.value, compactViews: dockCompactViews.value } satisfies DockSettings)
  }

  function fieldOptions(field: DriverField) {
    return String(field.options || '').split(',').map(item => item.trim()).filter(Boolean)
  }

  function fieldOptionLabel(field: DriverField, option: string) {
    const fallback = t('addTopBarIcon') === '思盘' ? ZH_OPTION_LABELS[option] || humanizeOption(option) : humanizeOption(option)
    return tFallback(`driverFieldOption.${field.name}.${option}`, fallback)
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

  function additionFromForm(preserve = true) {
    const addition: Record<string, any> = preserve ? parseAddition(verifyAddition.value) : {}
    for (const field of driverFields.value) {
      const value = normalizeFieldValue(field, driverForm.value[field.name])
      if (field.type === 'bool' || value !== '')
        addition[field.name] = value
    }
    return addition
  }

  function syncJsonFromForm(preserve = true) {
    verifyAddition.value = JSON.stringify(additionFromForm(preserve), null, 2)
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

  function syncAddition(clearQrSession = false) {
    const addition = additionFromForm()
    if (clearQrSession) {
      for (const key of QR_SESSION_KEYS)
        delete addition[key]
      if (driverFields.value.some(field => field.name === 'qrcode_token') && driverFields.value.some(field => field.name === 'cookie'))
        delete addition.cookie
    }
    verifyAddition.value = JSON.stringify(addition, null, 2)
    syncFormFromJson()
    return addition
  }

  function validateMountAddition(addition: Record<string, any>) {
    if (COOKIE_OR_QR_DRIVERS.has(normalizeDriverName(verifyDriver.value)) && !String(addition.cookie || '').trim() && !String(addition.qrcode_token || '').trim())
      throw new Error(t('driverValidation.115CloudLoginRequired'))
  }

  async function applyDriverTestData(data: any) {
    if (data?.addition) {
      verifyAddition.value = JSON.stringify(data.addition, null, 2)
      syncFormFromJson()
    }
    const verify = data?.verify || {}
    if (verify.type === 'sms') {
      driverVerifySmsRequired.value = true
      driverVerifySmsContext.value = verify.second_context || null
      const mobile = verify.show_name || verify.mobile || ''
      driverVerifyMessage.value = mobile ? `${t('smsCodeSent')}: ${mobile}` : t('smsCodeRequired')
      return
    }
    const qrValue = verify.qr_src || verify.qr_data || ''
    if (qrValue) {
      driverVerifyQr.value = qrValue
    } else if (verify.qr_text) {
      driverVerifyQr.value = await QRCode.toDataURL(verify.qr_text, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200,
      })
    }
    if (driverVerifyQr.value)
      driverVerifyMessage.value = (
        verify.status === 'scanned'
          ? tFallback('qrScannedPrompt', t('qrScanPrompt'))
          : verify.status === 'expired' || verify.status === 'canceled'
            ? (verify.message || tFallback('qrExpiredPrompt', t('qrScanPrompt')))
            : (verify.message || t('qrScanPrompt'))
      )
    else if (verify.type === 'qrcode' && verify.message)
      driverVerifyMessage.value = verify.message
  }

  async function requestDriverTest(addition: Record<string, any>, verify?: Record<string, any>) {
    const payload = await fetchOpenListJson('/api/admin/driver/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver: verifyDriver.value, addition, verify }),
    })
    await applyDriverTestData(payload.data)
    return payload
  }

  function driverTestPayloadError(payload: any) {
    const status = String(payload.data?.verify?.status || '')
    const pending = ['waiting', 'pending', 'scanned'].includes(status)
    return pending ? (payload.data?.verify?.message || t('qrScanPrompt')) : (payload.message || `Siyuan Cloud code ${payload.code}`)
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
        const addition = parseAddition(verifyAddition.value)
        const payload = await requestDriverTest(addition, { type: 'qrcode' })
        if (payload.code === 200) {
          stopDriverQrPolling()
          driverVerifyQr.value = ''
          driverVerifyMessage.value = t('qrLoginDone')
          mountCreateOk.value = true
          mountCreateResult.value = `${t('qrLoginDone')} / ${t('mountCreating')}`
          showMessage(t('qrLoginDone'))
          if (await saveMount({ skipDriverTest: true }))
            closeMountForm()
        } else if (['expired', 'canceled'].includes(String(payload.data?.verify?.status || ''))) {
          stopDriverQrPolling()
        } else if (!['waiting', 'pending', 'scanned'].includes(String(payload.data?.verify?.status || ''))) {
          stopDriverQrPolling()
          const message = driverTestPayloadError(payload)
          mountCreateOk.value = false
          mountCreateResult.value = message
          driverVerifyMessage.value = message
        }
      } catch (error) {
        stopDriverQrPolling()
        const message = error instanceof Error ? error.message : String(error)
        mountCreateOk.value = false
        mountCreateResult.value = message
        driverVerifyMessage.value = message
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
      const payload = await requestDriverTest(syncAddition(true))
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
    } finally {
      mountCreating.value = false
    }
  }

  async function submitDriverSmsCode() {
    if (mountCreating.value || !driverVerifySmsCode.value.trim())
      return
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('smsVerifying')
    try {
      const addition = parseAddition(verifyAddition.value)
      const secondContext = driverVerifySmsContext.value
      const payload = await requestDriverTest(addition, {
        type: 'sms',
        sms_code: driverVerifySmsCode.value.trim(),
        second_context: secondContext,
      })
      if (payload.code && payload.code !== 200)
        throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
      await applyDriverTestData(payload.data)
      driverVerifySmsCode.value = ''
      driverVerifySmsContext.value = null
      driverVerifySmsRequired.value = false
      driverVerifyMessage.value = t('smsLoginDone')
      mountCreateOk.value = true
      mountCreateResult.value = `${t('smsLoginDone')} / ${t('mountCreating')}`
      showMessage(t('smsLoginDone'))
      mountCreating.value = false
      if (await saveMount({ skipDriverTest: true }))
        closeMountForm()
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
      driverVerifySmsCode.value = ''
      driverVerifySmsContext.value = null
      driverVerifySmsRequired.value = false
      const payload = await fetchOpenListJson(`/api/admin/driver/info?driver=${encodeURIComponent(verifyDriver.value)}`)
      driverInfo.value = payload.data || null
      driverForm.value = defaultDriverForm(driverInfo.value || {})
      syncJsonFromForm(false)
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

  function driverHasQrSession(addition: Record<string, any>) {
    return driverFields.value.some(field => field.name === 'qrcode_token')
      && !!String(addition.qrcode_token || addition.QRCodeToken || '').trim()
      && !String(addition.cookie || addition.Cookie || '').trim()
  }

  async function tryDriverTest(addition: Record<string, any>) {
    if (await testOpenListDirect(verifyDriver.value, addition))
      return t('driverTestPassed')
    const payload = await requestDriverTest(addition, driverHasQrSession(addition) ? { type: 'qrcode' } : undefined)
    if (payload.code === 501 || payload.message?.includes('does not expose a test method yet') || payload.message?.includes('not found'))
      return ''
    if (payload.code && payload.code !== 200) {
      throw new Error(driverTestPayloadError(payload))
    }
    if (payload.data?.addition)
      Object.assign(addition, payload.data.addition)
    driverVerifySmsRequired.value = false
    const user = payload.data?.user || {}
    return user.nickname ? `${t('driverTestPassed')}: ${user.nickname}` : t('driverTestPassed')
  }

  async function saveMount(options: { skipDriverTest?: boolean } = {}) {
    if (mountCreating.value)
      return false
    mountCreating.value = true
    mountCreateOk.value = false
    mountCreateResult.value = t('mountCreating')
    try {
      const addition = syncAddition()
      validateMountAddition(addition)
      const testMessage = options.skipDriverTest ? '' : await tryDriverTest(addition)
      const isUpdate = !!selectedStorageId.value
      const storagePath = isUpdate ? '/api/admin/storage/update' : '/api/admin/storage/create'
      const storageBody = isUpdate
        ? {
            ...(selectedStorage.value || {}),
            id: selectedStorageId.value,
            mount_path: verifyMountPath.value,
            driver: verifyDriver.value,
            addition,
            status: selectedStorage.value?.status || 'work',
            disabled: !!selectedStorage.value?.disabled,
          }
        : {
            mount_path: verifyMountPath.value,
            driver: verifyDriver.value,
            addition,
            order: 0,
          }
      const payload = await openListJson(storagePath, storageBody)
      await refreshMounts()
      mountCreateOk.value = true
      const title = isUpdate ? t('mountUpdate') : t('mountAdd')
      mountCreateResult.value = [
        testMessage,
        `${t(isUpdate ? 'mountUpdatePassed' : 'mountCreatePassed')}: id=${isUpdate ? selectedStorageId.value : payload.data?.id ?? ''}, path=${verifyMountPath.value}`,
      ].filter(Boolean).join(' / ')
      showMessage(`${title}: ${mountCreateResult.value}`)
      notifyChanged()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mountCreateResult.value = message
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
    selectedStorageId.value = null
    selectedStorage.value = null
    mountCreateOk.value = false
    mountCreateResult.value = ''
    verifyMountPath.value = defaultMountPathForDriver(verifyDriver.value)
    mountFormOpen.value = true
    loadDriverInfo()
  }

  async function editMount(item: any) {
    const storage = item?.id ? (await fetchOpenListJson(`/api/admin/storage/get?id=${encodeURIComponent(item.id)}`)).data : item
    loadingMountEdit = true
    try {
      selectedStorageId.value = Number(storage.id)
      selectedStorage.value = storage
      verifyMountPath.value = storage.mount_path || '/'
      verifyDriver.value = storage.driver || 'SiYuanWorkspace'
      await loadDriverInfoForEdit(verifyDriver.value)
      verifyAddition.value = JSON.stringify(parseAddition(storage.addition), null, 2)
      syncFormFromJson()
      mountCreateOk.value = true
      mountCreateResult.value = `${t('mountEditing')}: id=${selectedStorageId.value}, path=${verifyMountPath.value}`
    } finally {
      loadingMountEdit = false
    }
  }

  async function openEditMount(item: any) {
    await editMount(item)
    mountFormOpen.value = true
  }

  function closeMountForm() {
    stopDriverQrPolling()
    mountFormOpen.value = false
    driverVerifySmsCode.value = ''
    driverVerifySmsContext.value = null
    driverVerifySmsRequired.value = false
  }

  async function submitMount() {
    if (await saveMount())
      closeMountForm()
  }

  async function toggleMount(item: any) {
    const id = Number(item.id)
    if (!id)
      return
    await openListJson(item.disabled ? '/api/admin/storage/enable' : '/api/admin/storage/disable', { id })
    await refreshMounts()
    notifyChanged()
  }

  async function deleteMount(item: any) {
    const id = Number(item.id)
    if (!id)
      return
    confirm(t('mountDelete'), `${t('mountDelete')} ${item.mount_path || `#${id}`}?`, async () => {
      await openListJson('/api/admin/storage/delete', { id })
      if (selectedStorageId.value === id)
        clearMountEdit()
      await refreshMounts()
      notifyChanged()
    })
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
        verifyDriver.value = driverOptions.value[0] || 'SiYuanWorkspace'
      await loadDriverInfo()
    } catch {
      driverOptions.value = ['SiYuanWorkspace']
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
      await refreshMounts()
      await refreshStatus()
      notifyChanged()
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

  async function generateTorrent() {
    if (!torrentPath.value.trim()) {
      showMessage(t('torrentPathPlaceholder'), 3000, 'error')
      return
    }
    try {
      const payload = await fsTorrentGenerate({ path: torrentPath.value.trim() })
      if (payload.code !== 200)
        throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
      torrentData.value = payload.data?.torrent_data || ''
      torrentResult.value = JSON.stringify(payload.data || {}, null, 2)
      showMessage(t('torrentGenerated'))
    } catch (error) {
      torrentResult.value = error instanceof Error ? error.message : String(error)
      showMessage(torrentResult.value, 3000, 'error')
    }
  }

  async function parseTorrent() {
    if (!torrentData.value.trim()) {
      showMessage(t('torrentDataPlaceholder'), 3000, 'error')
      return
    }
    try {
      const payload = await fsTorrentParse({ torrent_data: torrentData.value.trim() })
      if (payload.code !== 200)
        throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
      torrentResult.value = JSON.stringify(payload.data || {}, null, 2)
      showMessage(t('torrentParsed'))
    } catch (error) {
      torrentResult.value = error instanceof Error ? error.message : String(error)
      showMessage(torrentResult.value, 3000, 'error')
    }
  }

  async function loadStorageList() {
    const payload = await fetchOpenListJson('/api/admin/storage/list')
    verifyStorages.value = payload.data?.content || payload.data || []
    return verifyStorages.value
  }

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent('siyuan-cloud:changed'))
  }

  async function refreshMounts() {
    await loadStorageList()
  }

  async function quietLoad(runner: () => Promise<unknown>) {
    try {
      await runner()
    } catch (error) {
      status.value = 'offline'
      statusDetail.value = error instanceof Error ? error.message : t('kernelUnavailable')
    }
  }

  async function notifyLoad(runner: () => Promise<unknown>) {
    try {
      await runner()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('kernelUnavailable')
      status.value = 'offline'
      statusDetail.value = message
      showMessage(message, 3000, 'error')
    }
  }

  async function loadShareList() {
    const payload = await fetchOpenListJson('/api/share/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, per_page: 1000 }),
    })
    shareItems.value = payload.data?.content || payload.data || []
    return shareItems.value
  }
  const refreshShareList = () => loadShareList()

  async function loadUserList() {
    const payload = await fetchOpenListJson('/api/admin/user/list')
    userItems.value = payload.data?.content || payload.data || []
    return userItems.value
  }

  function openAddUser() {
    selectedUserId.value = null
    userForm.value = defaultUserForm()
    userFormOpen.value = true
  }

  async function openEditUser(user: any) {
    const payload = await fetchOpenListJson(`/api/admin/user/get?id=${encodeURIComponent(user.id)}`)
    selectedUserId.value = Number(payload.data?.id || user.id)
    userForm.value = defaultUserForm(payload.data || user)
    userFormOpen.value = true
  }

  function closeUserForm() {
    userFormOpen.value = false
    selectedUserId.value = null
    userForm.value = {}
  }

  async function saveUser() {
    const isUpdate = !!selectedUserId.value
    const body = {
      id: selectedUserId.value,
      username: userForm.value.username,
      password: userForm.value.password,
      base_path: userForm.value.base_path || '/',
      permission: Number(userForm.value.permission || 0),
      disabled: !!userForm.value.disabled,
      allow_ldap: !!userForm.value.allow_ldap,
      sso_id: userForm.value.sso_id || '',
      role: selectedUserId.value ? userItems.value.find(item => Number(item.id) === selectedUserId.value)?.role : 0,
    }
    await openListJson(isUpdate ? '/api/admin/user/update' : '/api/admin/user/create', body)
    await loadUserList()
    closeUserForm()
    showMessage(t(isUpdate ? 'userUpdated' : 'userCreated'))
  }

  async function toggleUser(user: any) {
    await openListJson('/api/admin/user/update', {
      ...user,
      disabled: !user.disabled,
    })
    await loadUserList()
  }

  async function deleteUser(user: any) {
    confirm(t('userDelete'), `${t('userDelete')} ${user.username || user.id}?`, async () => {
      await openListJson('/api/admin/user/delete', { id: user.id })
      await loadUserList()
    })
  }

  async function cancelUser2fa(user: any) {
    await openListJson('/api/admin/user/cancel_2fa', { id: user.id })
    await loadUserList()
  }

  function shareDetail(item: any) {
    return [
      item?.id ? `id=${item.id}` : '',
      shareLinkPath(item),
      Array.isArray(item?.files) ? item.files.join(', ') : '',
      item?.pwd ? `${t('sharePwd')}=${item.pwd}` : '',
      `${t('shareAccessed')}=${shareAccessed(item)}`,
      item?.expires ? `expires=${item.expires}` : '',
    ].filter(Boolean).join(' / ')
  }

  function shareAccessed(item: any) {
    const accessed = Number(item?.accessed || 0)
    const max = Number(item?.max_accessed || 0)
    return max > 0 ? `${accessed} / ${max}` : String(accessed)
  }

  function shareFilesText(item: any) {
    return Array.isArray(item?.files) ? item.files.join('\n') : ''
  }

  function shareLinkPath(item: any) {
    const id = encodeURIComponent(String(item?.id || ''))
    return `${privateBase}/sd/${id}`
  }

  function shareDescription(item: any) {
    return item?.pwd ? `${shareLinkPath(item)} / ${t('sharePwd')}: ${item.pwd}` : shareLinkPath(item)
  }

  function shareStatus(item: any) {
    if (item?.disabled)
      return { key: 'disabled', text: t('disabled'), className: 'b3-chip--error' }
    const max = Number(item?.max_accessed || 0)
    const expired = item?.expires && Date.parse(item.expires) < Date.now()
    if ((max > 0 && Number(item?.accessed || 0) >= max) || expired || !Array.isArray(item?.files) || !item.files.length)
      return { key: 'invalid', text: t('shareInvalid'), className: 'b3-chip--warning' }
    return { key: 'work', text: t('enabled'), className: 'b3-chip--success' }
  }

  function shareTags(item: any) {
    return [
      { key: 'accessed', text: `${t('shareAccessed')}: ${shareAccessed(item)}`, className: 'b3-chip--info' },
      item?.expires ? { key: 'expires', text: new Date(item.expires).toLocaleString(), className: 'b3-chip--info' } : null,
      shareStatus(item),
    ].filter(Boolean) as Array<{ key: string, text: string, className: string }>
  }

  function defaultShareForm(share?: any) {
    return {
      id: share?.id || '',
      new_id: share?.id || '',
      files: shareFilesText(share),
      remark: share?.remark || '',
      extract_folder: share?.extract_folder || '',
      order_by: share?.order_by || '',
      order_direction: share?.order_direction || '',
      pwd: share?.pwd || '',
      max_accessed: Number(share?.max_accessed || 0),
      accessed: Number(share?.accessed || 0),
      expires: share?.expires || '',
      readme: share?.readme || '',
      header: share?.header || '',
      disabled: !!share?.disabled,
    }
  }

  function openEditShare(item: any) {
    selectedShareId.value = String(item?.id || '')
    shareForm.value = defaultShareForm(item)
    shareFormOpen.value = true
  }

  function closeShareForm() {
    selectedShareId.value = ''
    shareForm.value = {}
    shareFormOpen.value = false
  }

  async function saveShare() {
    const files = String(shareForm.value.files || '').split('\n').map(item => item.trim()).filter(Boolean)
    await openListJson('/api/share/update', {
      id: selectedShareId.value,
      new_id: shareForm.value.new_id || selectedShareId.value,
      files,
      remark: shareForm.value.remark || '',
      extract_folder: shareForm.value.extract_folder || '',
      order_by: shareForm.value.order_by || '',
      order_direction: shareForm.value.order_direction || '',
      pwd: shareForm.value.pwd || '',
      max_accessed: Number(shareForm.value.max_accessed || 0),
      accessed: Number(shareForm.value.accessed || 0),
      expires: shareForm.value.expires || null,
      readme: shareForm.value.readme || '',
      header: shareForm.value.header || '',
      disabled: !!shareForm.value.disabled,
    })
    await loadShareList()
    closeShareForm()
    showMessage(t('shareUpdated'))
  }

  async function shareUrl(item: any) {
    return openListShareUrl(shareLinkPath(item))
  }

  async function copyShare(item: any) {
    const url = await shareUrl(item)
    try {
      await navigator.clipboard.writeText(url)
      showMessage(t('routeCopied'))
    } catch {
      showMessage(url, 3000, 'info')
    }
  }

  async function toggleShare(item: any) {
    await openListJson(item?.disabled ? '/api/share/enable' : '/api/share/disable', { id: item.id })
    await loadShareList()
  }

  async function deleteShare(item: any) {
    confirm(t('shareDelete'), `${t('shareDelete')} ${item.id}?`, async () => {
      await openListJson('/api/share/delete', { id: item.id })
      if (selectedShareId.value === String(item.id))
        closeShareForm()
      await loadShareList()
    })
  }

  function openShareMenu(item: any, event: MouseEvent | KeyboardEvent) {
    const menu = new Menu('siyuan-cloud-share')
    menu.addItem({ icon: 'iconEdit', label: t('shareEdit'), click: () => openEditShare(item) })
    menu.addItem({ icon: item?.disabled ? 'iconEye' : 'iconEyeoff', label: item?.disabled ? t('shareEnable') : t('shareDisable'), click: () => toggleShare(item) })
    menu.addSeparator()
    menu.addItem({ icon: 'iconTrashcan', label: t('shareDelete'), click: () => deleteShare(item) })
    const target = event.currentTarget as HTMLElement | null
    const rect = target?.getBoundingClientRect()
    const x = event instanceof MouseEvent ? event.clientX : rect?.left || 0
    const y = event instanceof MouseEvent ? event.clientY : rect?.bottom || 0
    menu.open({ x, y })
  }

  async function loadTaskList() {
    const payload = await fetchOpenListJson(`/api/task/${taskType.value}/${taskDone.value}`)
    taskItems.value = Array.isArray(payload.data) ? payload.data : []
    return taskItems.value
  }

  async function taskPost(action: string, id = '') {
    await openListJson(`/api/task/${taskType.value}/${action}${id ? `?tid=${encodeURIComponent(id)}` : ''}`)
    await loadTaskList()
  }

  function taskTypeLabel(type: string) {
    return tFallback(`taskType.${type}`, type.replace(/_/g, ' '))
  }

  function taskStateLabel(state: string) {
    return tFallback(`taskState.${state}`, state || t('unknown'))
  }

  function taskDetail(task: any) {
    return [task?.status, task?.error].filter(Boolean).join(' / ') || task?.id || ''
  }

  function taskTags(task: any) {
    const state = String(task?.state || '')
    const stateClass = state === 'succeeded'
      ? 'b3-chip--success'
      : state === 'failed'
        ? 'b3-chip--error'
        : state === 'canceled'
          ? 'b3-chip--warning'
          : 'b3-chip--info'
    return [
      { key: 'state', text: taskStateLabel(state), className: stateClass },
      { key: 'progress', text: `${Math.round(Number(task?.progress || 0))}%`, className: 'b3-chip--info' },
      task?.creator ? { key: 'creator', text: task.creator, className: 'b3-chip--info' } : null,
    ].filter(Boolean) as Array<{ key: string, text: string, className: string }>
  }

  function taskActions(task: any) {
    if (taskDone.value === 'undone')
      return [{ key: 'cancel', icon: '#iconClose', label: t('taskCancel'), run: () => taskPost('cancel', task.id) }]
    const actions = []
    if (['failed', 'canceled'].includes(String(task?.state || '')))
      actions.push({ key: 'retry', icon: '#iconRefresh', label: t('taskRetry'), run: () => taskPost('retry', task.id) })
    actions.push({ key: 'delete', icon: '#iconTrashcan', label: t('deleteFile'), run: () => taskPost('delete', task.id) })
    return actions
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
    await refreshStatus()
    if (status.value !== 'online')
      return
    try {
      await loadDriverOptions()
      await loadStorageList()
      await loadShareList()
      await loadUserList()
      await loadExternalPreviews()
    } catch (error) {
      status.value = 'offline'
      statusDetail.value = error instanceof Error ? error.message : t('kernelUnavailable')
      showMessage(statusDetail.value, 3000, 'error')
    }
  }

  function openFileManager(path?: string) {
    window._siyuan_cloud?.openFileManager?.(path)
  }

  function openMountHelpDoc() {
    return window._siyuan_cloud?.openDriverDoc?.('')
  }

  function openDriverHelpDoc(driver = verifyDriver.value) {
    return window._siyuan_cloud?.openDriverDoc?.(driver) || openMountHelpDoc()
  }

  async function copyRoute() {
    const route = await openListShareUrl(`${privateBase}/`)
    try {
      await navigator.clipboard.writeText(route)
      showMessage(t('routeCopied'))
    } catch {
      showMessage(route, 3000, 'info')
    }
  }

  async function buildIndex() {
    try {
      const progress = await indexProgress()
      if (progress.code === 200 && progress.data?.is_done && Number(progress.data?.obj_count || 0) > 0) {
        showMessage(t('indexExists'))
        return
      }
      const payload = await indexBuild()
      if (payload.code !== 200 && !(payload.code === 400 && String(payload.message || '').includes('index is running')))
        throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
      showMessage(t('indexBuildStarted'))
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 4000, 'error')
    }
  }

  const sectionActions = computed(() => ({
    tools: [
      { key: 'buildIndex', icon: '#iconSearch', label: t('buildIndex'), run: buildIndex },
    ],
    config: [
      { key: 'export', icon: '#iconUpload', label: t('exportConfig'), run: exportConfig },
      { key: 'import', icon: '#iconDownload', label: t('importConfig'), run: importConfig },
    ],
    external: [
      { key: 'save', icon: '#iconCheck', label: t('saveExternalPreviews'), run: saveExternalPreviews },
    ],
    torrent: [
      { key: 'generate', icon: '#iconUpload', label: t('torrentGenerate'), run: generateTorrent },
      { key: 'parse', icon: '#iconList', label: t('torrentParse'), run: parseTorrent },
    ],
    tasks: [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: () => notifyLoad(loadTaskList) },
      ...(taskDone.value === 'done'
        ? [
            { key: 'retry', icon: '#iconPlay', label: t('taskRetryFailed'), run: () => notifyLoad(() => taskPost('retry_failed')) },
            { key: 'clear', icon: '#iconTrashcan', label: t('taskClearDone'), run: () => notifyLoad(() => taskPost('clear_done')) },
          ]
        : []),
    ],
    shares: [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: () => notifyLoad(loadShareList) },
    ],
    mounts: [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: () => notifyLoad(loadStorageList) },
      { key: 'help', icon: '#iconHelp', label: t('mountHelp'), run: openMountHelpDoc },
    ],
    users: [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: () => notifyLoad(loadUserList) },
      { key: 'add', icon: '#iconAdd', label: t('userAdd'), run: openAddUser },
    ],
    about: [
      { key: 'copy', icon: '#iconCopy', label: t('copyRoute'), run: copyRoute },
    ],
  }))

  watch([currentTab, dockCompactViews], () => {
    void saveDockSettings()
  }, { deep: true })
  watch(currentTab, async (tab) => {
    if (tab === 'shares')
      await quietLoad(loadShareList)
    else if (tab === 'users')
      await quietLoad(loadUserList)
    else if (tab === 'mounts')
      await quietLoad(loadStorageList)
    else if (tab === 'tasks')
      await quietLoad(loadTaskList)
    else if (tab === 'tools')
      await quietLoad(loadExternalPreviews)
  })
  watch([taskType, taskDone], () => {
    if (currentTab.value === 'tasks')
      quietLoad(loadTaskList)
  })
  watch(verifyDriver, async (driver) => {
    if (loadingMountEdit)
      return
    if (!selectedStorageId.value)
      verifyMountPath.value = defaultMountPathForDriver(driver)
    await loadDriverInfo()
  })
  onMounted(async () => {
    window.addEventListener('siyuan-cloud:shares-changed', refreshShareList)
    await loadDockSettings()
    await refreshAll()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('siyuan-cloud:shares-changed', refreshShareList)
    stopDriverQrPolling()
  })

  return {
    configText,
    currentTab,
    dockCompactViews,
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
    driverVerifySmsCode,
    driverVerifySmsRequired,
    exportAddition,
    externalPreviews,
    fieldHelp,
    fieldLabel,
    fieldOptionLabel,
    fieldOptions,
    importAddition,
    mountCreateOk,
    mountCreateResult,
    mountCreating,
    mountFormOpen,
    docItems,
    openDriverHelpDoc,
    openFileManager,
    openAddMount,
    openEditMount,
    refreshDriverQrCode,
    submitDriverSmsCode,
    refreshAll,
    selectedStorageId,
    shareDescription,
    shareDetail,
    shareForm,
    shareFormOpen,
    shareItems,
    shareTags,
    sectionActions,
    statusDetail,
    statusIcon,
    statusTitle,
    storageDescription,
    storageInfo,
    storageSyncLabel,
    storageTags,
    t,
    tabs,
    taskActions,
    taskDetail,
    taskDone,
    taskItems,
    taskTags,
    taskType,
    taskTypeLabel,
    taskTypes: TASK_TYPES,
    torrentData,
    torrentPath,
    torrentResult,
    closeMountForm,
    submitMount,
    toggleMount,
    toggleUser,
    userDetail,
    userForm,
    userFormOpen,
    userItems,
    userTags,
    userPermissionChecked,
    userPermissionFormSummary,
    userPermissionLabel,
    userPermissionOptions: USER_PERMISSION_KEYS,
    toggleUserPermission,
    verifyAddition,
    verifyDriver,
    verifyMountPath,
    verifyStorages,
    cancelUser2fa,
    closeUserForm,
    deleteUser,
    openAddUser,
    openEditShare,
    openShareMenu,
    openEditUser,
    closeShareForm,
    saveShare,
    saveUser,
  }
}
