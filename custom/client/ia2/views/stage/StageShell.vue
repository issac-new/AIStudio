<!-- overlay/custom/client/ia2/views/stage/StageShell.vue
     六阶段工作页（2026-10-18 阶段页页签批）：
     每个阶段只保留一层页签，页签直接挂可操作组件；页面高度固定，只有当前
     页签内容区滚动。页签键与文案单一事实源=stage-tabs.ts；阶段文案与完成键
     单一事实源=stage-meta.ts；运行进度/步骤进度单一读面=useDailyStageProgress。
     旧 /app/gov/* 深链由 routes 重定向到本页并带 ?tab=，页面不再有「治理中心」壳。
     日常与整轮推演分离：本页不内嵌运行监控/证据/交付等推演面板；②启动准备
     只核对条件并跳转「全流程推演·运行编排」。 -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import OrgEditor from '../../components/gov/OrgEditor.vue'
import ClearancePanel from '../gov/ClearancePanel.vue'
import GovIssuesPanel from '../gov/GovIssuesPanel.vue'
import DailyTracePanel from './DailyTracePanel.vue'
import DailyDeliveryPanel from './DailyDeliveryPanel.vue'
import DailyUatPanel from './DailyUatPanel.vue'
import DailyG5Panel from './DailyG5Panel.vue'
import StageSetupSteps from './StageSetupSteps.vue'
import StageRequirementsOverview from './StageRequirementsOverview.vue'
import StagePreflight from './StagePreflight.vue'
import StageAcceptanceOverview from './StageAcceptanceOverview.vue'
import StageDevToday from './StageDevToday.vue'
import StageSchedulePanel from './StageSchedulePanel.vue'
import StageGatePanel from './StageGatePanel.vue'
import StageRiskPanel from './StageRiskPanel.vue'
import StageMetricsPanel from './StageMetricsPanel.vue'
import StageAssetsPanel from './StageAssetsPanel.vue'
import StageDevApprovals from './StageDevApprovals.vue'
import { STAGE_META, SETUP_STEPS, type StageMeta } from '../../stage-meta'
import { STAGE_TABS, resolveTab, tabMeta } from '../../stage-tabs'
import { useDailyStageProgress } from '../../composables/useDailyStageProgress'
import { stageBoardStatuses, stageBoardStatusLabel } from '../../stage-task-filter'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const props = defineProps<{ stage: 1 | 2 | 3 | 4 | 5 | 6 }>()

const progress = useDailyStageProgress()
const meta = computed<StageMeta>(() => STAGE_META[props.stage - 1])
const tabs = computed(() => STAGE_TABS[props.stage])
const activeTab = computed(() => resolveTab(props.stage, route.query.tab))
const currentTab = computed(() => tabMeta(props.stage, activeTab.value) ?? tabs.value[0])

const STATE_LABEL = {
  done: { zh: '本阶段完成', en: 'Stage complete' },
  current: { zh: '当前阶段', en: 'Current stage' },
  pending: { zh: '未开始', en: 'Not started' },
} as const
const stageState = computed(() => progress.stageState(props.stage))

/** 阶段页主操作：只做「本阶段最该做的一步」，不堆第二排按钮。 */
const STEP_TAB: Record<string, string> = {
  org: 'org', accounts: 'accounts', teams: 'teams', env: 'assets', agents: 'agents',
}
const primary = computed<{ label: string; tab?: string; route?: string }>(() => {
  if (props.stage === 1) {
    const first = SETUP_STEPS.find((s) => {
      const state = progress.stepState(s)
      return state !== 'done' && state !== 'untracked'
    })
    return {
      label: first ? (zh.value ? `继续第 ${first.no} 步` : `Continue step ${first.no}`) : (zh.value ? '查看五步' : 'View steps'),
      tab: first ? STEP_TAB[first.key] : 'steps',
    }
  }
  if (props.stage === 2) return { label: zh.value ? '推进 G1' : 'Advance G1', tab: 'g1' }
  if (props.stage === 3) return { label: zh.value ? '进入任务分解' : 'Open task breakdown', tab: 'tasks' }
  if (props.stage === 4) return { label: zh.value ? '打开看板' : 'Open board', tab: 'board' }
  if (props.stage === 5) return { label: zh.value ? '开始 UAT' : 'Start UAT', tab: 'uat' }
  return { label: zh.value ? '处理未清算项' : 'Resolve open items', tab: 'clearance' }
})

