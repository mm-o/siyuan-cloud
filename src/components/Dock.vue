<template>
  <section class="ol-dock dockPanel fn__flex-1 fn__flex-column">
    <nav class="block__icons fn__hidescrollbar" aria-label="Siyuan Cloud management">
      <template
        v-for="tab in tabs"
        :key="tab.key"
      >
        <DockActionButton :icon="tab.icon" :label="t(tab.labelKey)" :active="currentTab === tab.key" @run="currentTab = tab.key" />
        <span class="fn__space" />
      </template>
      <span class="fn__flex-1" />
    </nav>

    <DockSectionHeader :icon="currentPage.icon" :title="t(currentPage.labelKey)" :actions="currentPageActions" />
    <section
      v-if="currentTab === 'files'"
      class="fn__flex-1 fn__flex-column file-tree sy__file"
      @pointerdown.stop
      @click.stop
      @contextmenu.prevent.stop="onTreeContextMenu"
    >
      <div
        class="fn__flex-1 fn__hidescrollbar"
        @click="onTreeClick"
        @mouseover.stop
        v-html="treeHtml"
      />
    </section>

    <main
      v-else
      class="ol-body"
      @pointerdown.stop
      @click.stop
      @input.stop
      @change.stop
      @contextmenu.stop
    >
      <template v-if="currentTab === 'settings'">
        <DockSectionHeader icon="#iconSettings" :title="t('configImportExport')" :actions="sectionActions.config" />
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <textarea v-model="configText" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('configJsonPlaceholder')" />
          </div>
        </div>

        <DockSectionHeader icon="#iconOpen" :title="t('externalPreviews')" :actions="sectionActions.external" />
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <label class="ol-field">
              <textarea v-model="externalPreviews" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('externalPreviewsHelp')" />
              <small>{{ t('externalPreviewsHelp') }}</small>
            </label>
          </div>
        </div>
      </template>

      <template v-else-if="currentTab === 'tasks'">
        <div class="b3-list b3-list--background">
          <div v-for="item in verifyLog" :key="item.id" class="b3-list-item">
            <svg class="b3-list-item__graphic" :class="{ 'ft__error': !item.ok }"><use :xlink:href="item.ok ? '#iconCheck' : '#iconClose'" /></svg>
            <span class="b3-list-item__text">{{ item.title }}</span>
            <span class="b3-list-item__meta">{{ item.detail }}</span>
          </div>
          <div v-if="!verifyLog.length" class="b3-list--empty">{{ t('verifyEmpty') }}</div>
        </div>
      </template>

      <template v-else-if="currentTab === 'users'">
        <div class="ol-mount-list">
          <DockRow v-for="item in userItems" :key="item.id || item.username" icon="#iconAccount" :title="item.username" :desc="userDetail(item)" :tags="userTags(item)" :actions="userActions(item)">
            <template #tags>
              <button v-if="item.otp" class="b3-chip b3-chip--small" type="button" @click.stop="cancelUser2fa(item)">{{ t('userCancel2fa') }}</button>
            </template>
          </DockRow>
          <DockRow v-if="!userFormOpen" icon="#iconAdd" :title="t('userAdd')" :desc="t('userAddHelp')" clickable @open="openAddUser" />
          <div v-else class="ol-mount-form">
            <label class="ol-field">
              <span>{{ t('verifyUsername') }}</span>
              <input v-model="userForm.username" class="b3-text-field" type="text">
            </label>
            <label class="ol-field">
              <span>{{ t('verifyPassword') }}</span>
              <input v-model="userForm.password" class="b3-text-field" type="password" :placeholder="t('userPasswordPlaceholder')">
            </label>
            <label class="ol-field">
              <span>{{ t('userBasePath') }}</span>
              <input v-model="userForm.base_path" class="b3-text-field" type="text">
            </label>
            <div class="ol-user-permission">
              <button class="b3-list-item b3-list-item--narrow" type="button" @pointerdown.prevent.stop @click.stop="userPermissionOpen = !userPermissionOpen">
                <span class="b3-list-item__text">{{ t('userPermission') }}</span>
                <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="userPermissionFormSummary()">{{ userPermissionFormSummary() }}</span>
                <span class="b3-list-item__action ol-fold-action" :aria-label="userPermissionOpen ? t('collapse') : t('expand')">
                  <svg class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': userPermissionOpen }"><use xlink:href="#iconRight" /></svg>
                </span>
              </button>
              <div v-if="userPermissionOpen" class="ol-permissions">
                <label
                  v-for="(permission, index) in userPermissionOptions"
                  :key="permission"
                  class="b3-list-item b3-list-item--narrow ol-permission"
                >
                  <span class="b3-list-item__text">{{ userPermissionLabel(permission) }}</span>
                  <input class="b3-switch fn__flex-center" type="checkbox" :checked="userPermissionChecked(index)" @change="onUserPermissionChange(index, $event)">
                </label>
              </div>
            </div>
            <label class="b3-list-item b3-list-item--narrow">
              <span class="b3-list-item__text">{{ t('userDisabled') }}</span>
              <input v-model="userForm.disabled" class="b3-switch fn__flex-center" type="checkbox">
            </label>
            <div class="ol-mount-form__actions">
              <button class="b3-button b3-button--outline" type="button" @click="closeUserForm">{{ t('cancel') }}</button>
              <button class="b3-button" type="button" @click="saveUser">{{ t('confirmAction') }}</button>
            </div>
          </div>
          <div v-if="!userItems.length" class="b3-list--empty">{{ t('userEmpty') }}</div>
        </div>
      </template>

      <template v-else-if="currentTab === 'shares'">
        <div class="ol-mount-list">
          <DockRow v-for="item in shareItems" :key="item.id || item.sid" icon="#iconLink" :title="item.remark || item.id" :desc="shareDescription(item)" :detail="shareDetail(item)" :tags="shareTags(item)" :actions="shareActions(item)" />
          <div v-if="shareFormOpen" class="ol-mount-form">
            <label class="ol-field"><span>{{ t('shareId') }}</span><input v-model="shareForm.new_id" class="b3-text-field" type="text"></label>
            <label class="ol-field"><span>{{ t('shareFiles') }}</span><textarea v-model="shareForm.files" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('shareFilesPlaceholder')" /></label>
            <label class="ol-field"><span>{{ t('shareRemark') }}</span><input v-model="shareForm.remark" class="b3-text-field" type="text"></label>
            <label class="ol-field"><span>{{ t('sharePwd') }}</span><input v-model="shareForm.pwd" class="b3-text-field" type="text" :placeholder="t('sharePasswordPlaceholder')"></label>
            <label class="ol-field"><span>{{ t('shareMaxAccessed') }}</span><input v-model.number="shareForm.max_accessed" class="b3-text-field" type="number" min="0"></label>
            <label class="ol-field"><span>{{ t('shareAccessed') }}</span><input v-model.number="shareForm.accessed" class="b3-text-field" type="number" min="0"></label>
            <label class="ol-field"><span>{{ t('shareExpires') }}</span><input v-model="shareForm.expires" class="b3-text-field" type="text" placeholder="yyyy-MM-dd HH:mm:ss"></label>
            <label class="ol-field"><span>{{ t('shareReadme') }}</span><textarea v-model="shareForm.readme" class="b3-text-field ol-addition" spellcheck="false" /></label>
            <label class="ol-field"><span>{{ t('shareHeader') }}</span><textarea v-model="shareForm.header" class="b3-text-field ol-addition" spellcheck="false" /></label>
            <label class="b3-list-item b3-list-item--narrow"><span class="b3-list-item__text">{{ t('shareDisabled') }}</span><input v-model="shareForm.disabled" class="b3-switch fn__flex-center" type="checkbox"></label>
            <div class="ol-mount-form__actions">
              <button class="b3-button b3-button--outline" type="button" @click="closeShareForm">{{ t('cancel') }}</button>
              <button class="b3-button" type="button" @click="saveShare">{{ t('confirmAction') }}</button>
            </div>
          </div>
          <div v-if="!shareItems.length" class="b3-list--empty">{{ t('shareEmpty') }}</div>
        </div>
      </template>

      <template v-else-if="currentTab === 'about'">
        <div class="b3-list b3-list--background">
          <div class="b3-list-item">
            <svg class="b3-list-item__graphic" :class="{ 'ft__error': statusClass.offline }"><use :xlink:href="statusIcon" /></svg>
            <span class="b3-list-item__text">{{ statusTitle }}</span>
            <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="statusDetail">{{ statusDetail }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ t('stateFile') }}</span>
            <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="storageInfo.state_file || '/storage/petal/siyuan-cloud/config.json'">{{ storageInfo.state_file || '/storage/petal/siyuan-cloud/config.json' }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ t('sync') }}</span>
            <span class="b3-list-item__meta">{{ storageSyncLabel }}</span>
          </div>
          <div class="b3-list-item">
            <span class="b3-list-item__text">{{ storageInfo.source || t('waitingStatus') }}</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="ol-mount-list">
          <DockRow v-for="item in verifyStorages" :key="item.id || item.mount_path" icon="#iconDatabase" :title="mountPath(item)" :desc="storageDescription(item)" :tags="storageTags(item)" :actions="mountActions(item)" clickable @open="openMount(item)" />
          <button v-if="!mountFormOpen" class="ol-mount-row b3-list-item--hide-action" type="button" @click.stop="openAddMount">
            <span class="ol-mount-row__cover"><svg><use xlink:href="#iconAdd" /></svg></span>
            <span class="ol-mount-row__title ariaLabel" :aria-label="t('mountAdd')">{{ t('mountAdd') }}</span>
            <span class="ol-mount-row__desc ariaLabel" :aria-label="t('verifyStorageDriver')">{{ t('verifyStorageDriver') }}</span>
          </button>
          <div v-else class="ol-mount-form">
            <label class="ol-field">
              <span>{{ t('verifyMountPath') }}</span>
              <input v-model="verifyMountPath" class="b3-text-field" type="text">
            </label>
            <label class="ol-field">
              <span>{{ t('verifyStorageDriver') }}</span>
              <select v-model="verifyDriver" class="b3-select">
                <option v-for="driver in driverOptions" :key="driver" :value="driver">{{ driverDisplayName(driver) }}</option>
              </select>
            </label>
            <small v-if="selectedStorageId">{{ t('mountEditing') }} #{{ selectedStorageId }}</small>
            <div v-if="driverInfo" class="ol-driver-note">
              <b>{{ driverDisplayName(driverInfo.config?.name || verifyDriver) }}</b>
              <span>{{ driverNote(driverInfo.config?.name || verifyDriver, driverInfo.config?.note || t('driverMetadataOnly')) }}</span>
            </div>
            <div v-if="driverQrLoginAvailable" class="ol-driver-note">
              <button class="b3-button b3-button--outline" type="button" :disabled="mountCreating || driverVerifyPolling" @click="refreshDriverQrCode">
                {{ driverVerifyPolling ? t('qrPolling') : t('qrRefresh') }}
              </button>
              <span>{{ driverVerifyMessage || t('qrRefreshHelp') }}</span>
              <img v-if="driverVerifyQrSrc" :src="driverVerifyQrSrc" :alt="t('qrScanPrompt')">
            </div>
            <div v-if="driverVerifySmsRequired" class="ol-driver-note ol-sms-verify">
              <span>{{ driverVerifyMessage || t('smsCodeRequired') }}</span>
              <div class="ol-inline-action">
                <input v-model="driverVerifySmsCode" class="b3-text-field" type="text" inputmode="numeric" autocomplete="one-time-code" :placeholder="t('smsCodePlaceholder')">
                <button class="b3-button" type="button" :disabled="mountCreating || !driverVerifySmsCode.trim()" @click="submitDriverSmsCode">{{ t('smsVerify') }}</button>
              </div>
            </div>
            <div class="ol-driver-fields">
              <template v-for="row in driverFormRows" :key="row.key">
                <button v-if="row.more" class="b3-list-item b3-list-item--narrow" type="button" @pointerdown.prevent.stop @click.stop="mountMoreOpen = !mountMoreOpen">
                  <span class="b3-list-item__text">{{ t('optionalFields') }}</span>
                  <span class="b3-list-item__meta b3-list-item__meta--ellipsis">{{ t('additionJsonShort') }}</span>
                  <span class="b3-list-item__action ol-fold-action" :aria-label="mountMoreOpen ? t('collapse') : t('expand')">
                    <svg class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': mountMoreOpen }"><use xlink:href="#iconRight" /></svg>
                  </span>
                </button>
                <label v-else-if="row.field" class="ol-field">
                  <span :title="row.field.name">{{ fieldLabel(row.field) }}{{ row.field.required ? ' *' : '' }}</span>
                  <select v-if="row.field.type === 'select'" v-model="driverForm[row.field.name]" class="b3-select">
                    <option v-for="option in fieldOptions(row.field)" :key="option" :value="option">{{ fieldOptionLabel(row.field, option) }}</option>
                  </select>
                  <input v-else-if="row.field.type === 'bool'" v-model="driverForm[row.field.name]" class="b3-switch fn__flex-center" type="checkbox">
                  <span v-else-if="isSecretField(row.field)" class="ol-secret-field">
                    <input
                      v-model="driverForm[row.field.name]"
                      class="b3-text-field"
                      :type="driverInputType(row.field)"
                    >
                    <button
                      class="block__icon block__icon--show ariaLabel"
                      type="button"
                      :aria-label="secretVisible[row.field.name] ? t('hide') : t('show')"
                      @click.stop="toggleSecret(row.field.name)"
                    >
                      <svg><use :xlink:href="secretVisible[row.field.name] ? '#iconEyeoff' : '#iconEye'" /></svg>
                    </button>
                  </span>
                  <input
                    v-else
                    v-model="driverForm[row.field.name]"
                    class="b3-text-field"
                    :type="driverInputType(row.field)"
                    :step="row.field.type === 'float' ? '0.1' : undefined"
                  >
                  <small v-if="fieldHelp(row.field)">{{ fieldHelp(row.field) }}</small>
                </label>
              </template>
              <template v-if="mountMoreOpen">
                <textarea v-model="verifyAddition" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('additionJson')" />
                <div class="ol-addition-actions">
                  <button class="b3-button b3-button--outline" type="button" @click="importAddition">{{ t('driverConfigImport') }}</button>
                  <button class="b3-button b3-button--outline" type="button" @click="exportAddition">{{ t('driverConfigExport') }}</button>
                </div>
              </template>
            </div>
            <div class="ol-mount-form__actions">
              <button class="b3-button b3-button--outline" type="button" @click="closeMountForm">{{ t('cancel') }}</button>
              <button class="b3-button" type="button" :disabled="mountCreating" @click="submitMount">{{ mountCreating ? t('mountCreating') : selectedStorageId ? t('mountUpdate') : t('mountAdd') }}</button>
            </div>
            <small v-if="mountCreateResult" :class="{ 'ft__error': !mountCreateOk }">{{ mountCreateResult }}</small>
          </div>
        </div>
      </template>
    </main>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
  watch,
} from 'vue'
import { showMessage } from 'siyuan'
import { usePlugin } from '@/main'
import {
  fsList,
  openListAbsoluteUrl,
  resolveOpenListFile,
} from '@/utils/api'
import { useDock } from '@/utils/dock'
import {
  deleteOpenListSelection,
  itemOpenListPath,
  joinOpenListPath,
  normalizeOpenListPath,
  openOpenListFileItemMenu,
} from '@/utils/file_actions'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import { privateBase } from '@/utils/request'

