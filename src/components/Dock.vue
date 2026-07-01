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
      <template v-if="currentTab === 'tasks'">
        <div class="ol-mount-list">
          <div class="ol-mount-form">
            <label class="ol-field">
              <span>{{ t('taskType') }}</span>
              <select v-model="taskType" class="b3-select">
                <option v-for="type in taskTypes" :key="type" :value="type">{{ taskTypeLabel(type) }}</option>
              </select>
            </label>
            <label class="ol-field">
              <span>{{ t('taskStatus') }}</span>
              <select v-model="taskDone" class="b3-select">
                <option value="undone">{{ t('taskUndone') }}</option>
                <option value="done">{{ t('taskDone') }}</option>
              </select>
            </label>
          </div>
          <DockRow v-if="!taskItems.length" icon="#iconList" :title="t('taskEmpty')" :desc="`${taskTypeLabel(taskType)} / ${taskDone === 'done' ? t('taskDone') : t('taskUndone')}`" />
          <DockRow v-for="item in taskItems" :key="item.id" icon="#iconList" :title="item.name || item.id" :desc="taskDetail(item)" :tags="taskTags(item)" :actions="taskActions(item)" />
        </div>
      </template>

      <template v-else-if="currentTab === 'tools'">
        <div class="ol-mount-list">
          <div class="ol-mount-form">
            <DockSectionHeader icon="#iconSettings" :title="t('configImportExport')" :actions="sectionActions.config" />
            <textarea v-model="configText" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('configJsonPlaceholder')" />
          </div>

          <div class="ol-mount-form">
            <DockSectionHeader icon="#iconOpen" :title="t('externalPreviews')" :actions="sectionActions.external" />
            <textarea v-model="externalPreviews" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('externalPreviewsHelp')" />
          </div>

          <div class="ol-mount-form">
            <DockSectionHeader icon="#iconList" :title="t('torrentTools')" :actions="sectionActions.torrent" />
            <label class="ol-field">
              <span>{{ t('torrentPath') }}</span>
              <input v-model="torrentPath" class="b3-text-field" type="text" :placeholder="t('torrentPathPlaceholder')">
            </label>
            <label class="ol-field">
              <span>{{ t('torrentData') }}</span>
              <textarea v-model="torrentData" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('torrentDataPlaceholder')" />
            </label>
            <textarea v-if="torrentResult" class="b3-text-field ol-addition" readonly spellcheck="false" :value="torrentResult" />
          </div>
        </div>
      </template>

      <template v-else-if="currentTab === 'status'">
        <div class="ol-mount-list">
          <DockRow :icon="statusIcon" :title="statusTitle" :desc="statusDetail" />
          <DockRow icon="#iconFile" :title="t('stateFile')" :desc="storageInfo.state_file || '/storage/petal/siyuan-cloud/config.json'" />
          <DockRow icon="#iconRefresh" :title="t('sync')" :desc="storageSyncLabel" />
          <DockRow icon="#iconHelp" :title="t('openHelp')" :desc="t('pluginHelp')" :open="openReadmeDoc" />
          <DockRow icon="#iconOpen" :title="t('openApi')" :desc="storageInfo.source || t('waitingStatus')" :open="openApiDoc" />
          <DockRow v-for="item in docItems" :key="item.key" :icon="item.icon" :title="item.title" :desc="item.desc" :open="() => openPackagedDoc(item.key)" />
        </div>
      </template>

      <template v-else-if="currentTab === 'mounts'">
        <div class="ol-mount-list">
          <template v-for="entry in mountEntries" :key="entry.key">
            <DockRow v-if="entry.type === 'mount'" icon="#iconDatabase" :title="mountPath(entry.item)" :desc="storageDescription(entry.item)" :tags="storageTags(entry.item)" :actions="mountActions(entry.item)" :open="() => openMount(entry.item)" />
            <DockRow v-else-if="entry.type === 'add'" icon="#iconAdd" :title="t('mountAdd')" :desc="t('verifyStorageDriver')" :open="openAddMount" />
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
                <label v-else-if="row.field" :class="row.field.type === 'bool' ? 'b3-list-item b3-list-item--narrow' : 'ol-field'">
                  <span :class="{ 'b3-list-item__text': row.field.type === 'bool' }" :title="row.field.name">{{ fieldLabel(row.field) }}{{ row.field.required ? ' *' : '' }}</span>
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
          </template>
        </div>
      </template>

      <template v-else-if="currentTab === 'users'">
        <div class="ol-mount-list">
          <DockRow v-for="(item, index) in userItems" :key="item.id || item.username" :style="{ order: index * 2 }" icon="#iconAccount" :title="item.username" :desc="userDetail(item)" :tags="userTags(item)" :actions="userActions(item)">
              <template #tags>
                <button v-if="item.otp" class="b3-chip b3-chip--small" type="button" @click.stop="cancelUser2fa(item)">{{ t('userCancel2fa') }}</button>
              </template>
          </DockRow>
          <DockRow v-if="!userFormOpen" :style="{ order: userItems.length * 2 }" icon="#iconAdd" :title="t('userAdd')" :desc="t('userAddHelp')" :open="openAddUser" />
          <div v-else class="ol-mount-form" :style="{ order: userFormOrder }">
              <label class="ol-field"><span>{{ t('verifyUsername') }}</span><input v-model="userForm.username" class="b3-text-field" type="text"></label>
              <label class="ol-field"><span>{{ t('verifyPassword') }}</span><input v-model="userForm.password" class="b3-text-field" type="password" :placeholder="t('userPasswordPlaceholder')"></label>
              <label class="ol-field"><span>{{ t('userBasePath') }}</span><input v-model="userForm.base_path" class="b3-text-field" type="text"></label>
              <div class="ol-driver-fields">
                <button class="b3-list-item b3-list-item--narrow" type="button" @pointerdown.prevent.stop @click.stop="userPermissionOpen = !userPermissionOpen">
                  <span class="b3-list-item__text">{{ t('userPermission') }}</span>
                  <span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" :aria-label="userPermissionFormSummary()">{{ userPermissionFormSummary() }}</span>
                  <span class="b3-list-item__action ol-fold-action" :aria-label="userPermissionOpen ? t('collapse') : t('expand')">
                    <svg class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': userPermissionOpen }"><use xlink:href="#iconRight" /></svg>
                  </span>
                </button>
                <div v-if="userPermissionOpen" class="ol-driver-fields">
                  <label v-for="(permission, index) in userPermissionOptions" :key="permission" class="b3-list-item b3-list-item--narrow">
                    <span class="b3-list-item__text">{{ userPermissionLabel(permission) }}</span>
                    <input class="b3-switch fn__flex-center" type="checkbox" :checked="userPermissionChecked(index)" @change="onUserPermissionChange(index, $event)">
                  </label>
                </div>
              </div>
              <label class="b3-list-item b3-list-item--narrow"><span class="b3-list-item__text">{{ t('userDisabled') }}</span><input v-model="userForm.disabled" class="b3-switch fn__flex-center" type="checkbox"></label>
              <div class="ol-mount-form__actions">
                <button class="b3-button b3-button--outline" type="button" @click="closeUserForm">{{ t('cancel') }}</button>
                <button class="b3-button" type="button" @click="saveUser">{{ t('confirmAction') }}</button>
              </div>
          </div>
          <DockRow v-if="!userItems.length" icon="#iconAccount" :title="t('userEmpty')" />
        </div>
      </template>

      <template v-else>
        <div class="ol-mount-list">
          <DockRow v-for="(item, index) in shareItems" :key="item.id || item.sid" :style="{ order: index * 2 }" icon="#iconLink" :title="item.remark || item.id" :desc="shareDescription(item)" :detail="shareDetail(item)" :tags="shareTags(item)" :actions="shareActions(item)" />
          <div v-if="shareFormOpen" class="ol-mount-form" :style="{ order: shareFormOrder }">
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
          <DockRow v-if="!shareItems.length" icon="#iconLink" :title="t('shareEmpty')" />
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
  isArchiveFileName,
  openArchiveBrowser,
} from '@/utils/archive'
import {
  copyOpenListItemLink,
  deleteOpenListSelection,
  downloadOpenListItem,
  fallbackTranslator,
  itemOpenListPath,
  joinOpenListPath,
  normalizeOpenListPath,
  openOpenListFileItemMenu,
  shareOpenListSelection,
} from '@/utils/file_actions'
import {
  openListFileIconHref,
  openListFileIconName,
} from '@/utils/icon'
import {
  itemOpenUrl as openListItemOpenUrl,
  escapeAttr,
  escapeHtml,
  formatSize as formatByteSize,
  openLazyImageViewer,
  showErrorMessage,
} from '@/utils/file_ui'

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
    if (!props.open)
      return
    event.stopPropagation()
    props.open(event)
  }
  return h('div', {
    class: 'ol-mount-row b3-list-item--hide-action',
    role: props.open ? 'button' : undefined,
    style: props.style,
    tabindex: props.open ? 0 : undefined,
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

const plugin = usePlugin()

const {
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
  openApiDoc,
  openReadmeDoc,
  docItems,
  openPackagedDoc,
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
  taskActions,
  taskDetail,
  taskDone,
  taskItems,
  taskTags,
  taskType,
  taskTypeLabel,
  taskTypes,
  torrentData,
  torrentPath,
  torrentResult,
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
  verifyMountPath,
  verifyStorages,
} = useDock(plugin)

const onUserPermissionChange = (index: number, event: Event) => {
  toggleUserPermission(index, (event.target as HTMLInputElement | null)?.checked === true)
}

const pageActionMap: Record<string, keyof typeof sectionActions.value> = {
  mounts: 'mounts',
  shares: 'shares',
  status: 'about',
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
const primaryDriverFieldNames = computed(() => new Set(verifyDriver.value === '115 Cloud' || verifyDriver.value === '115' ? ['root_folder_id', 'cookie', 'qrcode_token', 'qrcode_source'] : []))
const driverFormRows = computed(() => {
  const primary = driverFields.value.filter(field => field.required || primaryDriverFieldNames.value.has(field.name))
  const primaryNames = new Set(primary.map(field => field.name))
  const optional = driverFields.value.filter(field => !primaryNames.has(field.name))
  return [
    ...primary.map(field => ({ key: field.name, field })),
    ...(optional.length ? [{ key: '__more', more: true }] : []),
    ...(mountMoreOpen.value ? optional.map(field => ({ key: field.name, field })) : []),
  ]
})

const mountPath = (item: any) => normalizePath(item?.mount_path || item?.path || '/')
const mountEntries = computed(() => [
  ...verifyStorages.value.flatMap(item => [{ type: 'mount', key: item.id || item.mount_path, item }, ...(mountFormOpen.value && Number(item.id) === selectedStorageId.value ? [{ type: 'form', key: 'form' }] : [])]),
  mountFormOpen.value && !selectedStorageId.value ? { type: 'form', key: 'form' } : { type: 'add', key: 'add' },
])
const formOrder = (items: any[], selected: any, key: (item: any) => any) => {
  const index = items.findIndex(item => String(key(item)) === String(selected))
  return index >= 0 ? index * 2 + 1 : items.length * 2 + 1
}
const userFormOrder = computed(() => formOrder(userItems.value, userForm.value.id, item => item.id || item.username))
const shareFormOrder = computed(() => formOrder(shareItems.value, shareForm.value.id, item => item.id || item.sid))
const openMount = (item: any) => openFileManager(mountPath(item))
const mountActions = (item: any) => [{ key: 'edit', icon: '#iconEdit', label: t('mountEdit'), run: () => openEditMount(item) }, { key: 'toggle', icon: item.disabled ? '#iconEye' : '#iconEyeoff', label: item.disabled ? t('mountEnable') : t('mountDisable'), run: () => toggleMount(item) }, { key: 'delete', icon: '#iconTrashcan', label: t('mountDelete'), run: () => deleteMount(item) }]
const shareActions = (item: any) => [{ key: 'copy', icon: '#iconCopy', label: t('copyRoute'), run: () => copyShare(item) }, { key: 'more', icon: '#iconMore', label: t('more'), run: event => openShareMenu(item, event as MouseEvent | KeyboardEvent) }]
const userActions = (item: any) => [{ key: 'edit', icon: '#iconEdit', label: t('userEdit'), run: () => openEditUser(item) }, { key: 'toggle', icon: item.disabled ? '#iconEye' : '#iconEyeoff', label: item.disabled ? t('userEnable') : t('userDisable'), run: () => toggleUser(item) }, ...(Number(item.role) === 1 || Number(item.role) === 2 ? [] : [{ key: 'delete', icon: '#iconTrashcan', label: t('userDelete'), run: () => deleteUser(item) }])]

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
const isArchiveFile = (item: DockTreeItem) => !item.is_dir && isArchiveFileName(item.name)
const itemOpenUrl = (item: DockTreeItem) => openListItemOpenUrl(item, node => node.path)
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
    if (isArchiveFile(node)) {
      await browseTreeArchive(node)
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

async function downloadTreeItem(item: DockTreeItem) {
  await downloadOpenListItem({ item, itemPath: treeItemPath, resolveUrl: resolveDownloadUrl })
}

async function browseTreeArchive(item: DockTreeItem) {
  const tfLocal = (key: string, fallback: string) => {
    const value = t(key)
    return value === key ? fallback : value
  }
  await openArchiveBrowser({
    archivePath: item.path,
    tf: tfLocal,
    title: `${tfLocal('browseArchive', 'Browse archive')} - ${item.name}`,
  })
}

async function copyTreeLink(item: DockTreeItem, path: string) {
  await copyOpenListItemLink({ item, path, t })
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
    tf: fallbackTranslator(t),
  })
}

async function shareTreeSelection() {
  await shareOpenListSelection({ itemPath: treeItemPath, items: selectedTreeItems.value, tf: fallbackTranslator(t) })
}

function onTreeContextMenu(event: MouseEvent) {
  const li = (event.target as HTMLElement).closest('li[data-path]') as HTMLElement | null
  const node = li ? visibleNodeMap.value.get(li.dataset.path || '') : null
  if (!node)
    return
  openOpenListFileItemMenu({
    browseArchive: isArchiveFile(node) ? browseTreeArchive : undefined,
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
    shareSelection: shareTreeSelection,
    t,
    tf: fallbackTranslator(t),
  })
}

async function resolveDownloadUrl(path: string) {
  const local = visibleNodes.value.find(item => item.path === path)
  if (local?.raw_url || local?.url)
    return itemOpenUrl(local)
  return (await resolveOpenListFile(path)).url
}

async function openImageViewer(item: DockTreeItem) {
  await openLazyImageViewer({
    current: item,
    items: visibleNodes.value.filter(isImageFile),
    keyOf: node => node.path,
    onError: showErrorMessage,
    urlOf: node => resolveDownloadUrl(node.path),
  })
}

function formatSize(size = 0) {
  return formatByteSize(size, true)
}



onMounted(() => {
  window.addEventListener('siyuan-cloud:changed', refreshTree)
  loadPath('/')
})
onBeforeUnmount(() => {
  window.removeEventListener('siyuan-cloud:changed', refreshTree)
})
</script>