function openTab(key: string): void {
  if (key === activeTab.value) return
  void router.replace({ query: { ...route.query, tab: key } })
}

function runPrimary(): void {
  if (primary.value.route) void router.push({ name: primary.value.route })
  else if (primary.value.tab) openTab(primary.value.tab)
}

/** 阶段工具：跨页/跨域直达（STAGE_META.tools 的唯一消费面）；带 from 保留阶段语境 */
function openTool(tool: { to: string }): void {
  void router.push({ path: tool.to, query: { from: String(props.stage) } })
}

// B6：页签横滚可发现性——右缘渐隐只在还有未滚内容时显示（滚到底隐藏）。
// 左缘渐隐由 sticky 伪元素自持（未滚动时落在自身占位槽内，不遮内容）。
const tabsEl = ref<HTMLElement | null>(null)
const tabsAtEnd = ref(true)
function syncTabsEnd(): void {
  const el = tabsEl.value
  tabsAtEnd.value = !el || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
}
onMounted(() => syncTabsEnd())

// 任务抽屉：今日工作/排期页签点行就地打开，不整页跳看板
const drawerTaskId = ref<string | null>(null)
const drawerOpen = ref(false)
function openTask(taskId: string): void {
  drawerTaskId.value = taskId
  drawerOpen.value = true
}
function openInbox(): void {
  // 审批就地开页签：④开发→审批待办，⑤验收→G5 审批；其余阶段才落全局收件箱
  if (props.stage === 4) { openTab('approvals'); return }
  if (props.stage === 5) { openTab('g5'); return }
  void router.push({ name: 'ia2.inbox' })
}

// 重组件按需加载：避免任一阶段页把看板/文档/审计/案例全部打进首屏。
// P2（2026-10-19）：统一挂加载骨架（延迟 200ms 防闪现）与错误重试面，异步页签不再白屏等待。
const TabSkeleton = {
  name: 'TabSkeleton',
  template: `<div class="stg__skeleton" data-testid="stg-tab-skeleton"><span></span><span></span><span></span></div>`,
}
const TabLoadError = {
  name: 'TabLoadError',
  emits: ['retry'],
  template: `<div class="stg__load-error" data-testid="stg-tab-load-error">页签加载失败<button type="button" @click="$emit('retry')">重试</button></div>`,
}
function lazyTab(loader: () => Promise<unknown>): Component {
  return defineAsyncComponent({
    // 显式解包 default：ESM 互操作探测在测试 mock 下不成立（模块对象会被当组件用）
    loader: async () => {
      const mod = await loader() as { default?: Component }
      return mod.default ?? (mod as unknown as Component)
    },
    loadingComponent: TabSkeleton,
    delay: 200,
    errorComponent: TabLoadError,
    timeout: 30_000,
  })
}
const AsyncKanban = lazyTab(() => import('@/custom/kanban/views/SwarmKanbanView.vue'))
const AsyncAccounts = lazyTab(() => import('../AccountAdminView.vue'))
const AsyncTeams = lazyTab(() => import('../TeamsView.vue'))
const AsyncAgents = lazyTab(() => import('../agents/AgentsView.vue'))
const AsyncDocs = lazyTab(() => import('../gov/GovDocsReviewView.vue'))
const AsyncAudit = lazyTab(() => import('../gov/GovAuditChangeView.vue'))
const AsyncReviewGov = lazyTab(() => import('../gov/ReviewGovPanel.vue'))
const AsyncImprove = lazyTab(() => import('../gov/HarnessImprovePanel.vue'))
const AsyncPosture = lazyTab(() => import('../gov/GovPostureView.vue'))
const AsyncSecAudit = lazyTab(() => import('../gov/SecAuditPanel.vue'))
const AsyncCases = lazyTab(() => import('@custom/matrix-teams/views/DeliveryCasesView.vue'))