interface DockAction {
  key: string
  icon: string
  label: string
  run: (event?: MouseEvent | KeyboardEvent) => void | Promise<void>
}

interface DockTreeItem {
  name: string
  path: string
  size: number
  is_dir: boolean
  raw_url?: string
  url?: string
}

const DockActionButton = defineComponent({
  emits: ['run'],
  props: {
    active: { type: Boolean, default: false },
    icon: { type: String, required: true },
    label: { type: String, required: true },
    list: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const run = (event: MouseEvent | KeyboardEvent) => {
      event.stopPropagation()
      emit('run', event)
    }
    return () => h('span', {
      class: props.list
        ? 'b3-list-item__action b3-tooltips b3-tooltips__w'
        : ['block__icon block__icon--show ariaLabel', { 'block__icon--active': props.active }],
      'aria-label': props.label,
      'data-position': props.list ? undefined : 'west',
      role: 'button',
      tabindex: 0,
      onClick: run,
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ')
          return
        event.preventDefault()
        run(event)
      },
    }, [h('svg', [h('use', { 'xlink:href': props.icon })])])
  },
})

const DockSectionHeader = defineComponent({
  props: {
    actions: { type: Array as PropType<DockAction[]>, default: () => [] },
    icon: { type: String, required: true },
    title: { type: String, required: true },
  },
  setup(props) {
    return () => h('div', { class: 'b3-list-item' }, [
      h('svg', { class: 'b3-list-item__graphic' }, [h('use', { 'xlink:href': props.icon })]),
      h('span', { class: 'b3-list-item__text' }, props.title),
      ...props.actions.map(action =>
        h(DockActionButton, { icon: action.icon, label: action.label, list: true, onRun: action.run }),
      ),
    ])
  },
})

