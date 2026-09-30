import type { KanbanTaskStatus } from '@/api/hermes/kanban'
<!-- overlay/custom/client/ia2/views/TasksView.vue -->
<!-- 工作项区：页签 1 = 内嵌 SwarmKanbanView 既有看板（swarm-kanban 吸收进 /app/tasks）；
     页签 2 = 追溯矩阵（P3 Task 7，§7B.2：需求 → run → 产出任务 → 验证轮次）。
     深链预选（P3 Task 7）：/app/tasks?tab=trace|board&status=<kanban 状态>&task=<taskId>
     ——status 预选看板状态过滤器、task 预选搜索框（run 详情/总览注意力条落点，
     合法状态词表校验，非法值忽略不炸页面）。 -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import TraceabilityMatrix from '../components/TraceabilityMatrix.vue'
import ManagementAccountsPanel from '@/custom/kanban/components/ManagementAccountsPanel.vue'
import RunTraceOverview from '@/custom/cockpit/components/RunTraceOverview.vue'
import { useRunSurfaceText } from '../i18n-run-surface'
import GovernanceView from '@/custom/ia2/views/GovernanceView.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const kanban = useKanbanStore()
const cockpit = useCockpitStore()

type TabKey = 'board' | 'trace' | 'accounts' | 'observatory' | 'gov'
const tab = ref<TabKey>('board')
/** 全链路追踪页签约文案（i18n-run-surface 独立事实源，漂移治理后收编 473） */
const rsText = useRunSurfaceText()

/** v12.6 右上角关闭钮（用户裁定：打开的 swarm kanban 页可关）——回到沟通协作
 *  工作台（页头视图切换器同义的回退动线） */
function closeBoard(): void {
  void router.push({ name: 'ia2.collab' })
}

/** kanban 任务状态词表（台账 T7 双源收敛：由上游 KanbanTaskStatus 类型派生，
 *  不再手抄字符串数组——上游词表变化时此处编译期报错，而非静默漂移） */
const KANBAN_STATUSES: ReadonlySet<KanbanTaskStatus> = new Set<KanbanTaskStatus>([
  'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived',
])

/** route query → 看板预选（status 过滤器 + task 搜索）。非法值忽略。 */
function applyQuery(q: Record<string, unknown>): void {
  if (q.tab === 'trace') tab.value = 'trace'
  else if (q.tab === 'accounts') tab.value = 'accounts'
  else if (q.tab === 'observatory') tab.value = 'observatory'
  else if (q.tab === 'gov') tab.value = 'gov'
  else if (q.tab === 'board') tab.value = 'board'
  if (typeof q.status === 'string' && KANBAN_STATUSES.has(q.status)) {
    kanban.setStatusFilter(q.status)
  }
  if (typeof q.task === 'string' && q.task) {
    kanban.setSearchQuery(q.task)
  }
}

/** 全链路追踪页签（2026-10-01）：Run Observatory 页签化——选会话复用既有
 *  CockpitRunTraceModal 单会话下钻（本页在 IaShell 内，弹窗已挂载），关闭回落看板页签 */
function onTraceSelectSession(sessionId: string): void {
  cockpit.openRunTrace({ sessionId })
}
function onTraceClose(): void {
  tab.value = 'board'
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

/** 管理三账决策点动线（三类决策对应）：偏差/风险 → 定位任务；
 *  资源 → 按人过滤看板；请求 → 审批收件箱。 */
function openTaskFromAccounts(taskId: string): void {
  tab.value = 'board'
  kanban.setSearchQuery(taskId)
}
function filterAssigneeFromAccounts(assignee: string): void {
  tab.value = 'board'
  kanban.setAssigneeFilter(assignee) // 空串=未指派桶清过滤（store 侧 falsy→null）
}
function goInboxFromAccounts(): void {
  void router.push({ name: 'ia2.inbox' })
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
      <!-- 管理三账（调研落地轮 2026-09-29）：进度/风险/资源三账 + 决策点联动 -->
      <button
        type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === 'accounts' }"
        role="tab"
        :aria-selected="tab === 'accounts'"
        data-testid="ia-tasks-tab-accounts"
        @click="tab = 'accounts'"
      >
        {{ t('ia2.tasks.tabAccounts') }}
      </button>
      <!-- 全链路追踪（2026-10-01 用户裁定）：Run Observatory 页签化，选会话走弹窗下钻 -->
      <button
        type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === 'observatory' }"
        role="tab"
        :aria-selected="tab === 'observatory'"
        data-testid="ia-tasks-tab-observatory"
        @click="tab = 'observatory'"
      >
        {{ rsText.tabObservatory }}
      </button>
      <!-- 治理中心平级页签（2026-10-01 用户裁定：内嵌不整页跳转——页签不再消失；
           独立路由 ia2.governance 保留为 IDE 侧/深链入口）。 -->

      <button
        type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === 'gov' }"
        role="tab"
        :aria-selected="tab === 'gov'"
        data-testid="ia-tasks-tab-governance"
        @click="tab = 'gov'"
      >
        {{ t('ia2.tasks.tabGovernance') }}
      </button>
      <!-- v12.6 右上角关闭钮（用户裁定：打开的 swarm kanban 页可关） -->
      <button
        type="button"
        class="ia-tasks__close"
        data-testid="ia-board-close"
        :title="t('cockpit.close')"
        :aria-label="t('cockpit.close')"
        @click="closeBoard"
      >×</button>
    </div>

    <div v-if="tab === 'board'" class="ia-tasks__board">
      <SwarmKanbanView />
    </div>
    <div v-else-if="tab === 'gov'" class="ia-area ia-tasks__gov" data-testid="ia-tasks-gov">
      <GovernanceView />
    </div>
    <div v-else-if="tab === 'accounts'" class="ia-area">
      <ManagementAccountsPanel
        @open-task="openTaskFromAccounts"
        @filter-assignee="filterAssigneeFromAccounts"
        @go-inbox="goInboxFromAccounts"
      />
    </div>
    <!-- 全链路追踪：RunTraceOverview 自足组件（useKanbanTaskGraph 数据面）；
         定高滚动容器内 flex 项防压扁（min-height:0 交给面板自管） -->
    <div v-else-if="tab === 'observatory'" class="ia-area ia-tasks__observatory" data-testid="ia-tasks-panel-observatory">
      <RunTraceOverview @select-session="onTraceSelectSession" @close="onTraceClose" />
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
  align-items: center;
}

.ia-tasks__gov { min-height: 0; overflow: hidden; }
.ia-tasks__close {
  margin-left: auto; flex-shrink: 0;
  width: 24px; height: 24px; padding: 0; margin-bottom: 2px;
  border: none; border-radius: 5px; background: transparent;
  color: var(--text-muted, #878c99); font-size: 16px; line-height: 1; cursor: pointer;
  &:hover { color: var(--text-primary, inherit); background: var(--bg-secondary, #f1f2f4); }
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

  /* 跳转型页签（治理中心入口）：非本页 tab，弱标识区分 */
  &--link { font-size: 12px; }
}

.ia-tasks__board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 全链路追踪页签容器：.ia-area 已给定高 flex 列，面板根 flex:1 自适应；此处只收溢出 */
.ia-tasks__observatory {
  overflow: hidden;
}
</style>
