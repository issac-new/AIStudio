<script setup lang="ts">
import { useCockpitStore, type CockpitCategory, type CockpitPriority, type CockpitStatus } from '@/custom/cockpit/store/cockpit'

const store = useCockpitStore()
defineEmits<{ (e: 'collapse'): void; (e: 'enterCenter'): void }>()

const categories: { key: CockpitCategory; label: string; mark: string }[] = [
  { key: 'human', label: '人类协作', mark: 'mk-solid-bold' },
  { key: 'cluster', label: 'Agent 集群', mark: 'mk-solid-thin' },
  { key: 'direct', label: '人机 1:1', mark: 'mk-dotted' },
]
const priorities: CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']
const statuses: { key: CockpitStatus; label: string }[] = [
  { key: 'review', label: '待审' },
  { key: 'blocked', label: '阻塞' },
  { key: 'running', label: '进行中' },
  { key: 'todo', label: '待办' },
  { key: 'done', label: '完成' },
]
</script>

<template>
  <div class="cockpit-kanban">
    <div class="cockpit-collapse-btn" @click="$emit('collapse')">◀</div>
    <div class="cockpit-kanban__head">
      <span class="cockpit-kanban__title">Kanban 统筹</span>
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
        <span class="cockpit-kanban__flabel">类别</span>
        <button v-for="c in categories" :key="c.key" type="button" :data-filter="c.key"
          class="cockpit-kanban__tag" :class="{ 'is-on': store.filters.categories.includes(c.key) }"
          @click="store.toggleFilter('categories', c.key)">{{ c.label }}</button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="cockpit-kanban__list">
      <div v-for="c in categories" :key="c.key" class="cockpit-kanban__cat">
        <div class="cockpit-kanban__cat-head">
          <span class="cockpit-kanban__cat-mark" :class="c.mark" />
          {{ c.label }}
          <span class="cockpit-kanban__cat-count">{{ store.tasksByCategory[c.key].length }}</span>
        </div>
        <button v-for="t in store.tasksByCategory[c.key]" :key="t.id"
          type="button"
          :data-task-id="t.id"
          class="cockpit-kanban__task"
          :class="['is-' + t.priority.toLowerCase(), { 'is-selected': store.selectedTaskId === t.id }]"
          @click="store.selectTask(t.id)">
          <span class="cockpit-sel-bar" />
          <span class="cockpit-kanban__pri">{{ t.priority }}</span>
          <div class="cockpit-kanban__tt">{{ t.title }}</div>
          <div class="cockpit-kanban__meta">
            <span class="cockpit-kanban__stg" :class="{ 'is-blocked': t.status === 'blocked', 'is-review': t.status === 'review' }">
              {{ t.status }}
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
  padding: 12px 16px 8px; border-bottom: 1px solid var(--border-light);
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
.cockpit-kanban__cat-mark { width: 10px; height: 2px; background: var(--text-secondary); }
.mk-solid-bold { background: var(--accent-primary); }
.mk-solid-thin { background: var(--text-muted); height: 2px; }
.mk-dotted { background: transparent; border-bottom: 2px dotted var(--text-muted); }
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
.cockpit-kanban__tt { font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 4px; padding-right: 24px; }
.cockpit-kanban__meta { display: flex; align-items: center; gap: 6px; }
.cockpit-kanban__stg { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary); }
.cockpit-kanban__stg.is-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.08); }
.cockpit-kanban__stg.is-review { font-weight: 600; color: var(--text-primary); }
.cockpit-kanban__who { font-size: 10px; color: var(--text-muted); margin-left: auto; }

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
