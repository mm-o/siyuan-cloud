<template>
  <section class="ol-dock dockPanel fn__flex-1 fn__flex-column sy__file">
    <nav class="block__icons fn__hidescrollbar" aria-label="Siyuan Cloud management">
      <template
        v-for="tab in tabs"
        :key="tab.key"
      >
        <span
          class="block__icon block__icon--show ariaLabel"
          data-position="north"
          role="button"
          tabindex="0"
          :class="{ 'block__icon--active': currentTab === tab.key }"
          :aria-label="t(tab.labelKey)"
          @click="currentTab = tab.key"
          @keydown.enter.space.prevent="currentTab = tab.key"
        >
          <svg><use :xlink:href="tab.icon" /></svg>
        </span>
        <span class="fn__space" />
      </template>
      <span class="fn__flex-1" />
      <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('refreshStatus')" @click="refreshAll" @keydown.enter.space.prevent="refreshAll">
        <svg><use xlink:href="#iconRefresh" /></svg>
      </span>
      <span class="fn__space" />
      <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('openFileManager')" @click="openFileManager" @keydown.enter.space.prevent="openFileManager">
        <svg><use xlink:href="#iconFolder" /></svg>
      </span>
    </nav>

    <main class="ol-body">
      <section v-if="currentTab === 'settings'" class="ol-panel">
        <div class="ol-section-title">
          <svg><use xlink:href="#iconSettings" /></svg>
          <span>{{ t('openSettings') }}</span>
        </div>
        <div class="b3-label ol-card">
          <div class="ol-panel-block">
            <label class="ol-field">
              <span>{{ t('verifyUsername') }}</span>
              <input v-model="verifyUsername" class="b3-text-field" type="text">
            </label>
            <label class="ol-field">
              <span>{{ t('verifyPassword') }}</span>
              <input v-model="verifyPassword" class="b3-text-field" type="password">
            </label>
          </div>
          <div class="ol-actions">
            <button class="b3-button" type="button" @click="verifyLogin">{{ t('verifyLogin') }}</button>
            <button class="b3-button b3-button--outline" type="button" @click="loadMe">{{ t('loadMe') }}</button>
            <button class="b3-button b3-button--cancel" type="button" @click="logout">{{ t('logout') }}</button>
          </div>
        </div>
        <div class="b3-label ol-card ol-status-card">
          <div class="ol-status-line" :class="statusClass">
            <i />
            <b>{{ statusTitle }}</b>
            <span>{{ statusDetail }}</span>
          </div>
          <code>{{ accountInfo || verifySession || t('unknown') }}</code>
        </div>
        <div class="b3-label ol-card">
          <div class="ol-panel-block">
            <div class="ol-actions">
              <button class="b3-button b3-button--outline" type="button" @click="exportConfig">{{ t('exportConfig') }}</button>
              <button class="b3-button" type="button" @click="importConfig">{{ t('importConfig') }}</button>
            </div>
            <textarea v-model="configText" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('configJsonPlaceholder')" />
          </div>
        </div>
        <div class="b3-label ol-card ol-empty">
          <span>{{ t('stateFile') }}</span>
          <code>{{ storageInfo.state_file || '/storage/petal/siyuan-cloud/siyuan-cloud/state.json' }}</code>
          <span>{{ t('sync') }}: {{ storageSyncLabel }}</span>
        </div>
      </section>

      <section v-else-if="currentTab === 'tasks'" class="ol-panel">
        <div class="ol-section-title">
          <svg><use xlink:href="#iconList" /></svg>
          <span>{{ t('tabTask') }}</span>
        </div>
        <div class="b3-label ol-card">
          <div class="ol-panel-block">
            <div class="ol-actions">
              <button class="b3-button b3-button--outline" type="button" @click="verifyTaskList">{{ t('verifyTaskList') }}</button>
              <button class="b3-button" type="button" @click="runVerifySuite">{{ t('verifyRunAll') }}</button>
            </div>
          </div>
        </div>
        <ul class="b3-list b3-list--background">
          <li v-for="item in verifyLog" :key="item.id" class="b3-list-item">
            <span class="b3-list-item__graphic">{{ item.ok ? 'OK' : 'ERR' }}</span>
            <span class="b3-list-item__text">{{ item.title }}</span>
            <span class="b3-list-item__meta">{{ item.detail }}</span>
          </li>
          <li v-if="!verifyLog.length" class="b3-list-item">
            <span class="b3-list-item__text ft__on-surface">{{ t('verifyEmpty') }}</span>
          </li>
        </ul>
      </section>

      <section v-else-if="currentTab === 'shares'" class="ol-panel">
        <div class="ol-section-title">
          <svg><use xlink:href="#iconLink" /></svg>
          <span>{{ t('tabShares') }}</span>
        </div>
        <div class="b3-label ol-card ol-empty">{{ t('openFileManager') }}</div>
      </section>

      <section v-else-if="currentTab === 'about'" class="ol-panel">
        <div class="ol-section-title">
          <svg><use xlink:href="#iconInfo" /></svg>
          <span>{{ t('tabAbout') }}</span>
        </div>
        <div class="b3-label ol-card ol-empty">{{ storageInfo.source || t('waitingStatus') }}</div>
        <div class="b3-label ol-card">
          <div class="ol-actions">
            <button class="b3-button b3-button--outline" type="button" @click="openPrivateEntry">{{ t('openApi') }}</button>
            <button class="b3-button b3-button--outline" type="button" @click="copyRoute">{{ t('copyRoute') }}</button>
          </div>
        </div>
      </section>

      <section v-else class="ol-panel ol-mounts">
        <div class="ol-section-title">
          <svg><use xlink:href="#iconDatabase" /></svg>
          <span>{{ t('mountManageTitle') }}</span>
        </div>

        <div class="b3-list b3-list--background ol-mount-list">
          <div v-for="item in verifyStorages" :key="item.id || item.mount_path" class="b3-list-item b3-list-item--hide-action ol-mount-row">
            <div class="ol-mount-row__cover">
              <svg><use xlink:href="#iconDatabase" /></svg>
            </div>
            <div class="b3-list-item__text ol-mount-row__main">
              <div class="ol-mount-row__title ariaLabel" :aria-label="item.mount_path || item.path || '/'">{{ item.mount_path || item.path || '/' }}</div>
              <div class="ol-mount-row__desc ariaLabel" :aria-label="storageDescription(item)">{{ storageDescription(item) }}</div>
              <div class="ol-mount-tags">
                <span v-for="tag in storageTags(item)" :key="tag.key" class="ol-mount-tag ariaLabel" :class="tag.className" :aria-label="tag.text">{{ tag.text }}</span>
              </div>
            </div>
            <div class="ol-mount-row__actions">
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('mountEdit')" @click="openEditMount(item)" @keydown.enter.space.prevent="openEditMount(item)">
                <svg><use xlink:href="#iconEdit" /></svg>
              </span>
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="item.disabled ? t('mountEnable') : t('mountDisable')" @click="toggleMount(item)" @keydown.enter.space.prevent="toggleMount(item)">
                <svg><use :xlink:href="item.disabled ? '#iconEye' : '#iconEyeoff'" /></svg>
              </span>
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('mountDelete')" @click="deleteMount(item)" @keydown.enter.space.prevent="deleteMount(item)">
                <svg><use xlink:href="#iconTrashcan" /></svg>
              </span>
            </div>
          </div>
          <div v-if="!mountFormOpen" class="b3-list-item b3-list-item--hide-action ol-mount-row ol-add-card" role="button" tabindex="0" @click="openAddMount" @keydown.enter.space.prevent="openAddMount">
            <div class="ol-mount-row__cover">
              <svg><use xlink:href="#iconDatabase" /></svg>
            </div>
            <div class="b3-list-item__text ol-mount-row__main">
              <div class="ol-mount-row__title ariaLabel" :aria-label="t('mountAdd')">{{ t('mountAdd') }}</div>
              <div class="ol-mount-row__desc ariaLabel" :aria-label="t('verifyStorageDriver')">{{ t('verifyStorageDriver') }}</div>
            </div>
          </div>
          <div v-else class="ol-mount-form">
            <div class="block__icons">
              <div class="block__logo fn__flex-1">{{ selectedStorageId ? t('mountUpdate') : t('mountAdd') }}</div>
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" aria-label="关闭" @click="closeMountForm" @keydown.enter.space.prevent="closeMountForm">
                <svg><use xlink:href="#iconClose" /></svg>
              </span>
            </div>

            <div class="ol-mount-form__body">
              <div class="ol-form-grid">
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
          </div>
          <small v-if="selectedStorageId" class="ol-mount-result">{{ t('mountEditing') }} #{{ selectedStorageId }}</small>
          <div v-if="driverInfo" class="ol-driver-note">
            <b>{{ driverDisplayName(driverInfo.config?.name || verifyDriver) }}</b>
            <span>{{ driverNote(driverInfo.config?.name || verifyDriver, driverInfo.config?.note || t('driverMetadataOnly')) }}</span>
          </div>
          <div v-if="driverFields.length" class="ol-driver-fields">
            <label v-for="field in driverFields" :key="field.name" class="ol-field">
              <span :title="field.name">{{ fieldLabel(field) }}<i v-if="field.required">*</i></span>
              <select v-if="field.type === 'select'" v-model="driverForm[field.name]" class="b3-select">
                <option v-for="option in fieldOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
              <label v-else-if="field.type === 'bool'" class="ol-switch">
                <input v-model="driverForm[field.name]" type="checkbox">
                <span>{{ driverForm[field.name] ? t('enabled') : t('disabled') }}</span>
              </label>
              <input
                v-else
                v-model="driverForm[field.name]"
                class="b3-text-field"
                :type="field.type === 'password' ? 'password' : field.type === 'number' || field.type === 'float' ? 'number' : 'text'"
                :step="field.type === 'float' ? '0.1' : undefined"
              >
              <small v-if="fieldHelp(field)">{{ fieldHelp(field) }}</small>
            </label>
          </div>
            <textarea v-model="verifyAddition" class="b3-text-field ol-addition" spellcheck="false" :placeholder="t('additionJson')" />
            <div class="ol-mount-form__actions">
              <button v-if="!selectedStorageId" class="b3-button" type="button" :disabled="mountCreating" @click="submitAddMount">{{ mountCreating ? t('mountCreating') : t('mountAdd') }}</button>
              <button v-else class="b3-button" type="button" :disabled="mountCreating" @click="submitUpdateMount">{{ mountCreating ? t('mountCreating') : t('mountUpdate') }}</button>
              <button class="b3-button b3-button--cancel" type="button" :disabled="mountCreating" @click="closeMountForm">{{ t('cancel') }}</button>
              <span class="fn__space"></span>
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('mountExport')" @click="exportAddition" @keydown.enter.space.prevent="exportAddition">
                <svg><use xlink:href="#iconUpload" /></svg>
              </span>
              <span class="block__icon block__icon--show ariaLabel" data-position="north" role="button" tabindex="0" :aria-label="t('mountImport')" @click="importAddition" @keydown.enter.space.prevent="importAddition">
                <svg><use xlink:href="#iconFile" /></svg>
              </span>
            </div>
          <small v-if="mountCreateResult" class="ol-mount-result" :class="{ fail: !mountCreateOk }">{{ mountCreateResult }}</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { usePlugin } from '@/main'
import { useDock } from '@/utils/dock'

const {
  accountInfo,
  clearMountEdit,
  closeMountForm,
  configText,
  copyRoute,
  currentTab,
  deleteMount,
  driverDisplayName,
  driverFields,
  driverForm,
  driverInfo,
  driverOptions,
  driverNote,
  exportAddition,
  exportConfig,
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
  openAddMount,
  openFileManager,
  openEditMount,
  openPrivateEntry,
  refreshAll,
  runVerifySuite,
  selectedStorageId,
  statusClass,
  statusDetail,
  statusTitle,
  storageDescription,
  storageInfo,
  storageSyncLabel,
  storageTags,
  submitAddMount,
  submitUpdateMount,
  t,
  tabs,
  toggleMount,
  verifyAddition,
  verifyDriver,
  verifyLogin,
  verifyLog,
  verifyMountPath,
  verifyPassword,
  verifySession,
  verifyStorages,
  verifyTaskList,
  verifyUsername,
} = useDock(usePlugin())
</script>
