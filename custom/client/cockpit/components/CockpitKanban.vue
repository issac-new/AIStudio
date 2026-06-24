<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import { useCockpitStore, type CockpitPriority } from '@/custom/cockpit/store/cockpit'
import { bucketStatus, type CockpitStatusBucket } from '@/custom/cockpit/adapters/task-adapter'
import { parseTenant, tenantDisplayLabel, type ParsedTenant } from '@/custom/kanban/utils/tenant-parser'

const store = useCockpitStore()
defineEmits<{ (e: 'collapse'): void; (e: 'enterCenter'): void }>()

function copyTaskId(id: string) {
  navigator.clipboard?.writeText(id).catch(() => {})
}

const priorities: CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']
const statuses: { key: CockpitStatusBucket; label: string }[] = [
  { key: 'review', label: '待审' },
  { key: 'blocked', label: '阻塞' },
  { key: 'running', label: '进行中' },
  { key: 'todo', label: '待办' },
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

// 状态显示：原始 status（9 值）但分组筛选用 bucketStatus 5 桶
function statusBucketLabel(s: string): string {
  const b = bucketStatus(s as any)
  return statuses.find(x => x.key === b)?.label ?? s
}
</script>

<template>
  <div class="cockpit-kanban">
    <div class="cockpit-kanban__head">
      <span class="cockpit-kanban__title">kanban总览</span>
      <div class="cockpit-kanban__search">
        <span class="cockpit-kanban__search-icon">🔍</span>
        <input
          type="text"
          class="cockpit-kanban__search-input"
          :value="store.searchQuery"
          placeholder="搜索 会话/任务/房间"
          data-search-input
          @input="store.runSearch(($event.target as HTMLInputElement).value)"
        />
        <button v-if="store.searchQuery" type="button" class="cockpit-kanban__search-clear" @click="store.clearSearch()">×</button>
        <span v-if="store._sessionSearching" class="cockpit-kanban__search-spinner" />
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="cockpit-kanban__filters">
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">优先</span>
        <button v-for="p in priorities" :key="p" type="button" :data-filter="p"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.priorities.includes(p) }"
          @click="store.toggleFilter('priorities', p)">{{ p }}</button>
      </div>
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">状态</span>
        <button v-for="st in statuses" :key="st.key" type="button" :data-filter="st.key"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.statuses.includes(st.key) }"
          @click="store.toggleFilter('statuses', st.key)">{{ st.label }}</button>
      </div>
      <div class="cockpit-kanban__frow cockpit-kanban__frow--tenant">
        <span class="cockpit-kanban__flabel">租户</span>
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
      <div v-if="boardOptions.length > 1" class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">看板</span>
        <button v-for="sl in boardOptions" :key="sl" type="button" :data-filter="sl"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.boardSlugs.includes(sl) }"
          @click="store.toggleFilter('boardSlugs', sl)">{{ sl }}</button>
      </div>
      <div class="cockpit-kanban__frow cockpit-kanban__frow--date">
        <span class="cockpit-kanban__flabel">日期</span>
        <input type="date" class="cockpit-kanban__date" data-filter="date-from"
          :value="store.filters.dateRange.from ?? ''"
          @change="store.setDateRangeFilter(($event.target as HTMLInputElement).value || null, store.filters.dateRange.to)" />
        <span class="cockpit-kanban__date-sep">~</span>
        <input type="date" class="cockpit-kanban__date" data-filter="date-to"
          :value="store.filters.dateRange.to ?? ''"
          @change="store.setDateRangeFilter(store.filters.dateRange.from, ($event.target as HTMLInputElement).value || null)" />
        <button v-if="store.filters.dateRange.from || store.filters.dateRange.to" type="button" class="cockpit-kanban__date-clear" data-action="clear-date" @click="store.clearDateRangeFilter()">×</button>
      </div>
    </div>

    <!-- 任务列表（扁平展示）-->
    <div class="cockpit-kanban__list">
      <button v-for="t in store.filteredTasks" :key="t.id"
        type="button"
        :data-task-id="t.id"
        class="cockpit-kanban__task"
        :class="['is-' + t.priority.toLowerCase(), { 'is-selected': store.selectedTaskId === t.id }]"
        @click="store.selectTask(t.id)">
        <span class="cockpit-sel-bar" />
        <span class="cockpit-kanban__pri">{{ t.priority }}</span>
        <div class="cockpit-kanban__tt" :title="t.title" @dblclick.stop="store.openTitleDetail(t.id, t.title)">{{ t.title }}</div>
        <div class="cockpit-kanban__meta">
          <span class="cockpit-kanban__slug" :data-task-slug="t.boardSlug">@{{ t.boardSlug }}</span>
          <span
            class="cockpit-kanban__id"
            :data-task-id-copy="t.id"
            :title="`点击复制任务ID: ${t.id}`"
            @click.stop="copyTaskId(t.id)"
          >#{{ t.id }}</span>
          <span v-if="t.tenant" class="cockpit-kanban__tenant" :title="t.tenant">{{ tenantDisplayLabel(parseTenant(t.tenant)) }}</span>
          <span class="cockpit-kanban__stg" :class="{ 'is-blocked': t.status === 'blocked', 'is-review': t.status === 'review' }">
            {{ statusBucketLabel(t.status) }}
          </span>
          <span class="cockpit-kanban__who">{{ t.assignee }}</span>
        </div>
      </button>
    </div>

    <!-- kanban 中心入口 -->
    <button type="button" class="cockpit-kanban__entry" data-entry="cockpit" @click="$emit('enterCenter')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span class="cockpit-kanban__entry-label">看板中心</span>
      <svg class="cockpit-kanban__entry-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
