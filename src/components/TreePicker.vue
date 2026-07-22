<template>
  <div class="b3-list b3-list--background" style="max-height:min(360px,calc(100vh - 24px));overflow:auto;" @contextmenu.prevent.stop>
    <div style="padding:4px 8px;">
      <input ref="searchRef" v-model="searchText" class="b3-text-field fn__block" placeholder="搜索" @input="runSearch">
    </div>
    <div @click.stop="onTreeClick" v-html="treeHtml" />
  </div>
</template>

<script setup lang="ts">
import { showMessage } from 'siyuan'
import { computed, nextTick, onMounted, ref } from 'vue'
import { fsList, fsSearch } from '@/utils/api'
import { joinOpenListPath, normalizeOpenListPath } from '@/utils/file_actions'
import { openListFileIconHref, openListFileIconName } from '@/utils/icon'
import { escapeAttr, escapeHtml, formatSize } from '@/utils/file_ui'

interface TreeItem {
  name: string
  path: string
  size: number
  is_dir: boolean
}

const props = defineProps<{
  onLayout: () => void
  onSelect: (item: { name: string, path: string, is_dir?: boolean }) => void
}>()

const rootItems = ref<TreeItem[]>([])
const childrenByPath = ref<Record<string, TreeItem[]>>({})
const expandedPaths = ref<string[]>([])
const loading = ref(false)
const lastError = ref('')
const searchRef = ref<HTMLInputElement>()
const searchText = ref('')
const searchItems = ref<TreeItem[]>([])
const searchLoading = ref(false)
let searchSeq = 0

const emptyText = computed(() => lastError.value || (searchText.value.trim() ? '无搜索结果' : 'Empty'))
const activeItems = computed(() => searchText.value.trim() ? searchItems.value : rootItems.value)
const layout = () => nextTick(props.onLayout)

const treeHtml = computed(() => {
  if ((loading.value || searchLoading.value) && !activeItems.value.length)
    return '<div class="fn__loading"></div>'
  if (!activeItems.value.length) {
    return `<button type="button" class="b3-list-item">
  <span class="b3-list-item__toggle fn__hidden"></span>
  <span class="b3-list-item__text ft__secondary">${escapeHtml(emptyText.value)}</span>
</button>`
  }
  return activeItems.value.map(item => renderNode(item, 0)).join('')
})

function toTreeItem(item: any, dir: string): TreeItem {
  return {
    name: String(item?.name || ''),
    path: item?.path ? normalizeOpenListPath(String(item.path)) : joinOpenListPath(dir, String(item?.name || '')),
    size: Number(item?.size || 0),
    is_dir: !!item?.is_dir,
  }
}

function sortItems(items: TreeItem[]) {
  return [...items].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
}

function renderNode(node: TreeItem, level: number): string {
  const paddingLeft = level * 18
  const iconName = openListFileIconName(node.name, node.is_dir)
  const children = node.is_dir && expandedPaths.value.includes(node.path) ? childrenByPath.value[node.path] || [] : []
  return `<button type="button" class="b3-list-item b3-list-item--hide-action" data-dir="${node.is_dir ? 'true' : ''}" data-name="${escapeAttr(node.name)}" data-path="${escapeAttr(node.path)}" style="--file-toggle-width:${paddingLeft + 18}px">
  <span style="padding-left:${paddingLeft}px" class="b3-list-item__toggle b3-list-item__toggle--hl${node.is_dir ? '' : ' fn__hidden'}">
    <svg class="b3-list-item__arrow${expandedPaths.value.includes(node.path) ? ' b3-list-item__arrow--open' : ''}"><use xlink:href="#iconRight"></use></svg>
  </span>
  <svg class="b3-list-item__graphic ol-file-row__icon ol-file-row__icon--${iconName}"><use xlink:href="${openListFileIconHref(node.name, node.is_dir)}"></use></svg>
  <span class="b3-list-item__text ariaLabel" data-position="parentE" aria-label="${escapeAttr(node.name)}">${escapeHtml(node.name)}</span>${!node.is_dir && node.size ? `
  <span class="b3-list-item__meta">${formatSize(node.size, true)}</span>` : ''}
</button>${children.map(child => renderNode(child, level + 1)).join('')}`
}

async function loadPath(path = '/') {
  const dir = normalizeOpenListPath(path)
  if (dir !== '/' && childrenByPath.value[dir])
    return true
  loading.value = true
  lastError.value = ''
  try {
    const payload = await fsList(dir, '', 1, 0)
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

async function runSearch() {
  const keywords = searchText.value.trim()
  const seq = ++searchSeq
  if (!keywords) {
    searchItems.value = []
    searchLoading.value = false
    await loadPath('/')
    layout()
    return
  }
  searchLoading.value = true
  lastError.value = ''
  try {
    const payload = await fsSearch('/', keywords, 0, 1, 200)
    if (seq !== searchSeq)
      return
    if (payload.code !== 200)
      throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
    const content = Array.isArray(payload.data?.content) ? payload.data.content : Array.isArray(payload.data) ? payload.data : []
    searchItems.value = sortItems(content.map((entry: any) => toTreeItem({
      name: entry.name,
      path: `${entry.parent || '/'}/${entry.name}`,
      size: entry.size,
      is_dir: entry.is_dir,
    }, entry.parent || '/')))
    layout()
  } catch (error) {
    if (seq !== searchSeq)
      return
    lastError.value = error instanceof Error ? error.message : String(error)
    searchItems.value = []
    showMessage(lastError.value, 3000, 'error')
    layout()
  } finally {
    if (seq === searchSeq)
      searchLoading.value = false
  }
}

async function togglePath(path: string) {
  if (!path)
    return
  if (expandedPaths.value.includes(path)) {
    expandedPaths.value = expandedPaths.value.filter(item => item !== path)
    layout()
    return
  }
  if (await loadPath(path)) {
    expandedPaths.value = [...expandedPaths.value, path]
    layout()
  }
}

function onTreeClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const item = target.closest<HTMLElement>('[data-path]')
  if (!item?.dataset.path)
    return
  if (target.closest('.b3-list-item__toggle')) {
    if (item.dataset.dir)
      togglePath(item.dataset.path)
    return
  }
  props.onSelect({
    name: item.dataset.name || '',
    path: item.dataset.path,
    is_dir: !!item.dataset.dir,
  })
}

onMounted(async () => {
  await loadPath('/')
  layout()
  searchRef.value?.focus()
})
</script>