const TAB_COMPONENTS: Record<string, Component> = {
  setupSteps: StageSetupSteps,
  org: OrgEditor,
  accounts: AsyncAccounts,
  teams: AsyncTeams,
  assets: StageAssetsPanel,
  agents: AsyncAgents,
  requirements: StageRequirementsOverview,
  docs: AsyncDocs,
  g1: StageGatePanel,
  g2: StageGatePanel,
  preflight: StagePreflight,
  board: AsyncKanban,
  schedule: StageSchedulePanel,
  today: StageDevToday,
  approvals: StageDevApprovals,
  risk: StageRiskPanel,
  quality: StageGatePanel,
  acceptance: StageAcceptanceOverview,
  trace: DailyTracePanel,
  delivery: DailyDeliveryPanel,
  uat: DailyUatPanel,
  g5: DailyG5Panel,
  cases: AsyncCases,
  clearance: ClearancePanel,
  issues: GovIssuesPanel,
  posture: AsyncPosture,
  secAudit: AsyncSecAudit,
  audit: AsyncAudit,
  reviewGov: AsyncReviewGov,
  improve: AsyncImprove,
  metrics: StageMetricsPanel,
  gateLog: StageGatePanel,
}

const TAB_PROPS: Record<string, Record<string, unknown>> = {
  g1: { gates: ['G1'] },
  g2: { gates: ['G2'] },
  analysis: { scope: 'g2' },
  quality: { gates: ['G3', 'G4'] },
}
/** ③④阶段页内嵌看板只显示本阶段在办的卡（映射单一事实源=stage-task-filter.ts）；
 *  其他阶段页签不传 statuses，行为与全量看板一致。 */
const boardStatuses = computed(() => currentTab.value.component === 'board' ? stageBoardStatuses(props.stage) : [])
const boardStatusLabel = computed(() => stageBoardStatusLabel(props.stage, zh.value))
const currentProps = computed(() => {
  const base = TAB_PROPS[activeTab.value] ?? {}
  return boardStatuses.value.length ? { ...base, statuses: boardStatuses.value } : base
})
</script>

<template>
  <div class="stg" :data-testid="`stg-page-${stage}`">
    <IaBreadcrumb />
    <header class="stg__head">
      <span class="stg__no" :class="`stg__no--${stageState}`">{{ stage }}</span>
      <div class="stg__heading">
        <div class="stg__titleline">
          <h1 class="stg__title">{{ meta.title }}</h1>
          <span class="stg__state" :data-testid="`stg-state-${stage}`">{{ zh ? STATE_LABEL[stageState].zh : STATE_LABEL[stageState].en }}</span>
        </div>
        <p class="stg__what">{{ meta.what }}</p>
      </div>
      <button type="button" class="stg__primary" data-testid="stg-primary" @click="runPrimary">
        {{ primary.label }} →
      </button>
    </header>

    <nav v-if="meta.tools.length" class="stg__tools" :aria-label="zh ? '阶段工具' : 'Stage tools'" data-testid="stg-tools">
      <span class="stg__tools-label">{{ zh ? '阶段工具' : 'Stage tools' }}</span>
      <button
        v-for="tool in meta.tools"
        :key="tool.key"
        type="button"
        class="stg__tool"
        :data-testid="`stg-tool-${tool.key}`"
        :title="tool.desc"
        @click="openTool(tool)"
      >{{ tool.label }} →</button>
    </nav>

    <nav ref="tabsEl" class="stg__tabs" :class="{ 'stg__tabs--end': tabsAtEnd }" role="tablist" :aria-label="meta.title" data-testid="stage-tabs-scroll" @scroll="syncTabsEnd">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        class="stg__tab"
        :class="{ 'stg__tab--on': activeTab === t.key }"
        :aria-selected="activeTab === t.key"
        :data-testid="`stg-tab-${t.key}`"
        @click="openTab(t.key)"
      >{{ zh ? t.zh : t.en }}</button>
    </nav>

    <div id="stg-panel" class="stg__body" role="tabpanel" :aria-label="zh ? currentTab.zh : currentTab.en">
      <!-- P2-9（走查 §四）：阶段页内嵌的是全量看板，与「常用 · 看板」同源；
           这里明确说明并给全量入口，避免用户以为有三份不同的看板。 -->
      <div v-if="currentTab.component === 'board'" class="stg__same-src" data-testid="stg-board-note">
        <span data-testid="stg-board-filter-note">{{ zh
          ? `本阶段视图：只显示「${boardStatusLabel}」的任务，与「常用 · 看板」同源。`
          : `Stage view: only ${boardStatusLabel} tasks (same source as Common · Board).` }}</span>
        <button type="button" data-testid="stg-open-full-board" @click="router.push({ name: 'ia2.board' })">{{ zh ? '在全量看板打开 →' : 'Open full board →' }}</button>
      </div>
      <component
        :is="TAB_COMPONENTS[currentTab.component]"
        v-bind="currentProps"
        @open-tab="openTab"
        @open-task="openTask"
        @open-inbox="openInbox"
        @open-all="router.push({ name: 'ia2.inbox' })"
      />
    </div>

    <KanbanTaskDrawer v-if="drawerOpen" v-model:show="drawerOpen" :task-id="drawerTaskId" />
  </div>
