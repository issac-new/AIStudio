<!-- overlay/custom/client/ia2/views/journey/JourneyView.vue -->
<!-- 旅程首页（D12 时序重构，2026-10-17 用户裁定）：产品默认入口——
     按「从 0 到 1」的使用时序组织八阶段（与方案 26 步七幕同构）：
     ①建立组织 ②准备资产 ③需求冻结 ④需求分析 ⑤设计排期 ⑥生产交付
     ⑦发布验收 ⑧治理改进。每卡=状态（run-state 步键推导）+一句话+直达入口；
     无轮次=引导态（从①开始，入口直达既有功能）。三中心=阶段内工具舱。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'

const route = useRoute()
const router = useRouter()
const run = computed(() => String(route.query.run ?? '').trim())
const runState = ref<{ posture: string; gates: Record<string, string>; steps: Record<string, string>; ledger: { open: number } } | null>(null)
const loadError = ref('')

async function load(): Promise<void> {
  loadError.value = ''
  runState.value = null
  if (!run.value) return
  try {
    const res = await authFetch(`/api/hermes/sim/run-state?run=${encodeURIComponent(run.value)}`)
    if (!res.ok) throw new Error(String(res.status))
    runState.value = await res.json() as typeof runState.value
  } catch (e) {
    loadError.value = (e as Error).message
  }
}
watch(run, () => { void load() }, { immediate: true })

/** 八阶段：完成键（任一在 state 即算完成）+入口路由+一句话（用户时序原话为纲） */
interface Stage {
  no: number
  title: string
  what: string
  keys: string[]
  target: { name: string; query?: Record<string, string> }
  tools: string
}
const STAGES: ReadonlyArray<Stage> = [
  {
    no: 1, title: '建立组织', what: '从零开始：建账号、定编制、设团队领导与协调关系（谁向谁汇报、谁和谁协作）。',
    keys: ['smoke_done'], target: { name: 'ia2.govOrgAssets' }, tools: '治理中心·组织与资产',
  },
  {
    no: 2, title: '准备资产', what: '环境信息、应用资产登记、hermes agent 就位（每员工配 AI 助理）。',
    keys: ['appinit_done', 'people_done', 'login_done'], target: { name: 'ia2.simOps' }, tools: '推演中心·运行观测＋治理·系统设置',
  },
  {
    no: 3, title: '需求冻结', what: '第一张需求单进场：验收标准定清楚、范围划清，G1 需求冻结上锁。',
    keys: ['g1_frozen'], target: { name: 'ia2.sim', query: {} }, tools: '推演中心·轮次总览（闸行）',
  },
  {
    no: 4, title: '需求分析', what: '任务分解、四路系分、概设定稿——把需求拆成可执行的活儿。',
    keys: ['analysis_done', 'anexec_done', 'review_done'], target: { name: 'ia2.simSupervision' }, tools: '推演中心·监督面板',
  },
  {
    no: 5, title: '设计排期', what: '架构评审过 G2、排期定窗口——谁在什么时间做什么。',
    keys: ['archgate_done'], target: { name: 'ia2.simOrchestration' }, tools: '推演中心·场景编排',
  },
  {
    no: 6, title: '生产交付', what: '六路并行编码+独立测试；期间协调全在工作台：看板流转、群沟通、等你拍板的介入卡。',
    keys: ['devimpl_done', 'defect_done', 'testpass_done'], target: { name: 'ia2.inbox' }, tools: '工作台·把关待办＋看板＋沟通',
  },
  {
    no: 7, title: '发布验收', what: 'G5 发布准出（人工批准）、UAT 逐条判词——交付完成。',
    keys: ['g5_ready', 'release_done', 'uat_done'], target: { name: 'ia2.simTrace' }, tools: '推演中心·需求追溯',
  },
  {
    no: 8, title: '治理改进', what: '台账、审计、复盘；欠账清偿；度量体检——组织越跑越聪明的回路。',
    keys: ['workmgr_done', 'audit_done', 'retro_done', 'report_done', 'close_done'], target: { name: 'ia2.govClearance' }, tools: '治理中心·清偿门＋度量体检',
  },
]

type StageState = 'done' | 'active' | 'pending'
function stageState(st: Stage): StageState {
  if (!runState.value) return 'pending'
  const merged = { ...runState.value.steps, ...runState.value.gates }
  const hit = st.keys.some(k => k in merged)
  if (hit) return 'done'
  // 当前阶段=第一个未完成阶段（无轮数据时全部 pending，由引导态接管）
  const firstPending = STAGES.find(s => !s.keys.some(k => k in { ...runState.value!.steps, ...runState.value!.gates }))
  return firstPending?.no === st.no ? 'active' : 'pending'
}

const runInput = ref('')
function submitRun(): void {
  const r = runInput.value.trim()
  if (!r) return
  void router.replace({ query: { ...route.query, run: r } })
}
function go(st: Stage): void {
  void router.push(st.target)
}
</script>