const DockRow = (props: any, { emit, slots }: any) => {
  const open = (event: MouseEvent | KeyboardEvent) => {
    if (!props.clickable)
      return
    event.stopPropagation()
    emit('open', event)
  }
  return h('div', {
    class: 'ol-mount-row b3-list-item--hide-action',
    role: props.clickable ? 'button' : undefined,
    tabindex: props.clickable ? 0 : undefined,
    onClick: open,
    onKeydown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open(event)
      }
    },
  }, [
    h('div', { class: 'ol-mount-row__cover' }, [h('svg', [h('use', { 'xlink:href': props.icon })])]),
    h('div', { class: 'ol-mount-row__title ariaLabel', 'aria-label': props.title }, props.title),
    ...(props.actions || []).map((action: DockAction) => h(DockActionButton, { icon: action.icon, label: action.label, list: true, onRun: action.run })),
    props.desc && h('div', { class: 'ol-mount-row__desc ariaLabel', 'aria-label': props.detail || props.desc }, props.desc),
    (props.tags?.length || slots.tags) && h('div', { class: 'ol-mount-tags' }, [
      ...props.tags?.map((tag: any) => h('span', { key: tag.key, class: ['b3-chip b3-chip--small ariaLabel', tag.className], 'aria-label': tag.text }, tag.text)) || [],
      slots.tags?.(),
    ]),
  ])
}
DockRow.emits = ['open']

