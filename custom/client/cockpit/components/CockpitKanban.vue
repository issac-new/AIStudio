<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { NSelect } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCockpitStore, type CockpitPriority } from '@/custom/cockpit/store/cockpit'
import { bucketStatus, type CockpitStatusBucket } from '@/custom/cockpit/adapters/task-adapter'
import { parseTenant, tenantDisplayLabel, type ParsedTenant } from '@/custom/kanban/utils/tenant-parser'

const store = useCockpitStore()
const { t } = useI18n()
defineEmits<{ (e: 'collapse'): void; (e: 'enterCenter'): void; (e: 'maximize'): void; (e: 'fold'): void }>()

// 任务列表容器引用，用于滚动到选中项
const listEl = ref<HTMLElement | null>(null)

function copyTaskId(id: string) {
  navigator.clipboard?.writeText(id).catch(() => {})
}

const priorities: CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']
const statuses: { key: CockpitStatusBucket; label: string }[] = [
  { key: 'triage', label: '待分类' },
  { key: 'todo', label: '待办' },
  { key: 'scheduled', label: '已排期' },
  { key: 'ready', label: '就绪' },
  { key: 'running', label: '进行中' },
  { key: 'blocked', label: '阻塞' },
  { key: 'review', label: '待审' },
  { key: 'done', label: '完成' },
  { key: 'archived', label: '归档' },
]

// 解析所有任务的 tenant，生成 6 个字段的去重选项
const tenantFields: { key: keyof ParsedTenant; filterKey: 'tenantGroupChat' | 'tenantTopic' | 'tenantUserId' | 'tenantRoomId' | 'tenantSessionId' | 'tenantSource'; label: string }[] = [
  { key: 'groupChat', filterKey: 'tenantGroupChat', label: '群聊名称' },
  { key: 'topic', filterKey: 'tenantTopic', label: '话题摘要' },
  { key: 'userId', filterKey: 'tenantUserId', label: '用户ID' },
  { key: 'roomId', filterKey: 'tenantRoomId', label: '房间ID' },
  { key: 'sessionId', filterKey: 'tenantSessionId', label: '会话ID' },
  { key: 'source', filterKey: 'tenantSource', label: '来源' },
]

const tenantFieldOptions = computed(() => {
  const result: Record<string, { label: string; value: string }[]> = {}
  for (const field of tenantFields) {
    const set = new Set<string>()
    let hasLegacy = false
    for (const t of store.tasks) {
      if (!t.tenant) continue
      const parsed = parseTenant(t.tenant)
      if (parsed.isLegacy) {
        hasLegacy = true
      } else {
        const val = (parsed as any)[field.key] as string
        if (val) set.add(val)
      }
    }
    const arr = Array.from(set).sort().map(v => ({ label: v, value: v }))
    if (hasLegacy) arr.push({ label: '其它', value: '___other___' })
    result[field.filterKey] = arr
  }
  return result
})

/** Get/set the array of selected values for a tenant filter field (multi-select) */
function tenantFilterValues(key: typeof tenantFields[0]['filterKey']): string[] {
  return (store.filters as any)[key] as string[]
}
function setTenantFilterValues(key: typeof tenantFields[0]['filterKey'], vals: string[]) {
  store.$patch({ filters: { ...store.filters, [key]: [...vals] } })
}

// 动态 board slug 列表（需求 #1）：从 store.boards 取
const boardOptions = computed(() => store.boards.map(b => b.slug))

// assignee 筛选选项（从全部任务中提取去重）
const assigneeOptions = computed(() => {
  const set = new Set<string>()
  for (const t of store.tasks) {
    if (t.assignee && t.assignee !== '未分配') set.add(t.assignee)
  }
  return Array.from(set).sort()
})

// 排序
type SortField = 'priority' | 'createdAt'
const sortBy = ref<SortField>('priority')
const sortOrder = ref<'asc' | 'desc'>('asc')
const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

function toggleSort(field: SortField) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = field === 'priority' ? 'asc' : 'desc'
  }
}

const sortedFiltered = computed(() => {
  const arr = [...store.filteredTasks]
  if (sortBy.value === 'priority') {
    arr.sort((a, b) => {
      const cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
      return sortOrder.value === 'asc' ? cmp : -cmp
    })
  } else {
    arr.sort((a, b) => {
      const cmp = a.createdAt - b.createdAt
      return sortOrder.value === 'asc' ? cmp : -cmp
    })
  }
  return arr
})

