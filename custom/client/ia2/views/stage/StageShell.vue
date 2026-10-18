<!-- overlay/custom/client/ia2/views/stage/StageShell.vue
     六阶段工作页（2026-10-18 阶段页页签批）：
     每个阶段只保留一层页签，页签直接挂可操作组件；页面高度固定，只有当前
     页签内容区滚动。页签键与文案单一事实源=stage-tabs.ts；阶段文案与完成键
     单一事实源=stage-meta.ts；运行进度/步骤进度单一读面=useStageProgress。
     旧 /app/gov/* 深链由 routes 重定向到本页并带 ?tab=，页面不再有「治理中心」壳。
     日常与整轮推演分离：本页不内嵌运行监控/证据/交付等推演面板；②启动准备
     只核对条件并跳转「全流程推演·运行编排」。 -->
<script setup lang="ts">
import { computed, defineAsyncComponent, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import OrgEditor from '../../components/gov/OrgEditor.vue'
import GatekeeperSection from '../../components/inbox/GatekeeperSection.vue'
import ClearancePanel from '../gov/ClearancePanel.vue'
import GovIssuesPanel from '../gov/GovIssuesPanel.vue'
import TracePanel from '../sim/TracePanel.vue'
import DeliveryPanel from '../sim/DeliveryPanel.vue'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'
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
import RunSelector from '../sim/RunSelector.vue'
import { STAGE_META, SETUP_STEPS, type StageMeta } from '../../stage-meta'
import { STAGE_TABS, resolveTab, tabMeta } from '../../stage-tabs'
import { useStageProgress } from '../../composables/useStageProgress'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const props = defineProps<{ stage: 1 | 2 | 3 | 4 | 5 | 6 }>()

const progress = useStageProgress()
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
/** ②⑤⑥ 的页签内容按运行取数：运行选择器放在页头，页签内不再手打目录名 */
const needsRun = computed(() => [2, 5, 6].includes(props.stage))

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

// 重组件按需加载：避免任一阶段页把看板/文档/审计/案例全部打进首屏
const AsyncKanban = defineAsyncComponent(() => import('@/custom/kanban/views/SwarmKanbanView.vue').then(m => m.default))
const AsyncAccounts = defineAsyncComponent(() => import('../AccountAdminView.vue').then(m => m.default))
const AsyncTeams = defineAsyncComponent(() => import('../TeamsView.vue').then(m => m.default))
const AsyncAgents = defineAsyncComponent(() => import('../agents/AgentsView.vue').then(m => m.default))
const AsyncDocs = defineAsyncComponent(() => import('../gov/GovDocsReviewView.vue').then(m => m.default))
const AsyncAudit = defineAsyncComponent(() => import('../gov/GovAuditChangeView.vue').then(m => m.default))
const AsyncCases = defineAsyncComponent(() => import('@custom/matrix-teams/views/DeliveryCasesView.vue').then(m => m.default))
const AsyncOrchestration = defineAsyncComponent(() => import('../orchestration/OrchestrationView.vue').then(m => m.default))

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
  launch: AsyncOrchestration,
  board: AsyncKanban,
  schedule: StageSchedulePanel,
  today: StageDevToday,
  approvals: GatekeeperSection,
  risk: StageRiskPanel,
  quality: StageGatePanel,
  acceptance: StageAcceptanceOverview,
  trace: TracePanel,
  delivery: DeliveryPanel,
  uat: TracePanel,
  g5: ApprovalPanel,
  cases: AsyncCases,
  clearance: ClearancePanel,
  issues: GovIssuesPanel,
  audit: AsyncAudit,
  metrics: StageMetricsPanel,
  gateLog: StageGatePanel,
}

const TAB_PROPS: Record<string, Record<string, unknown>> = {
  g1: { gates: ['G1'] },
  g2: { gates: ['G2'] },
  quality: { gates: ['G3', 'G4'] },
  uat: { onlyUnjudged: true },
  g5: { pollMs: 10000, showHistory: true, hideTitle: true },
}
const currentProps = computed(() => TAB_PROPS[activeTab.value] ?? {})
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
      <RunSelector v-if="needsRun" class="stg__run" />
      <button type="button" class="stg__primary" data-testid="stg-primary" @click="runPrimary">
        {{ primary.label }} →
      </button>
    </header>

    <nav class="stg__tabs" role="tablist" :aria-label="meta.title">
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
      <component
        :is="TAB_COMPONENTS[currentTab.component]"
        v-bind="currentProps"
        @open-tab="openTab"
        @open-task="openTask"
        @open-inbox="openInbox"
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
.stg__run { flex-shrink: 0; }
.stg__primary {
  border: 1px solid var(--accent-primary); border-radius: 6px;
  background: transparent; color: var(--accent-primary);
  font-family: inherit; font-size: 12px; padding: 5px 14px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
}
.stg__primary:hover { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
.stg__primary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.stg__tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
.stg__tab {
  border: 0; border-bottom: 2px solid transparent; background: transparent;
  padding: 7px 11px; font-family: inherit; font-size: 12.5px;
  color: var(--text-muted); cursor: pointer; white-space: nowrap;
}
.stg__tab:hover { color: var(--text-primary); }
.stg__tab:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.stg__tab--on { color: var(--accent-primary); border-bottom-color: var(--accent-primary); font-weight: 600; }
.stg__body { flex: 1; min-height: 0; overflow: auto; padding-top: 2px; }
</style>