.cockpit-kanban { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cockpit-kanban__head {
  padding: 12px 44px 8px 16px; border-bottom: 1px solid var(--border-light);
  display: flex; justify-content: space-between; align-items: baseline;
}
.cockpit-kanban__title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.cockpit-kanban__sort { font-size: 10px; color: var(--text-muted); }
.cockpit-kanban__filters { padding: 8px 12px; border-bottom: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 5px; }
.cockpit-kanban__frow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.cockpit-kanban__flabel { font-size: 9px; color: var(--text-muted); width: 30px; flex-shrink: 0; font-weight: 600; text-transform: uppercase; }
.cockpit-kanban__tag {
  font-size: 10px; padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-kanban__list { flex: 1; overflow-y: auto; padding: 8px; }

.cockpit-kanban__task {
  position: relative; padding: 8px 10px 8px 14px; border-radius: 6px; cursor: pointer; margin-bottom: 3px;
  display: flex; flex-direction: column; width: 100%; text-align: left;
  border: none; background: none; font: inherit; color: inherit;
  &:hover { background: var(--bg-card-hover); }
}
.cockpit-kanban__pri { position: absolute; top: 8px; right: 10px; font-size: 9px; font-weight: 700; color: var(--text-muted); font-family: monospace; }
.is-p0 .cockpit-kanban__pri { color: var(--text-primary); }
.is-p0 .cockpit-kanban__tt { font-weight: 700; color: var(--text-primary); }
.is-p1 .cockpit-kanban__tt { font-weight: 600; }
.cockpit-kanban__tt {
  font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 4px; padding-right: 24px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: help;
}
.cockpit-kanban__meta { display: flex; align-items: center; gap: 6px; }
.cockpit-kanban__stg { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); }
.cockpit-kanban__stg.is-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
.cockpit-kanban__stg.is-review { font-weight: 600; color: var(--text-primary); }
.cockpit-kanban__who { font-size: 10px; color: var(--text-muted); margin-left: auto; }
.cockpit-kanban__slug { font-size: 9px; color: var(--text-muted); font-family: monospace; padding: 0 4px; }
.cockpit-kanban__frow--date { align-items: center; }

.cockpit-kanban__frow--tenant { flex-wrap: wrap; }
.cockpit-kanban__tenant-selects { display: flex; gap: 4px; flex: 1; min-width: 0; flex-wrap: wrap; }
.cockpit-kanban__tenant-sel { flex: 1; min-width: 100px; }
.cockpit-kanban__tenant-sel :deep(.n-base-select-option__content) { overflow: visible; white-space: normal; word-break: break-all; }
.cockpit-kanban__date {
  font-size: 10px; padding: 1px 4px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-card); color: var(--text-secondary);
  font-family: inherit; width: 90px;
}
.cockpit-kanban__date-sep { font-size: 10px; color: var(--text-muted); }
.cockpit-kanban__date-clear {
  width: 16px; height: 16px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 50%; background: var(--bg-card); color: var(--text-muted);
  cursor: pointer; font-size: 10px; line-height: 1;
}

.cockpit-kanban__entry {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    background: var(--bg-card-hover);
    color: var(--accent-primary);
  }
  &:hover .cockpit-kanban__entry-arrow { transform: translateX(2px); color: var(--accent-primary); }
}
.cockpit-kanban__entry-label { flex: 1; text-align: left; }
.cockpit-kanban__entry-arrow { color: var(--text-muted); transition: transform 0.15s ease, color 0.15s ease; }

/* ── 搜索框 ── */
.cockpit-kanban__head {
  padding: 8px 12px 8px 16px;
  gap: 6px;
  display: flex;
  align-items: center;
}
.cockpit-kanban__search {
  flex: 1; position: relative; display: flex; align-items: center; min-width: 0;
}
.cockpit-kanban__search-icon {
  position: absolute; left: 6px; font-size: 10px; color: var(--text-muted); pointer-events: none; line-height: 1;
}
.cockpit-kanban__search-input {
  width: 100%; font-size: 11px; padding: 3px 24px 3px 22px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); color: var(--text-secondary); font-family: inherit; outline: none;
  &::placeholder { color: var(--text-muted); opacity: 0.6; }
  &:focus { border-color: var(--accent-primary); }
}
.cockpit-kanban__search-clear {
  position: absolute; right: 4px; width: 16px; height: 16px; padding: 0;
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.cockpit-kanban__search-spinner {
  position: absolute; right: 6px; width: 10px; height: 10px;
  border: 1.5px solid var(--border-color); border-top-color: var(--accent-primary);
  border-radius: 50%; animation: cockpit-kspin 0.6s linear infinite;
}
@keyframes cockpit-kspin { to { transform: rotate(360deg); } }

/* ── 任务ID ── */
.cockpit-kanban__id {
  font-family: monospace; font-size: 9px; color: var(--text-muted);
  cursor: copy; padding: 0 3px; border-radius: 2px;
  &:hover { color: var(--accent-primary); background: rgba(var(--accent-primary-rgb, 0), 0.08); }
}

/* ── 租户 ── */
.cockpit-kanban__tenant {
  font-size: 9px; color: var(--text-muted); padding: 0 3px; max-width: 60px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