// 分页
const page = ref(1)
const pageSize = ref(20)
const totalCount = computed(() => sortedFiltered.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const pagedTasks = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedFiltered.value.slice(start, start + pageSize.value)
})

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 是否有任意筛选条件激活
const hasActiveFilters = computed(() => {
  const f = store.filters
  return f.priorities.length > 0 || f.statuses.length > 0 || f.assignees.length > 0 ||
    f.tenants.length > 0 || f.boardSlugs.length > 0 || f.dateRange.from || f.dateRange.to ||
    f.tenantGroupChat.length > 0 || f.tenantTopic.length > 0 || f.tenantUserId.length > 0 ||
    f.tenantRoomId.length > 0 || f.tenantSessionId.length > 0 || f.tenantSource.length > 0
})

function clearAllFilters() {
  store.$patch({
    filters: {
      priorities: [], statuses: [], assignees: [], tenants: [], boardSlugs: [],
      tenantGroupChat: [], tenantTopic: [], tenantUserId: [], tenantRoomId: [],
      tenantSessionId: [], tenantSource: [],
      dateRange: { from: null, to: null },
    },
  })
  store.clearDateRangeFilter()
}

// 筛选条件变化时回到第一页
watch(() => store.filters, () => { page.value = 1 }, { deep: true })