const {
  accountInfo,
  cancelUser2fa,
  closeShareForm,
  closeUserForm,
  closeMountForm,
  configText,
  currentTab,
  deleteMount,
  deleteUser,
  driverDisplayName,
  driverFields,
  driverForm,
  driverInfo,
  driverOptions,
  driverNote,
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
  openAddMount,
  openAddUser,
  openFileManager,
  openEditMount,
  openEditShare,
  openShareMenu,
  openEditUser,
  refreshDriverQrCode,
  submitDriverSmsCode,
  saveShare,
  saveUser,
  selectedStorageId,
  shareDescription,
  shareDetail,
  shareForm,
  shareFormOpen,
  shareItems,
  shareTags,
  sectionActions,
  statusClass,
  statusDetail,
  statusIcon,
  statusTitle,
  storageDescription,
  storageInfo,
  storageSyncLabel,
  storageTags,
  submitMount,
  t,
  tabs,
  toggleMount,
  toggleUser,
  toggleUserPermission,
  userDetail,
  userForm,
  userFormOpen,
  userItems,
  userPermissionChecked,
  userPermissionFormSummary,
  userPermissionLabel,
  userPermissionOptions,
  userTags,
  verifyAddition,
  verifyDriver,
  verifyLogin,
  verifyLog,
  verifyMountPath,
  verifyPassword,
  verifySession,
  verifyStorages,
  verifyUsername,
} = useDock(usePlugin())