<template>
  <div class="jrn" data-testid="jrn-page">
    <header class="jrn__head">
      <div>
        <h1 class="jrn__title">旅程：从 0 到 1，建组织、跑交付、做治理</h1>
        <p class="jrn__sub">按使用时序的八个阶段走完一家 AI 研发组织的完整交付旅程——每一步告诉你做什么、去哪做。</p>
      </div>
      <div class="jrn__runbar">
        <input v-model="runInput" class="jrn__input" data-testid="jrn-run" placeholder="输入轮次目录名查看该轮进度（如 demo-20261016）" @keyup.enter="submitRun">
        <button class="jrn__btn" type="button" data-testid="jrn-load" @click="submitRun">查看进度</button>
      </div>
    </header>

    <!-- 无轮引导态：从①开始 -->
    <div v-if="!run && !loadError" class="jrn__guide" data-testid="jrn-guide">
      <p class="jrn__guide-title">还没有进行中的轮次——从阶段①建立组织开始：</p>
      <button class="jrn__guide-btn" type="button" data-testid="jrn-start" @click="go(STAGES[0])">去建立组织（治理中心·组织与资产）→</button>
    </div>
    <p v-if="loadError" class="jrn__error" data-testid="jrn-error">轮次数据不可达：{{ loadError }}</p>

    <ol class="jrn__stages">
      <li
        v-for="st in STAGES"
        :key="st.no"
        class="jrn__card"
        :class="`jrn__card--${runState ? stageState(st) : 'pending'}`"
        :data-testid="`jrn-stage-${st.no}`"
        role="button"
        @click="go(st)"
      >
        <div class="jrn__card-head">
          <span class="jrn__no">{{ st.no }}</span>
          <span class="jrn__card-title">{{ st.title }}</span>
          <span class="jrn__state" :data-testid="`jrn-state-${st.no}`">
            {{ runState ? (stageState(st) === 'done' ? '✓ 完成' : stageState(st) === 'active' ? '● 进行中' : '未开始') : '' }}
          </span>
        </div>
        <p class="jrn__what">{{ st.what }}</p>
        <p class="jrn__tools">工具舱：{{ st.tools }} <span class="jrn__go">进入 →</span></p>
      </li>
    </ol>
  </div>
</template>

<style scoped lang="scss">
.jrn { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; height: 100%; overflow: auto; }
.jrn__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.jrn__title { margin: 0; font-size: 16px; }
.jrn__sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted, #878c99); }
.jrn__runbar { display: flex; gap: 6px; }
.jrn__input {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 5px 10px;
  font-size: 12px; width: 300px; background: transparent; color: inherit;
  font-family: var(--font-mono, ui-monospace, monospace);
}
.jrn__btn {
  border: 1px solid var(--accent-primary, var(--color-primary, #3b82f6)); border-radius: 6px;
  background: transparent; color: var(--accent-primary, var(--color-primary, #3b82f6));
  font-size: 12px; padding: 5px 14px; cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--accent-primary, #3b82f6) 12%, transparent); }
}
.jrn__guide {
  border: 1px dashed var(--accent-primary, var(--color-primary, #3b82f6)); border-radius: 8px;
  padding: 12px 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--accent-primary, #3b82f6) 6%, transparent);
}
.jrn__guide-title { margin: 0; font-size: 13px; }
.jrn__guide-btn {
  border: none; background: var(--accent-primary, var(--color-primary, #3b82f6)); color: #fff;
  border-radius: 6px; padding: 6px 16px; font-size: 12px; cursor: pointer;
}
.jrn__error { color: #d33; font-size: 12px; margin: 0; }
.jrn__stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.jrn__card {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 14px 16px;
  cursor: pointer; display: flex; flex-direction: column; gap: 6px;
  &:hover { border-color: var(--accent-primary, var(--color-primary, #3b82f6)); }
}
.jrn__card--done { border-left: 3px solid var(--ia-fresh, #2e9e5b); }
.jrn__card--active { border-left: 3px solid var(--ia-stale, #b8860b); background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent); }
.jrn__card--pending { border-left: 3px solid var(--border-color, #e5e7eb); }
.jrn__card-head { display: flex; align-items: baseline; gap: 8px; }
.jrn__no {
  font-size: 16px; font-weight: 700; color: var(--text-muted, #878c99); font-variant-numeric: tabular-nums;
  .jrn__card--done & { color: var(--ia-fresh, #2e9e5b); }
  .jrn__card--active & { color: var(--ia-stale, #b8860b); }
}
.jrn__card-title { font-size: 14px; font-weight: 600; }
.jrn__state { margin-left: auto; font-size: 11px; color: var(--text-muted, #878c99); }
.jrn__card--done .jrn__state { color: var(--ia-fresh, #2e9e5b); }
.jrn__card--active .jrn__state { color: var(--ia-stale, #b8860b); font-weight: 600; }
.jrn__what { margin: 0; font-size: 12px; line-height: 1.6; }
.jrn__tools { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); }
.jrn__go { color: var(--accent-primary, var(--color-primary, #3b82f6)); }
</style>