// 选中任务变化时，自动滚动到该任务（若在当前页可见范围内）
watch(() => store.selectedTaskId, (id) => {
  if (!id || !listEl.value) return
  nextTick(() => {
    const el = listEl.value?.querySelector(`[data-task-id="${id}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
})

	// 状态显示：直接使用原始 status（9 值全部展示）
function statusBucketLabel(s: string): string {
  const b = bucketStatus(s as any)
  return statuses.find(x => x.key === b)?.label ?? s
}
</script>

<template>
  <div class="cockpit-kanban">
    <div class="cockpit-kanban__head">
      <div class="cockpit-kanban__head-row">
        <div class="cockpit-kanban__date-inline">
        <input type="date" class="cockpit-kanban__date" data-filter="date-from"
          :value="store.filters.dateRange.from ?? ''"
          @change="store.setDateRangeFilter(($event.target as HTMLInputElement).value || null, store.filters.dateRange.to)" />
        <span class="cockpit-kanban__date-sep">~</span>
        <input type="date" class="cockpit-kanban__date" data-filter="date-to"
          :value="store.filters.dateRange.to ?? ''"
          @change="store.setDateRangeFilter(store.filters.dateRange.from, ($event.target as HTMLInputElement).value || null)" />
        <button v-if="store.filters.dateRange.from || store.filters.dateRange.to" type="button" class="cockpit-kanban__date-clear" data-action="clear-date" @click="store.clearDateRangeFilter()">×</button>
      </div>
      <div class="cockpit-kanban__head-actions">
        <button type="button" class="cockpit-kanban__max" :title="store.maximized.left ? '还原' : '最大化'" @click="$emit('maximize')">
          <svg v-if="store.maximized.left" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2" fill="currentColor"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </button>
        <button type="button" class="cockpit-kanban__fold" title="折叠左栏" @click="$emit('fold')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      </div>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="cockpit-kanban__filters">
      <div v-if="boardOptions.length > 1" class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">{{ t('cockpit.filterBoard') }}</span>
        <button v-for="sl in boardOptions" :key="sl" type="button"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.boardSlugs.includes(sl) }"
          @click="store.toggleFilter('boardSlugs', sl)">{{ sl }}</button>
      </div>
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">{{ t('cockpit.filterPriority') }}</span>
        <button v-for="p in priorities" :key="p" type="button" :data-filter="p"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.priorities.includes(p) }"
          @click="store.toggleFilter('priorities', p)">{{ p }}</button>
      </div>
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">{{ t('cockpit.filterStatus') }}</span>
        <button v-for="st in statuses" :key="st.key" type="button" :data-filter="st.key"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.statuses.includes(st.key) }"
          @click="store.toggleFilter('statuses', st.key)">{{ st.label }}</button>
      </div>
      <div v-if="assigneeOptions.length > 0" class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">{{ t('cockpit.filterAssignee') }}</span>
        <button v-for="a in assigneeOptions" :key="a" type="button"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.assignees.includes(a) }"
          @click="store.toggleFilter('assignees', a)">{{ a }}</button>
      </div>
      <div class="cockpit-kanban__frow cockpit-kanban__frow--tenant">
        <span class="cockpit-kanban__flabel">{{ t('cockpit.filterTenant') }}</span>
        <div class="cockpit-kanban__tenant-selects">
          <NSelect
            v-for="field in tenantFields" :key="field.filterKey"
            :value="tenantFilterValues(field.filterKey)"
            :options="tenantFieldOptions[field.filterKey]"
            :placeholder="field.label"
            multiple
            size="tiny"
            :teleported="false"
            class="cockpit-kanban__tenant-sel"
            @update:value="(v: any) => setTenantFilterValues(field.filterKey, v)"
          />
        </div>
      </div>
    </div>

    <!-- 排序 + 统计 -->
    <div class="cockpit-kanban__sortbar">
      <span class="cockpit-kanban__stat">{{ t('cockpit.totalCount', { n: totalCount }) }}</span>
      <div class="cockpit-kanban__sortbar-right">
        <button v-if="hasActiveFilters" type="button" class="cockpit-kanban__clear" @click="clearAllFilters">{{ t('cockpit.clearFilters') }}</button>
        <div class="cockpit-kanban__sorts">
          <button type="button" class="cockpit-kanban__sortbtn"
            :class="{ 'is-on': sortBy === 'priority' }"
            @click="toggleSort('priority')">
            优先级{{ sortBy === 'priority' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '' }}
          </button>
          <button type="button" class="cockpit-kanban__sortbtn"
            :class="{ 'is-on': sortBy === 'createdAt' }"
            @click="toggleSort('createdAt')">
            创建时间{{ sortBy === 'createdAt' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 任务列表（扁平展示）-->
    <div ref="listEl" class="cockpit-kanban__list">
      <div v-if="pagedTasks.length === 0" class="cockpit-kanban__empty">
        {{ totalCount === 0 ? t('cockpit.noMatchingTasks') : t('cockpit.noTasksOnPage') }}
      </div>
      <button v-for="task in pagedTasks" :key="task.id"
        type="button"
        :data-task-id="task.id"
        class="cockpit-kanban__task"
        :class="['is-' + task.priority.toLowerCase(), { 'is-selected': store.selectedTaskId === task.id }]"
        @click="store.selectTask(task.id)">
        <span class="cockpit-kanban__pribar" />
        <span class="cockpit-sel-bar" />
        <span class="cockpit-kanban__pri">{{ task.priority }}</span>
        <div class="cockpit-kanban__tt" :title="task.title" @dblclick.stop="store.openTitleDetail(task.id, task.title)">{{ task.title }}</div>
        <div class="cockpit-kanban__meta">
          <span class="cockpit-kanban__slug" :data-task-slug="task.boardSlug">@{{ task.boardSlug }}</span>
          <span
            class="cockpit-kanban__id"
            :data-task-id-copy="task.id"
            :title="t('cockpit.copyTaskId')"
            @click.stop="copyTaskId(task.id)"
          >#{{ task.id }}</span>
          <span v-if="task.tenant" class="cockpit-kanban__tenant" :title="task.tenant">{{ tenantDisplayLabel(parseTenant(task.tenant)) }}</span>
          <span class="cockpit-kanban__stg" :class="{ 'is-blocked': task.status === 'blocked', 'is-review': task.status === 'review' }">
            {{ statusBucketLabel(task.status) }}
          </span>
          <span class="cockpit-kanban__meta-spacer" />
          <span class="cockpit-kanban__who">{{ task.assignee }}</span>
          <span class="cockpit-kanban__time">{{ formatTime(task.createdAt) }}</span>
        </div>
      </button>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="cockpit-kanban__pager">
      <button type="button" class="cockpit-kanban__pager-btn" :disabled="page <= 1" @click="page--">◀</button>
      <span class="cockpit-kanban__pager-info">{{ page }} / {{ totalPages }}</span>
      <button type="button" class="cockpit-kanban__pager-btn" :disabled="page >= totalPages" @click="page++">▶</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-kanban { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cockpit-kanban__head {
  padding: 10px 12px 6px 16px; border-bottom: 1px solid var(--border-color);
  display: flex; flex-direction: column;
}
.cockpit-kanban__head-row {
  display: flex; align-items: baseline; gap: 8px;
}
.cockpit-kanban__head-actions {
  margin-left: auto; display: flex; align-items: center; gap: 4px; flex-shrink: 0;
}
.cockpit-kanban__head-actions {
  margin-left: auto; display: flex; align-items: center; gap: 4px; flex-shrink: 0;
}
.cockpit-kanban__head-boards {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding-bottom: 4px;
}
.cockpit-kanban__head-boards-spacer { flex: 1; }
.cockpit-kanban__fold {
  width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); border-color: var(--text-muted); }
}
.cockpit-kanban__max {
  width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-kanban__sort { font-size: 11px; color: var(--text-muted); }
.cockpit-kanban__filters { padding: 10px 12px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px; }
.cockpit-kanban__frow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-kanban__flabel { font-size: 10px; color: var(--text-muted); width: 30px; flex-shrink: 0; font-weight: 600; text-transform: uppercase; }
.cockpit-kanban__tag {
  font-size: 11px; padding: 3px 9px; border-radius: 10px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-kanban__list { flex: 1; overflow-y: auto; padding: 8px; }

.cockpit-kanban__task {
  position: relative; padding: 9px 10px 9px 14px; border-radius: 6px; cursor: pointer; margin-bottom: 4px;
  display: flex; flex-direction: column; width: 100%; text-align: left;
  border: none; background: none; font: inherit; color: inherit;
  &:hover { background: var(--bg-card-hover); }
}
/* 左侧优先级色条：P0 红 / P1 橙 / P2 蓝 / P3 灰，比纯文字更直观 */
.cockpit-kanban__pribar {
  position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 2px 2px 0;
  background: var(--border-color);
}
.is-p0 .cockpit-kanban__pribar { background: var(--error); }
.is-p1 .cockpit-kanban__pribar { background: var(--warning, #e6a23c); }
.is-p2 .cockpit-kanban__pribar { background: var(--accent-primary); }
.is-p3 .cockpit-kanban__pribar { background: var(--border-color); }
.cockpit-kanban__pri { position: absolute; top: 9px; right: 10px; font-size: 10px; font-weight: 700; color: var(--text-muted); font-family: monospace; }
.is-p0 .cockpit-kanban__pri { color: var(--text-primary); }
.is-p0 .cockpit-kanban__tt { font-weight: 700; color: var(--text-primary); }
.is-p1 .cockpit-kanban__tt { font-weight: 600; }
.cockpit-kanban__tt {
  font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 5px; padding-right: 24px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: help;
}
.cockpit-kanban__meta { display: flex; align-items: center; gap: 6px; overflow: hidden; }
.cockpit-kanban__stg { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); flex-shrink: 0; }
.cockpit-kanban__stg.is-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
.cockpit-kanban__stg.is-review { font-weight: 600; color: var(--text-primary); }
.cockpit-kanban__meta-spacer { flex: 1; min-width: 8px; }
.cockpit-kanban__who { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.cockpit-kanban__slug { font-size: 10px; color: var(--text-muted); font-family: monospace; padding: 0 4px; flex-shrink: 0; }
.cockpit-kanban__frow--date { align-items: center; }

.cockpit-kanban__frow--tenant { flex-wrap: wrap; }
.cockpit-kanban__tenant-selects { display: flex; gap: 6px; flex: 1; min-width: 0; flex-wrap: wrap; }
.cockpit-kanban__tenant-sel { flex: 1; min-width: 100px; }
.cockpit-kanban__tenant-sel :deep(.n-base-select-option__content) { overflow: visible; white-space: normal; word-break: break-all; }
.cockpit-kanban__date {
  font-size: 11px; padding: 2px 5px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-card); color: var(--text-secondary);
  font-family: inherit; width: 92px;
}
.cockpit-kanban__date-sep { font-size: 11px; color: var(--text-muted); }
.cockpit-kanban__date-clear {
  width: 18px; height: 18px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 50%; background: var(--bg-card); color: var(--text-muted);
  cursor: pointer; font-size: 11px; line-height: 1;
}

.cockpit-kanban__id {
  font-family: monospace; font-size: 10px; color: var(--text-muted);
  cursor: copy; padding: 0 3px; border-radius: 2px; flex-shrink: 0;
  &:hover { color: var(--accent-primary); background: rgba(var(--accent-primary-rgb, 0), 0.08); }
}

/* ── 租户 ── */
.cockpit-kanban__tenant {
  font-size: 10px; color: var(--text-muted); padding: 0 3px; max-width: 60px; flex-shrink: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── 排序栏 ── */
.cockpit-kanban__sortbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.cockpit-kanban__stat { font-size: 11px; color: var(--text-muted); }
.cockpit-kanban__sortbar-right { display: flex; align-items: center; gap: 8px; }
.cockpit-kanban__clear {
  font-size: 11px; padding: 2px 8px; border-radius: 4px; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit;
  &:hover { color: var(--error); }
}
.cockpit-kanban__sorts { display: flex; gap: 6px; }
.cockpit-kanban__sortbtn {
  font-size: 11px; padding: 3px 9px; border-radius: 10px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}

/* ── 空状态 ── */
.cockpit-kanban__empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 13px; padding: 40px 16px; text-align: center;
}

/* ── 创建时间 ── */
.cockpit-kanban__time { font-size: 10px; color: var(--text-muted); font-family: monospace; margin-left: 4px; flex-shrink: 0; }

/* ── 分页 ── */
.cockpit-kanban__pager {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 8px 12px; border-top: 1px solid var(--border-color); flex-shrink: 0;
}
.cockpit-kanban__pager-btn {
  width: 26px; height: 26px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-card); color: var(--text-secondary);
  cursor: pointer; font-size: 11px; font-family: inherit; display: flex;
  align-items: center; justify-content: center;
  &:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
  &:disabled { opacity: 0.3; cursor: default; }
}
.cockpit-kanban__pager-info { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