</template>

<style scoped>
.stg {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 16px;
  overflow: hidden;
}
.stg__head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.stg__no {
  width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border-color);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
}
.stg__no--done { color: var(--ia-fresh); border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.stg__no--current { color: var(--ia-stale); border-color: color-mix(in srgb, var(--ia-stale) 45%, var(--border-color)); }
.stg__heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.stg__titleline { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.stg__title { margin: 0; font-size: 16px; }
.stg__state { font-size: 11px; color: var(--text-muted); }
.stg__no--done ~ .stg__heading .stg__state { color: var(--ia-fresh); }
.stg__what { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.55; }
.stg__runhint {
  flex-shrink: 0; align-self: center;
  font-size: 11px; color: var(--text-muted);
  border: 1px dashed var(--border-color); border-radius: 999px; padding: 2px 10px;
}
.stg__primary {
  border: 1px solid var(--accent-primary); border-radius: 6px;
  background: transparent; color: var(--accent-primary);
  font-family: inherit; font-size: 12px; padding: 5px 14px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
}
.stg__primary:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.stg__primary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.stg__tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.stg__tools-label { font-size: 11px; color: var(--text-muted); }
.stg__tool {
  border: 1px solid var(--border-color); border-radius: 999px;
  background: transparent; color: var(--text-secondary);
  padding: 2px 10px; font: inherit; font-size: 11.5px; cursor: pointer;
}
.stg__tool:hover { color: var(--text-primary); background: var(--bg-secondary); }
.stg__tool:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.stg__tabs { position: relative; display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
.stg__tab {
  border: 0; border-bottom: 2px solid transparent; background: transparent;
  padding: 7px 11px; font-family: inherit; font-size: 12.5px;
  color: var(--text-muted); cursor: pointer; white-space: nowrap;
}
.stg__tab:hover { color: var(--text-primary); }
.stg__tab:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.stg__tab--on { color: var(--accent-primary); border-bottom-color: var(--accent-primary); font-weight: 600; }
.stg__body { flex: 1; min-height: 0; overflow: auto; padding-top: 2px; }
.stg__same-src {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: 0 0 8px; padding: 6px 10px; border: 1px dashed var(--border-color); border-radius: 6px;
  font-size: 11.5px; color: var(--text-muted);
}
.stg__same-src button {
  border: none; background: none; color: var(--accent-info); font-size: 11.5px; cursor: pointer; white-space: nowrap;
}
/* 异步页签加载骨架（P2）：三条渐进灰条占位，替代白屏等待 */
.stg__skeleton { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.stg__skeleton span {
  height: 14px; border-radius: 4px;
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary, var(--bg-secondary)) 50%, var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: stg-skeleton-wave 1.2s ease-in-out infinite;
}
.stg__skeleton span:nth-child(2) { width: 82%; animation-delay: 0.12s; }
.stg__skeleton span:nth-child(3) { width: 64%; animation-delay: 0.24s; }
@keyframes stg-skeleton-wave { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.stg__load-error {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--ia-fail);
}
.stg__load-error button {
  border: 1px solid var(--border-color); background: transparent; color: inherit;
  border-radius: 4px; padding: 2px 10px; font-size: 12px; cursor: pointer;
}
.stg__tabs::before, .stg__tabs::after { content: ''; position: sticky; top: 0; z-index: 1; width: 18px; flex: 0 0 18px; pointer-events: none; }
.stg__tabs::before { left: 0; background: linear-gradient(to right, var(--bg-primary), transparent); }
.stg__tabs::after { right: 0; background: linear-gradient(to left, var(--bg-primary), transparent); }
/* B6：滚到底（或本就无溢出）时收起右缘渐隐，露出最后一个页签的右缘 */
.stg__tabs--end::after { display: none; }
</style>
