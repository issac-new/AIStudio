<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type CockpitPriority } from '@/custom/cockpit/store/cockpit'
import { bucketStatus, type CockpitStatusBucket } from '@/custom/cockpit/adapters/task-adapter'

const store = useCockpitStore()
defineEmits<{ (e: 'collapse'): void; (e: 'enterCenter'): void }>()

const priorities: CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']
const statuses: { key: CockpitStatusBucket; label: string }[] = [
  { key: 'review', label: '待审' },
  { key: 'blocked', label: '阻塞' },
  { key: 'running', label: '进行中' },
  { key: 'todo', label: '待办' },
  { key: 'done', label: '完成' },
]

// 动态 tenant 列表：从所有任务去重 tenant（null → (未指定)）
const tenantOptions = computed(() => {
  const set = new Set<string>()
  for (const t of store.tasks) set.add(t.tenant ?? '(未指定)')
  return [...set].sort()
})

// 动态 board slug 列表（需求 #1）：从 store.boards 取
const boardOptions = computed(() => store.boards.map(b => b.slug))

// 分组：按 tasksByTenant 的 key（含 (未指定)）
const tenantGroups = computed(() => {
  const map = store.tasksByTenant as Record<string, ReturnType<typeof Array.from>>
  return Object.keys(map)
    .sort((a, b) => (a === '(未指定)' ? 1 : a.localeCompare(b)))
    .map(key => ({ key, tasks: store.tasksByTenant[key] ?? [] }))
})

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
      <span class="cockpit-kanban__sort">↓ 优先级</span>
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
      <div class="cockpit-kanban__frow">
        <span class="cockpit-kanban__flabel">租户</span>
        <button v-for="tn in tenantOptions" :key="tn" type="button" :data-filter="tn"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.tenants.includes(tn) }"
          @click="store.toggleFilter('tenants', tn)">{{ tn }}</button>
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

    <!-- 任务列表（按 tenant 分组）-->
    <div class="cockpit-kanban__list">
      <div v-for="g in tenantGroups" :key="g.key" class="cockpit-kanban__cat" :data-tenant-group="g.key">
        <div class="cockpit-kanban__cat-head">
          <span class="cockpit-kanban__cat-mark" />
          {{ g.key }}
          <span class="cockpit-kanban__cat-count">{{ g.tasks.length }}</span>
        </div>
        <button v-for="t in g.tasks" :key="t.id"
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
            <span class="cockpit-kanban__stg" :class="{ 'is-blocked': t.status === 'blocked', 'is-review': t.status === 'review' }">
              {{ statusBucketLabel(t.status) }}
            </span>
            <span class="cockpit-kanban__who">{{ t.assignee }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- AI协作中心入口（kanban 下方）-->
    <button type="button" class="cockpit-kanban__entry" data-entry="cockpit" @click="$emit('enterCenter')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span class="cockpit-kanban__entry-label">AI协作中心</span>
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
.cockpit-kanban__cat { margin-bottom: 8px; }
.cockpit-kanban__cat-head {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px;
}
.cockpit-kanban__cat-mark { width: 10px; height: 2px; background: var(--text-muted); }
.cockpit-kanban__cat-count { font-size: 9px; color: var(--text-muted); margin-left: auto; background: var(--bg-secondary); border-radius: 8px; padding: 0 6px; font-weight: 400; text-transform: none; }

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
</style>
