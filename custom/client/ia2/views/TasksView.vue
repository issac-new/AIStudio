<!-- overlay/custom/client/ia2/views/TasksView.vue -->
<!-- 工作项区：页签 1 = 内嵌 SwarmKanbanView 既有看板（swarm-kanban 吸收进 /app/tasks）；
     页签 2 = 追溯矩阵（P3 Task 7，§7B.2：需求 → run → 产出任务 → 验证轮次）。
     深链预选（P3 Task 7）：/app/tasks?tab=trace|board&status=<kanban 状态>&task=<taskId>
     ——status 预选看板状态过滤器、task 预选搜索框（run 详情/总览注意力条落点，
     合法状态词表校验，非法值忽略不炸页面）。 -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useKanbanStore } from '@/stores/hermes/kanban'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import TraceabilityMatrix from '../components/TraceabilityMatrix.vue'

const { t } = useI18n()
const route = useRoute()
const kanban = useKanbanStore()

type TabKey = 'board' | 'trace'
const tab = ref<TabKey>('board')

/** kanban 任务状态词表（api/hermes/kanban KanbanTaskStatus 同表；query 预选校验用） */
const KANBAN_STATUSES: ReadonlySet<string> = new Set([
  'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived',
])

/** route query → 看板预选（status 过滤器 + task 搜索）。非法值忽略。 */
function applyQuery(q: Record<string, unknown>): void {
  if (q.tab === 'trace') tab.value = 'trace'
  else if (q.tab === 'board') tab.value = 'board'
  if (typeof q.status === 'string' && KANBAN_STATUSES.has(q.status)) {
    kanban.setStatusFilter(q.status)
  }
  if (typeof q.task === 'string' && q.task) {
    kanban.setSearchQuery(q.task)
  }
}

onMounted(() => applyQuery(route.query as Record<string, unknown>))
// 同路由 query 变化（已在 /app/tasks 时被深链再次唤起）同样生效
watch(
  () => route.query,
  (q) => { applyQuery(q as Record<string, unknown>) },
)

/** 追溯矩阵 → 看板定位任务：切回看板页签 + 搜索框预选 taskId */
function openTaskFromMatrix(taskId: string): void {
  tab.value = 'board'
  kanban.setSearchQuery(taskId)
}
</script>

<template>
  <div class="ia-area ia-tasks">
    <div class="ia-tasks__tabs" role="tablist">
      <button
        type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === 'board' }"
        role="tab"
        :aria-selected="tab === 'board'"
        data-testid="ia-tasks-tab-board"
        @click="tab = 'board'"
      >
        {{ t('ia2.tasks.tabBoard') }}
      </button>
      <button
        type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === 'trace' }"
        role="tab"
        :aria-selected="tab === 'trace'"
        data-testid="ia-tasks-tab-trace"
        @click="tab = 'trace'"
      >
        {{ t('ia2.tasks.tabTrace') }}
      </button>
    </div>

    <div v-if="tab === 'board'" class="ia-tasks__board">
      <SwarmKanbanView />
    </div>
    <div v-else class="ia-area">
      <TraceabilityMatrix @open-task="openTaskFromMatrix" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-tasks {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ia-tasks__tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}

.ia-tasks__tab {
  border: none;
  background: transparent;
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  cursor: pointer;
  border-bottom: 2px solid transparent;

  &:hover { color: inherit; }

  &--active {
    color: var(--accent-primary, var(--color-primary, #3b82f6));
    border-bottom-color: var(--accent-primary, var(--color-primary, #3b82f6));
    font-weight: 600;
  }
}

.ia-tasks__board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