const onUserPermissionChange = (index: number, event: Event) => {
  toggleUserPermission(index, (event.target as HTMLInputElement | null)?.checked === true)
}

const pageActionMap: Record<string, keyof typeof sectionActions.value> = {
  about: 'about',
  mounts: 'mounts',
  shares: 'shares',
  tasks: 'tasks',
  users: 'users',
}

const currentPage = computed(() => tabs.find(tab => tab.key === currentTab.value) || tabs[0])
const currentPageActions = computed(() => {
  if (currentTab.value === 'files')
    return [
      { key: 'refresh', icon: '#iconRefresh', label: t('refresh'), run: refreshTree },
      { key: 'open', icon: '#iconFolder', label: t('openFileManager'), run: openFileManager },
    ]
  return sectionActions.value[pageActionMap[currentTab.value]] || []
})
const primaryDriverFieldNames = computed(() => {
  if (verifyDriver.value === '115 Cloud' || verifyDriver.value === '115')
    return new Set(['root_folder_id', 'cookie', 'qrcode_token', 'qrcode_source'])
  return new Set<string>()
})
const driverFormRows = computed(() => {
  const primary = driverFields.value.filter(field => field.required || primaryDriverFieldNames.value.has(field.name))
  const primaryNames = new Set(primary.map(field => field.name))
  const optional = driverFields.value.filter(field => !primaryNames.has(field.name))
  return [
    ...primary.map(field => ({ key: field.name, field })),
    { key: '__more', more: true },
    ...(mountMoreOpen.value ? optional.map(field => ({ key: field.name, field })) : []),
  ]
})

