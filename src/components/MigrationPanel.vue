<template>
  <section class="ol-migration-panel">
    <div class="ol-progress">
      <div class="ol-progress-top">
        <strong>{{ completion }}%</strong>
        <small>{{ completedStages }}/{{ stages.length }} {{ t('stages') }}</small>
      </div>
      <div class="ol-progress-bar">
        <i :style="{ width: `${completion}%` }" />
      </div>
    </div>

    <section class="ol-list">
      <article v-for="stage in stages" :key="stage.key" class="ol-stage" :class="stage.status">
        <b>{{ t(stage.labelKey) }}</b>
        <small>{{ t(stage.detailKey) }}</small>
      </article>
    </section>

    <section class="ol-plan">
      <table>
        <thead>
          <tr>
            <th>{{ t('planPhase') }}</th>
            <th>{{ t('planStatus') }}</th>
            <th>{{ t('planNext') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in planItems" :key="item.key" :class="item.status">
            <td>
              <b>{{ t(item.phaseKey) }}</b>
              <small>{{ t(item.goalKey) }}</small>
            </td>
            <td><span>{{ t(statusLabelKey(item.status)) }}</span></td>
            <td>{{ t(item.nextKey) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="ol-routes">
      <div class="ol-route-summary">
        <b>{{ routes.length }}</b>
        <span>{{ t('routesExposed') }}</span>
      </div>
      <ul>
        <li v-for="route in routes" :key="route">
          <span>{{ route.split(' ')[0] }}</span>{{ route.replace(/^[A-Z]+ /, '') }}
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePlugin } from '@/main'

interface Stage {
  key: string
  labelKey: string
  detailKey: string
  status: 'done' | 'active' | 'todo'
}

interface KernelStage {
  key: string
  status: 'done' | 'active' | 'todo'
}

const privateBase = '/plugin/private/siyuan-cloud'
const plugin = usePlugin()
const routes = ref<string[]>([])
const stages = ref<Stage[]>([
  { key: 'kernel', labelKey: 'stageKernelLabel', detailKey: 'stageKernelDetail', status: 'done' },
  { key: 'architecture', labelKey: 'stageArchitectureLabel', detailKey: 'stageArchitectureDetail', status: 'done' },
  { key: 'auth', labelKey: 'stageAuthLabel', detailKey: 'stageAuthDetail', status: 'done' },
  { key: 'fs', labelKey: 'stageFsLabel', detailKey: 'stageFsDetail', status: 'done' },
  { key: 'streaming-proxy', labelKey: 'stageStreamingProxyLabel', detailKey: 'stageStreamingProxyDetail', status: 'done' },
  { key: 'admin', labelKey: 'stageAdminLabel', detailKey: 'stageAdminDetail', status: 'active' },
  { key: 'meta', labelKey: 'stageMetaLabel', detailKey: 'stageMetaDetail', status: 'done' },
  { key: 'security', labelKey: 'stageSecurityLabel', detailKey: 'stageSecurityDetail', status: 'active' },
  { key: 'share', labelKey: 'stageShareLabel', detailKey: 'stageShareDetail', status: 'done' },
  { key: 'task', labelKey: 'stageTaskLabel', detailKey: 'stageTaskDetail', status: 'active' },
  { key: 'real-adapter', labelKey: 'stageAdapterLabel', detailKey: 'stageAdapterDetail', status: 'active' },
  { key: 'webdav', labelKey: 'stageWebdavLabel', detailKey: 'stageWebdavDetail', status: 'active' },
  { key: 's3', labelKey: 'stageS3Label', detailKey: 'stageS3Detail', status: 'active' },
])
const planItems = [
  { key: 'dock', phaseKey: 'planDockPhase', goalKey: 'planDockGoal', status: 'done', nextKey: 'planDockNext' },
  { key: 'api', phaseKey: 'planApiPhase', goalKey: 'planApiGoal', status: 'active', nextKey: 'planApiNext' },
  { key: 'fs', phaseKey: 'planFsPhase', goalKey: 'planFsGoal', status: 'active', nextKey: 'planFsNext' },
  { key: 'admin', phaseKey: 'planAdminPhase', goalKey: 'planAdminGoal', status: 'active', nextKey: 'planAdminNext' },
  { key: 'protocol', phaseKey: 'planProtocolPhase', goalKey: 'planProtocolGoal', status: 'active', nextKey: 'planProtocolNext' },
  { key: 'release', phaseKey: 'planReleasePhase', goalKey: 'planReleaseGoal', status: 'todo', nextKey: 'planReleaseNext' },
]

const completedStages = computed(() => stages.value.filter(item => item.status === 'done').length)
const completion = computed(() => Math.round((completedStages.value / stages.value.length) * 100))

function t(key: string) {
  return String((plugin.i18n as Record<string, string>)?.[key] || key)
}

function statusLabelKey(value: string) {
  if (value === 'done')
    return 'planStatusDone'
  if (value === 'active')
    return 'planStatusActive'
  return 'planStatusTodo'
}

async function refreshStatus() {
  const response = await fetch(`${privateBase}/siyuan-cloud/status`)
  if (!response.ok)
    return
  const payload = await response.json()
  routes.value = payload.data?.routes || []
  mergeKernelStages(payload.data?.stages || [])
}

function mergeKernelStages(kernelStages: KernelStage[]) {
  if (!Array.isArray(kernelStages) || !kernelStages.length)
    return
  const byKey = new Map(kernelStages.map(item => [item.key, item.status]))
  stages.value = stages.value.map((stage) => {
    const next = byKey.get(stage.key)
    return next ? { ...stage, status: next } : stage
  })
}

onMounted(refreshStatus)
</script>
