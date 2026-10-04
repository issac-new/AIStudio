<!-- overlay/custom/client/ia2/views/TasksView.vue -->
<!-- 工作项区（/app/board，swarm kanban 页）：单层页签（2026-10-01 用户裁定：
     不要二级页签——治理中心 5 分区拆平，全站唯一二级页签消除）。
     页签 1 看板 = 内嵌 SwarmKanbanView 既有看板；
     页签 2 追溯矩阵 = 需求 → run → 产出任务 → 验证轮次（§7B.2）；
     页签 3 三账与体检 = 管理三账（进度/风险/资源+决策点）+ 治理体检（六闸卡+六域体检）；
     页签 4 全链路追踪 = Run Observatory 任务/运行拓扑；
     页签 5-8 = 治理中心四分区平级化（组织与知识/台账与规则/审计与变更/文档评审）。
     深链预选：/app/board?tab=<key>&status=<kanban 状态>&task=<taskId>
     ——旧 ?tab=gov 别名映射 gov-org（治理首分区，外部深链不死链）；
     status 预选看板状态过滤器、task 预选搜索框（合法状态词表校验，非法值忽略不炸页面）。 -->
<script setup lang="ts">
import type { KanbanTaskStatus } from '@/api/hermes/kanban'
import { onMounted, ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import TabIntroBanner from '../components/TabIntroBanner.vue'
import TraceabilityMatrix from '../components/TraceabilityMatrix.vue'
import ManagementAccountsPanel from '@/custom/kanban/components/ManagementAccountsPanel.vue'
import RunTraceOverview from '@/custom/cockpit/components/RunTraceOverview.vue'
import GovHealthSection from './gov/GovHealthSection.vue'
import GovOrgKnowledgeView from './gov/GovOrgKnowledgeView.vue'
import GovRegistryRulesView from './gov/GovRegistryRulesView.vue'
import GovAuditChangeView from './gov/GovAuditChangeView.vue'
import GovDocsReviewView from './gov/GovDocsReviewView.vue'
import GovHarnessView from './gov/GovHarnessView.vue'
import { useTasksTabsText } from '../i18n-tasks-tabs'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const kanban = useKanbanStore()
const cockpit = useCockpitStore()

/** 单层页签全集（2026-10-01）：文案单一事实源=i18n-tasks-tabs 模块字典 */
type TabKey = 'board' | 'trace' | 'accounts' | 'observatory' | 'gov-org' | 'gov-registry' | 'gov-audit' | 'gov-docs' | 'gov-harness'
const tab = ref<TabKey>('board')
const tabText = useTasksTabsText()

const TABS: ReadonlyArray<{ key: TabKey; testid: string }> = [
  { key: 'board', testid: 'ia-tasks-tab-board' },
  { key: 'trace', testid: 'ia-tasks-tab-trace' },
  { key: 'accounts', testid: 'ia-tasks-tab-accounts' },
  { key: 'observatory', testid: 'ia-tasks-tab-observatory' },
  { key: 'gov-org', testid: 'ia-tasks-tab-gov-org' },
  { key: 'gov-registry', testid: 'ia-tasks-tab-gov-registry' },
  { key: 'gov-audit', testid: 'ia-tasks-tab-gov-audit' },
  { key: 'gov-docs', testid: 'ia-tasks-tab-gov-docs' },
  { key: 'gov-harness', testid: 'ia-tasks-tab-gov-harness' },
]
type TabTextKey = 'tabBoard' | 'tabTrace' | 'tabAccounts' | 'tabObservatory' | 'tabGovOrg' | 'tabGovRegistry' | 'tabGovAudit' | 'tabGovDocs' | 'tabGovHarness'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  board: 'tabBoard',
  trace: 'tabTrace',
  accounts: 'tabAccounts',
  observatory: 'tabObservatory',
  'gov-org': 'tabGovOrg',
  'gov-registry': 'tabGovRegistry',
  'gov-audit': 'tabGovAudit',
  'gov-docs': 'tabGovDocs',
  'gov-harness': 'tabGovHarness',
}
const TAB_KEYS: ReadonlySet<string> = new Set(TABS.map(x => x.key))
/** 旧深链兼容：治理中心单页签时代的 ?tab=gov → 治理首分区 */
const TAB_ALIASES: Readonly<Record<string, TabKey>> = { gov: 'gov-org' }

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