const mountPath = (item: any) => normalizePath(item?.mount_path || item?.path || '/')
const openMount = (item: any) => openFileManager(mountPath(item))
const mountActions = (item: any) => [{ key: 'edit', icon: '#iconEdit', label: t('mountEdit'), run: () => openEditMount(item) }, { key: 'toggle', icon: item.disabled ? '#iconEye' : '#iconEyeoff', label: item.disabled ? t('mountEnable') : t('mountDisable'), run: () => toggleMount(item) }, { key: 'delete', icon: '#iconTrashcan', label: t('mountDelete'), run: () => deleteMount(item) }]
const shareActions = (item: any) => [{ key: 'edit', icon: '#iconEdit', label: t('shareEdit'), run: () => openEditShare(item) }, { key: 'more', icon: '#iconMore', label: t('more'), run: event => openShareMenu(item, event as MouseEvent | KeyboardEvent) }]
const userActions = (item: any) => [{ key: 'edit', icon: '#iconEdit', label: t('userEdit'), run: () => openEditUser(item) }, { key: 'toggle', icon: item.disabled ? '#iconEye' : '#iconEyeoff', label: item.disabled ? t('userEnable') : t('userDisable'), run: () => toggleUser(item) }, { key: 'delete', icon: '#iconTrashcan', label: t('userDelete'), run: () => deleteUser(item) }]

const rootItems = ref<DockTreeItem[]>([])
const childrenByPath = ref<Record<string, DockTreeItem[]>>({})
const expandedPaths = ref<string[]>([])
const selectedTreePaths = ref<string[]>([])
const mountMoreOpen = ref(false)
const userPermissionOpen = ref(false)
const secretVisible = ref<Record<string, boolean>>({})
const loading = ref(false)
const lastError = ref('')
const emptyText = computed(() => lastError.value || t('rootEmpty'))
const imageExts = new Set('jpg,tiff,jpeg,png,gif,bmp,svg,ico,swf,webp,avif'.split(','))
const companionExts = new Set('mp3,wav,aac,m4a,flac,ogg,mp4,m3u8,webm,mov,m4v,mkv,avi,flv,wmv,epub,pdf,mobi,azw3,azw,fb2,cbz,txt'.split(','))
function isSecretField(field: any) {
  return field?.type === 'password' || /(?:password|passwd|pwd|token|secret|cookie|private)/i.test(String(field?.name || ''))
}
function driverInputType(field: any) {
  if (field?.type === 'number' || field?.type === 'float')
    return 'number'
  return isSecretField(field) && !secretVisible.value[field.name] ? 'password' : 'text'
}
function toggleSecret(name: string) {
  secretVisible.value[name] = !secretVisible.value[name]
}
watch(userFormOpen, (open) => {
  if (open)
    userPermissionOpen.value = false
})
const treeHtml = computed(() => {
  if (loading.value && !rootItems.value.length)
    return '<div class="fn__loading"></div>'
  if (!rootItems.value.length) {
    return `<ul class="b3-list b3-list--background"><li class="b3-list-item">
  <span class="b3-list-item__toggle fn__hidden"></span>
  <span class="b3-list-item__text ft__secondary">${escapeHtml(emptyText.value)}</span>
</li></ul>`
  }
  return rootItems.value
    .map(root => `<ul class="b3-list b3-list--background">${renderNode(root, 0)}</ul>`)
    .join('')
})
const visibleNodes = computed(() => {
  const nodes: DockTreeItem[] = []
  const walk = (items: DockTreeItem[]) => {
    for (const node of items) {
      nodes.push(node)
      if (node.is_dir && expandedPaths.value.includes(node.path))
        walk(childrenByPath.value[node.path] || [])
    }
  }
  walk(rootItems.value)
  return nodes
})
const visibleNodeMap = computed(() => new Map(visibleNodes.value.map(node => [node.path, node])))

