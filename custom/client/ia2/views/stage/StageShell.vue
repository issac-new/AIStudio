<!-- overlay/custom/client/ia2/views/stage/StageShell.vue -->
<!-- D13 时序阶段工作页（2026-10-17 用户裁定：全部前端功能按使用时序重组）：
     六阶段各有真工作页——直接挂载该阶段的核心工具组件（复用既有件），
     其余工具为入口卡。阶段=时序（26 步七幕映射），功能不再按中心分舱。
     阶段进度读 run-state（可选 query.run），与旅程首页同一推导。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import KeyLedgerSection from '../gov/KeyLedgerSection.vue'
import ClearancePanel from '../gov/ClearancePanel.vue'
import GateRepairsPanel from '../gov/GateRepairsPanel.vue'
import TracePanel from '../sim/TracePanel.vue'
import GovOrgKnowledgeView from '../gov/GovOrgKnowledgeView.vue'
import HandoffSection from '../../components/kanban/HandoffSection.vue'
import CapacityLampBanner from '../gov/CapacityLampBanner.vue'

const route = useRoute()
const router = useRouter()
const props = defineProps<{ stage: 1 | 2 | 3 | 4 | 5 | 6 }>()

const run = computed(() => String(route.query.run ?? '').trim())
const runState = ref<{ steps: Record<string, string>; gates: Record<string, string> } | null>(null)
const loadError = ref('')
async function load(): Promise<void> {
  loadError.value = ''
  runState.value = null
  if (!run.value) return
  try {
    const res = await authFetch(`/api/hermes/sim/run-state?run=${encodeURIComponent(run.value)}`)
    if (!res.ok) throw new Error(String(res.status))
    runState.value = await res.json() as typeof runState.value
  } catch (e) { loadError.value = (e as Error).message }
}
watch(run, () => { void load() }, { immediate: true })

interface Tool { label: string; desc: string; to: string; name: string }
interface StageMeta {
  no: 1 | 2 | 3 | 4 | 5 | 6
  key: string
  title: string
  what: string
  source: string
  act: string
  keys: string[]
  tools: Tool[]
}