/** UX 裁决 E：?new=1 深链直开列内建卡表单 */
const autoOpenCreate = computed(() => route.query.new === '1' || route.query.new === 'true')

/** route query → 看板预选（tab 切换 + status 过滤器 + task 搜索）。非法值忽略。 */
function applyQuery(q: Record<string, unknown>): void {
  if (typeof q.tab === 'string') {
    const raw = q.tab
    const key = TAB_ALIASES[raw] ?? raw
    if (TAB_KEYS.has(key)) tab.value = key as TabKey
  }
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
// 同路由 query 变化（已在 /app/board 时被深链再次唤起）同样生效
watch(
  () => route.query,
  (q) => { applyQuery(q as Record<string, unknown>) },
)

// 页签 → URL 回写（2026-10-03 走查 L4）：此前切换页签只改本地 tab，
// 刷新/分享后页签位置丢失。同值跳过避免与上方 query watch 互相触发。
// task/status 是一次性深链参数，回写时剥离——否则用户清掉的过滤器会在每次
// 切页签时被 URL 残影复活（query watch 重放 applyQuery 覆盖用户输入态）
watch(tab, (key) => {
  if (route.query.tab === key) return
  const { task: _t, status: _s, ...rest } = route.query as Record<string, unknown>
  void router.replace({ name: 'ia2.board', query: { ...rest, tab: key } })
})

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
        v-for="tb in TABS" :key="tb.key" type="button"
        class="ia-tasks__tab"
        :class="{ 'ia-tasks__tab--active': tab === tb.key }"
        role="tab"
        :aria-selected="tab === tb.key"
        :data-testid="tb.testid"
        @click="tab = tb.key"
      >
        {{ tabText[TAB_LABEL_KEY[tb.key]] }}
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

    <TabIntroBanner :tab="tab" />

    <div v-if="tab === 'board'" class="ia-tasks__board">
      <SwarmKanbanView :auto-open-create="autoOpenCreate" />
    </div>
    <!-- 三账与体检（2026-10-01 整合）：管理三账 + 治理体检同页签堆叠——
         同属管理者健康总览语义，滚动一屏读全 -->
    <div v-else-if="tab === 'accounts'" class="ia-area ia-tasks__panel" data-testid="ia-tasks-panel-accounts">
      <ManagementAccountsPanel
        @open-task="openTaskFromAccounts"
        @filter-assignee="filterAssigneeFromAccounts"
        @go-inbox="goInboxFromAccounts"
      />
      <GovHealthSection />
    </div>
    <div v-else-if="tab === 'gov-org'" class="ia-area" data-testid="ia-tasks-panel-gov-org">
      <GovOrgKnowledgeView />
    </div>
    <div v-else-if="tab === 'gov-registry'" class="ia-area" data-testid="ia-tasks-panel-gov-registry">
      <GovRegistryRulesView />
    </div>
    <div v-else-if="tab === 'gov-audit'" class="ia-area" data-testid="ia-tasks-panel-gov-audit">
      <GovAuditChangeView />
    </div>
    <div v-else-if="tab === 'gov-docs'" class="ia-area" data-testid="ia-tasks-panel-gov-docs">
      <GovDocsReviewView />
    </div>
    <div v-else-if="tab === 'gov-harness'" class="ia-area" data-testid="ia-tasks-panel-gov-harness">
      <GovHarnessView />
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
  gap: 2px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
  align-items: center;
}

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
  padding: 6px 11px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;

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

/* 三账与体检：纵向堆叠滚动面板（flex 项防压扁——overflow 容器内 flex 子项
   自动最小尺寸不为 0 会把内容裁成薄条的已知坑，min-height:0 显式收口） */
.ia-tasks__panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 16px;
}

/* 全链路追踪页签容器：.ia-area 已给定高 flex 列，面板根 flex:1 自适应；此处只收溢出 */
.ia-tasks__observatory {
  overflow: hidden;
}
</style>