function renderNode(node: DockTreeItem, level: number): string {
  const paddingLeft = level * 18
  const iconName = openListFileIconName(node.name, node.is_dir)
  const href = companionHref(node)
  const children = node.is_dir && expandedPaths.value.includes(node.path)
    ? childrenByPath.value[node.path] || []
    : []
  return `<li class="b3-list-item b3-list-item--hide-action" data-type="${level === 0 ? 'navigation-root' : 'navigation-file'}" data-path="${escapeAttr(node.path)}" style="--file-toggle-width:${paddingLeft + 18}px">
  <span style="padding-left:${paddingLeft}px" class="b3-list-item__toggle b3-list-item__toggle--hl${node.is_dir ? '' : ' fn__hidden'}">
    <svg class="b3-list-item__arrow${expandedPaths.value.includes(node.path) ? ' b3-list-item__arrow--open' : ''}"><use xlink:href="#iconRight"></use></svg>
  </span>
  <svg class="b3-list-item__graphic ol-file-row__icon ol-file-row__icon--${iconName}"><use xlink:href="${openListFileIconHref(node.name, node.is_dir)}"></use></svg>
  <span class="b3-list-item__text ariaLabel" data-position="parentE"${href ? ` data-href="${escapeAttr(href)}"` : ''} aria-label="${escapeAttr(node.name)}">${escapeHtml(node.name)}</span>${!node.is_dir && node.size ? `
  <span class="b3-list-item__meta">${formatSize(node.size)}</span>` : ''}
</li>${children.length ? `<ul style="--QYL-indent-1:${paddingLeft + 12}px">${children.map(child => renderNode(child, level + 1)).join('')}</ul>` : ''}`
}

function normalizePath(path: string) {
  return normalizeOpenListPath(path)
}

function joinPath(dir: string, name: string) {
  return joinOpenListPath(dir, name)
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

const isImageFile = (item: DockTreeItem) => !item.is_dir && imageExts.has(extensionOf(item.name))
const isCompanionFile = (item: DockTreeItem) => !item.is_dir && companionExts.has(extensionOf(item.name))
const docProxyUrl = (path: string) => decodeURI(encodeURI(`${privateBase}/p${path}`)).replace(/#/g, '%23').replace(/\?/g, '%3F')
const itemOpenUrl = (item: DockTreeItem) => String(item.raw_url || item.url || '') || docProxyUrl(item.path)
const companionHref = (item: DockTreeItem) => isCompanionFile(item) ? openListAbsoluteUrl(itemOpenUrl(item)) : undefined

function toTreeItem(item: any, dir: string): DockTreeItem {
  return {
    name: String(item?.name || ''),
    path: item?.path ? normalizePath(String(item.path)) : joinPath(dir, String(item?.name || '')),
    size: Number(item?.size || 0),
    is_dir: !!item?.is_dir,
    raw_url: item?.raw_url,
    url: item?.url,
  }
}

function sortItems(items: DockTreeItem[]) {
  return [...items].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
}

async function loadPath(path = '/', refresh = false) {
  const dir = normalizePath(path)
  if (!refresh && dir !== '/' && childrenByPath.value[dir])
    return true
  loading.value = true
  lastError.value = ''
  try {
    const payload = await fsList(dir, '', 1, 0, refresh)
    if (payload.code !== 200)
      throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
    const content = sortItems((payload.data?.content || []).map((item: any) => toTreeItem(item, dir)))
    if (dir === '/')
      rootItems.value = content
    else
      childrenByPath.value = { ...childrenByPath.value, [dir]: content }
    return true
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    showMessage(lastError.value, 3000, 'error')
    return false
  } finally {
    loading.value = false
  }
}

function refreshTree() {
  expandedPaths.value = []
  childrenByPath.value = {}
  selectedTreePaths.value = []
  loadPath('/', true)
}

async function openNode(node: DockTreeItem) {
  if (!node.is_dir) {
    if (isImageFile(node)) {
      await openImageViewer(node)
      return
    }
    if (!isCompanionFile(node))
      openFileManager(node.path)
    return
  }
  if (expandedPaths.value.includes(node.path)) {
    expandedPaths.value = expandedPaths.value.filter(path => path !== node.path)
    return
  }
  if (await loadPath(node.path))
    expandedPaths.value = [...expandedPaths.value, node.path]
}

function onTreeClick(event: MouseEvent) {
  const li = (event.target as HTMLElement).closest('li[data-path]') as HTMLElement | null
  const node = li ? visibleNodeMap.value.get(li.dataset.path || '') : null
  if (!node)
    return
  event.stopPropagation()
  openNode(node)
}

function treeItemPath(item: DockTreeItem) {
  return itemOpenListPath(item, '/')
}

function isTreeSelected(item: DockTreeItem) {
  return selectedTreePaths.value.includes(treeItemPath(item))
}

function selectOnlyTree(item: DockTreeItem) {
  selectedTreePaths.value = [treeItemPath(item)]
}

const selectedTreeItems = computed(() =>
  visibleNodes.value.filter(item => selectedTreePaths.value.includes(treeItemPath(item))),
)

function clearTreeSelection() {
  selectedTreePaths.value = []
}

function triggerDownload(url: string, filename?: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  if (filename)
    anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function downloadTreeItem(item: DockTreeItem) {
  if (item.is_dir)
    return
  triggerDownload(await resolveDownloadUrl(item.path), item.name)
}

async function copyTreeLink(item: DockTreeItem, path: string) {
  await navigator.clipboard?.writeText(openListAbsoluteUrl(docProxyUrl(path)))
  showMessage(t('linkCopied'), 2000)
}

function openTreeInFileManager() {
  const item = selectedTreeItems.value[0]
  openFileManager(item?.path || '/')
}

async function deleteTreeSelection() {
  await deleteOpenListSelection({
    clearSelection: clearTreeSelection,
    currentPath: '/',
    items: selectedTreeItems.value,
    refresh: refreshTree,
    t,
    tf: (key, fallback) => {
      const value = t(key)
      return value === key ? fallback : value
    },
  })
}

function onTreeContextMenu(event: MouseEvent) {
  const li = (event.target as HTMLElement).closest('li[data-path]') as HTMLElement | null
  const node = li ? visibleNodeMap.value.get(li.dataset.path || '') : null
  if (!node)
    return
  openOpenListFileItemMenu({
    copyLink: copyTreeLink,
    copySelection: openTreeInFileManager,
    deleteSelection: deleteTreeSelection,
    downloadItem: downloadTreeItem,
    event,
    isSelected: isTreeSelected,
    item: node,
    itemPath: treeItemPath,
    moveSelection: openTreeInFileManager,
    openFile: openNode,
    renameSelection: openTreeInFileManager,
    selectOnly: selectOnlyTree,
    shareSelection: openTreeInFileManager,
    t,
    tf: (key, fallback) => {
      const value = t(key)
      return value === key ? fallback : value
    },
  })
}

async function resolveDownloadUrl(path: string) {
  const local = visibleNodes.value.find(item => item.path === path)
  if (local?.raw_url || local?.url)
    return String(local.raw_url || local.url)
  return (await resolveOpenListFile(path)).url
}

function loadViewerScript() {
  if (document.getElementById('protyleViewerScript'))
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'protyleViewerScript'
    script.src = '/stage/protyle/js/viewerjs/viewer.js?v=1.11.7'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('viewer.js load failed'))
    document.head.appendChild(script)
  })
}