/** 六阶段正本：工具=该阶段真实要用的功能（挂入口直达既有页；核心工具由各阶段页另挂） */
const STAGES: Record<number, StageMeta> = {
  1: {
    no: 1, key: 'stage-setup', title: '搭台：建立组织与资产',
    what: '从 0 开始：建账号、定编制、设团队领导与协调关系；登记应用资产；hermes agent 就位；环境冒烟。',
    source: '组织与资产注册表、运行观测健康探测。',
    act: '开新组织的第一步，全部完成后才进入需求阶段。',
    keys: ['smoke_done'],
    tools: [
      { label: '组织与资产', desc: '人员编制·RACI·账号·应用资产·密钥台账', to: '/app/gov/org-assets', name: 'ia2.govOrgAssets' },
      { label: '系统设置', desc: '账号/agent/环境/模型等组织级配置', to: '/app/gov/settings', name: 'ia2.govSettings' },
      { label: '运行观测', desc: '四服务健康·派发器·agent 就位探测', to: '/app/sim/ops', name: 'ia2.simOps' },
    ],
  },
  2: {
    no: 2, key: 'stage-reqs', title: '需求：冻结与开跑',
    what: '第一张需求单进场：验收标准≥3 条可判、范围划清；G1 需求冻结上锁；建群预邀；场景编排选姿态开轮。',
    source: '冻结单（origin/main 可反查）·闸键 g1_frozen。',
    act: '锁后不许改，改则重新走锁；开轮后进入分析。',
    keys: ['g1_frozen'],
    tools: [
      { label: '轮次总览', desc: '姿态横幅·六闸行（G1 状态）·净额卡', to: '/app/sim', name: 'ia2.sim' },
      { label: '场景编排', desc: '开轮/续跑/姿态切换·preflight 检视', to: '/app/sim/orchestration', name: 'ia2.simOrchestration' },
      { label: '文档评审', desc: '冻结单字段级核对（缺项红显）', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
  3: {
    no: 3, key: 'stage-design', title: '分析设计：拆解与排期',
    what: '派发任务分解、四路系分、概设定稿；G2 架构评审（历史偏差硬拦）；排期定窗口，测试独立成项。',
    source: '看板任务链·系分稿·排期计划。',
    act: '没设计不编码——G2 不过不准排期是铁闸。',
    keys: ['analysis_done', 'anexec_done', 'review_done', 'archgate_done'],
    tools: [
      { label: '看板·任务协同', desc: '任务分解·分诊·依赖图', to: '/app/board', name: 'ia2.board' },
      { label: '监督面板', desc: '分析期研判·观察窗', to: '/app/sim/supervision', name: 'ia2.simSupervision' },
      { label: '关卡与流程', desc: 'G2 评审状态·闸修复单', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
  4: {
    no: 4, key: 'stage-build', title: '生产：编码测试与日常协调',
    what: '六路并行编码+独立测试（测试者≠写码者）；期间协调全在工作台：看板流转、群沟通、等你拍板的介入卡。',
    source: '看板·沟通流·inbox 介入队列·证据存证。',
    act: '在制≤2；完成必带双凭证；缺陷报→修→验全关才准出。',
    keys: ['devimpl_done', 'defect_done', 'testpass_done'],
    tools: [
      { label: '把关待办 inbox', desc: '介入卡·清偿审批·收尾令模板', to: '/app/inbox', name: 'ia2.inbox' },
      { label: '看板（工作台三栏）', desc: '我的卡·沟通·IDE 画布', to: '/app/collab', name: 'ia2.collab' },
      { label: 'IDE 画布', desc: '生产位：任务简报·分支新鲜度', to: '/app/ide', name: 'ide.shell' },
      { label: '证据库', desc: '帧图廊·锚点反查·消息存证', to: '/app/sim/evidence', name: 'ia2.simEvidence' },
    ],
  },
  5: {
    no: 5, key: 'stage-accept', title: '验收：发布与 UAT',
    what: 'G5 发布准出（人工批准留痕）·完备性检查·UAT 逐条判词（通过/有条件/不通过）——交付完成。',
    source: 'approved.events·验收书判词·AC 判词链。',
    act: '判词只认结构化字段；任一条不过回缺陷回流。',
    keys: ['g5_ready', 'release_done', 'uat_done'],
    tools: [
      { label: '需求追溯', desc: 'AC→用例→测试→UAT 判词四列', to: '/app/sim/trace', name: 'ia2.simTrace' },
      { label: '交付健康', desc: '分支推送·交付物 14 件链', to: '/app/sim/delivery', name: 'ia2.simDelivery' },
      { label: '把关待办', desc: 'G5 人工批准入口', to: '/app/inbox', name: 'ia2.inbox' },
    ],
  },
  6: {
    no: 6, key: 'stage-govern', title: '治理：清偿审计与改进',
    what: '工作台账·审计意见书·复盘治理报告；代偿欠账清偿（开新轮前必须清零）；度量体检——组织越跑越聪明。',
    source: 'issues.log·清偿台账·审计流·巡检官快照。',
    act: '问题单 100% 有处置结论；复盘行动项进下一轮。',
    keys: ['workmgr_done', 'audit_done', 'retro_done', 'report_done', 'close_done'],
    tools: [
      { label: '清偿门', desc: '欠账清单·resolve/waive 审批', to: '/app/gov/clearance', name: 'ia2.govClearance' },
      { label: '问题单对账', desc: '处置率·台账全量', to: '/app/gov/issues', name: 'ia2.govIssues' },
      { label: '度量体检', desc: '五卡体检·磁盘水位预警', to: '/app/gov', name: 'ia2.governance' },
      { label: '审计与变更', desc: '四查状态·基线变更记录', to: '/app/gov', name: 'ia2.governance' },
    ],
  },
}

const meta = computed<StageMeta>(() => STAGES[props.stage])
const merged = computed(() => (runState.value ? { ...runState.value.steps, ...runState.value.gates } : {}))
const stageState = computed<'done' | 'active' | 'pending'>(() => {
  if (!runState.value) return 'pending'
  if (meta.value.keys.some(k => k in merged.value)) return 'done'
  const order = [1, 2, 3, 4, 5, 6]
  const firstPending = order.find(n => !STAGES[n].keys.some(k => k in merged.value))
  return firstPending === props.stage ? 'active' : 'pending'
})
function go(t: Tool): void {
  void router.push(t.to)
}
</script>

<template>
  <div class="stg" :data-testid="`stg-page-${meta.no}`">
    <header class="stg__head">
      <span class="stg__no" :class="`stg__no--${stageState}`">{{ meta.no }}</span>
      <div class="stg__heading">
        <h1 class="stg__title">{{ meta.title }}</h1>
        <span v-if="runState" class="stg__state" :data-testid="`stg-state-${meta.no}`">
          {{ stageState === 'done' ? '✓ 本阶段完成' : stageState === 'active' ? '● 当前阶段' : '未开始' }}
        </span>
      </div>
      <p v-if="loadError" class="stg__error">{{ loadError }}</p>
    </header>
    <TabIntroBanner :tab="meta.key" />
    <!-- D14 阶段内嵌核心操作（不只直达卡） -->
    <section v-if="stage === 1" class="stg__embed" data-testid="stg-embed-1">
      <h3 class="stg__embed-h">密钥台账（本阶段可直接操作）</h3>
      <KeyLedgerSection />
    </section>
    <section v-else-if="stage === 2" class="stg__embed" data-testid="stg-embed-2">
      <h3 class="stg__embed-h">闸修复单（需求阶段 G1 冻结的关卡记录）</h3>
      <GateRepairsPanel />
    </section>
    <section v-else-if="stage === 3" class="stg__embed" data-testid="stg-embed-3">
      <h3 class="stg__embed-h">协作断点诊断与知识图谱（分析期的组织视图）</h3>
      <GovOrgKnowledgeView />
    </section>
    <section v-else-if="stage === 4" class="stg__embed" data-testid="stg-embed-4">
      <h3 class="stg__embed-h">生产期风险与交接</h3>
      <CapacityLampBanner />
      <HandoffSection />
    </section>
    <section v-else-if="stage === 5" class="stg__embed" data-testid="stg-embed-5">
      <h3 class="stg__embed-h">AC 判词链（验收现场核对）</h3>
      <TracePanel />
    </section>
    <section v-else-if="stage === 6" class="stg__embed" data-testid="stg-embed-6">
      <h3 class="stg__embed-h">清偿门（本阶段可直接操作）</h3>
      <ClearancePanel />
    </section>
    <div class="stg__tools">
      <button
        v-for="t in meta.tools"
        :key="t.label"
        type="button"
        class="stg__tool"
        :data-testid="`stg-tool-${t.label}`"
        @click="go(t)"
      >
        <span class="stg__tool-label">{{ t.label }}</span>
        <span class="stg__tool-desc">{{ t.desc }}</span>
        <span class="stg__go">进入 →</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stg { display: flex; flex-direction: column; gap: 12px; padding: 20px 24px; height: 100%; overflow: auto; }
.stg__head { display: flex; align-items: center; gap: 12px; }
.stg__no { font-size: 26px; font-weight: 800; color: var(--text-muted, #878c99); font-variant-numeric: tabular-nums; }
.stg__no--done { color: var(--ia-fresh, #2e9e5b); }
.stg__no--active { color: var(--ia-stale, #b8860b); }
.stg__heading { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.stg__title { margin: 0; font-size: 16px; }
.stg__state { font-size: 12px; color: var(--text-muted, #878c99); }
.stg__error { color: #d33; font-size: 12px; margin: 0 0 0 auto; }
.stg__embed { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 14px; background: rgba(127, 127, 127, 0.04); }
.stg__embed-h { margin: 0 0 10px; font-size: 13px; }
.stg__tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.stg__tool {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 12px 14px;
  background: transparent; color: inherit; cursor: pointer;
  &:hover { border-color: var(--accent-primary, var(--color-primary, #3b82f6)); background: rgba(127, 127, 127, 0.06); }
}
.stg__tool-label { font-size: 13px; font-weight: 600; }
.stg__tool-desc { font-size: 11.5px; color: var(--text-muted, #878c99); }
.stg__go { font-size: 11px; color: var(--accent-primary, var(--color-primary, #3b82f6)); margin-top: 2px; }
</style>