async function openImageViewer(item: DockTreeItem) {
  const siblings = visibleNodes.value.filter(isImageFile)
  const urls = await Promise.all(siblings.map(node => resolveDownloadUrl(node.path)))
  const currentUrl = await resolveDownloadUrl(item.path)
  await loadViewerScript()
  const imagesElement = document.createElement('ul')
  urls.filter(Boolean).forEach((url) => {
    const li = document.createElement('li')
    const img = document.createElement('img')
    img.src = encodeURI(url)
    li.appendChild(img)
    imagesElement.appendChild(li)
  })
  const initialViewIndex = Math.max(0, urls.findIndex(url => url === currentUrl))
  window.siyuan.viewer = new window.Viewer(imagesElement, {
    button: false,
    initialViewIndex,
    transition: false,
    hidden() {
      window.siyuan.viewer?.destroy?.()
    },
    toolbar: {
      close() {
        window.siyuan.viewer?.destroy?.()
      },
      flipHorizontal: true,
      flipVertical: true,
      next: true,
      oneToOne: true,
      play: true,
      prev: true,
      reset: true,
      rotateLeft: true,
      rotateRight: true,
      zoomIn: true,
      zoomOut: true,
    },
  })
  window.siyuan.viewer.show()
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string) {
  return escapeHtml(value)
}

function formatSize(size = 0) {
  if (!size)
    return ''
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}



onMounted(() => {
  window.addEventListener('siyuan-cloud:changed', refreshTree)
  loadPath('/')
})
onBeforeUnmount(() => {
  window.removeEventListener('siyuan-cloud:changed', refreshTree)
})
</script>
