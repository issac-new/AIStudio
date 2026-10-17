<!-- overlay/custom/client/ia2/views/stage/StageShell.vue -->
<!-- D18 时序阶段工作页（2026-10-17 设计正本 §5.0/§5.2）：六阶段各有真工作页。
     阶段文案与工具卡定义单一事实源=stage-meta.ts（STAGE_META），本组件不各自
     定义——终结 D13 起三处各自定义的双轨形态。①搭建渲染 SETUP_STEPS 五步骤
     清单（建立组织→账号→团队协调→环境资产→智能体），其余五阶段保留 D14-D16
     内嵌核心操作件。阶段进度读 run-state（useRunContext：query.run 优先，
     回落最近一次成功读取的记忆），与旅程页同一推导。
     工具卡 testid 拼稳定 key 不拼 label（D18 解耦：改名零 churn）。
     层级批第二阶段（2026-10-17）：②④⑤⑥各补一块高频件内嵌（运行态势/证据
     反查/交付健康/问题清单对账），阶段页成为本阶段工作台，工具卡只留整页入口。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import KeyLedgerSection from '../gov/KeyLedgerSection.vue'
import ClearancePanel from '../gov/ClearancePanel.vue'
import GateRepairsPanel from '../gov/GateRepairsPanel.vue'
import TracePanel from '../sim/TracePanel.vue'
import CockpitPanel from '../sim/CockpitPanel.vue'
import EvidencePanel from '../sim/EvidencePanel.vue'
import DeliveryPanel from '../sim/DeliveryPanel.vue'
import GovIssuesPanel from '../gov/GovIssuesPanel.vue'
import GovOrgKnowledgeView from '../gov/GovOrgKnowledgeView.vue'
import HandoffSection from '../../components/kanban/HandoffSection.vue'
import CapacityLampBanner from '../gov/CapacityLampBanner.vue'
import GatekeeperSection from '../../components/inbox/GatekeeperSection.vue'
import { useRunContext } from '../../composables/useRunContext'
import { STAGE_META, SETUP_STEPS, type SetupStep, type StageTool } from '../../stage-meta'

const router = useRouter()
const props = defineProps<{ stage: 1 | 2 | 3 | 4 | 5 | 6 }>()

// run 上下文与四个中心面板同源（useRunContext）：query.run 优先，无 query 回落
// 最近一次成功读取的记忆值——阶段页不再因「没带 ?run=」就显示不出进度。
const { run, remember } = useRunContext()
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
    remember()
  } catch (e) { loadError.value = (e as Error).message }
}
watch(run, () => { void load() }, { immediate: true })

const meta = computed(() => STAGE_META.find(s => s.no === props.stage)!)
const merged = computed(() => (runState.value ? { ...runState.value.steps, ...runState.value.gates } : {}))
const stageState = computed<'done' | 'active' | 'pending'>(() => {
  if (!runState.value) return 'pending'
  if (meta.value.keys.some(k => k in merged.value)) return 'done'
  const order = [1, 2, 3, 4, 5, 6]
  const firstPending = order.find(n => !STAGE_META[n - 1].keys.some(k => k in merged.value))
  return firstPending === props.stage ? 'active' : 'pending'
})

// ── ①搭建五步骤（SETUP_STEPS 单一事实源，设计正本 §5.2）─────────────
/** 步骤状态：有键按 run-state 推导；无键=轮次内不跟踪（诚实呈现，不假装完成） */
type StepState = 'done' | 'active' | 'pending' | 'untracked'
function stepState(st: SetupStep): StepState {
  if (st.keys.length === 0) return 'untracked'
  if (!runState.value) return 'pending'
  if (st.keys.some(k => k in merged.value)) return 'done'
  const firstPending = SETUP_STEPS.find(s => s.keys.length > 0 && !s.keys.some(k => k in merged.value))
  return firstPending?.key === st.key ? 'active' : 'pending'
}
function go(t: StageTool | { to: string }): void {
  // 带上来路阶段：工具卡落点多为跨阶段复用的中心/末端页，顶栏按来路高亮
  void router.push({ path: t.to, query: { from: String(meta.value.no) } })
}
function goStep(st: SetupStep): void {
  const target = st.target
  const from = String(meta.value.no)
  if (typeof target === 'string') void router.push({ path: target, query: { from } })
  else void router.push({ ...target, query: { ...(target.query ?? {}), from } })
}
</script>

<template>
  <div class="stg" :data-testid="`stg-page-${meta.no}`">
    <IaBreadcrumb />
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
    <!-- ①搭建：五步骤有序清单（D19 收敛：单行步骤，判据与挂账注解转悬停提示） -->
    <section v-if="stage === 1" class="stg__steps" data-testid="stg-steps-1">
      <ol class="stg__step-list">
        <li
          v-for="st in SETUP_STEPS"
          :key="st.key"
          class="stg__step"
          :class="`stg__step--${stepState(st)}`"
          :data-testid="`stg-step-${st.key}`"
          :title="`完成判据：${st.criteria}${st.note ? `（${st.note}）` : ''}`"
        >
          <span class="stg__step-no">{{ st.no }}</span>
          <span class="stg__step-name">{{ st.name }}</span>
          <span class="stg__step-purpose">{{ st.purpose }}</span>
          <span class="stg__step-state" :data-testid="`stg-step-state-${st.key}`">
            {{ stepState(st) === 'done' ? '✓ 完成' : stepState(st) === 'active' ? '● 待完成' : stepState(st) === 'untracked' ? '轮次内不跟踪' : '未开始' }}
          </span>
          <button
            type="button"
            class="stg__step-go"
            :data-testid="`stg-step-go-${st.key}`"
            @click="goStep(st)"
          >进入 →</button>
        </li>
      </ol>
      <div class="stg__embed" data-testid="stg-embed-1">
        <h3 class="stg__embed-h">密钥台账（环境与资产·本阶段可直接操作）</h3>
        <KeyLedgerSection />
      </div>
      <p class="stg__more">
        <button
          type="button"
          class="stg__more-link"
          data-testid="stg-more-settings"
          title="账号/智能体/环境/模型等组织级配置"
          @click="go({ to: '/app/gov/settings' })"
        >更多配置 → 系统设置</button>
      </p>
    </section>
    <!-- ②-⑥阶段：内嵌核心操作（D14-D16 既有件保留，标题随术语表更新） -->
    <section v-else-if="stage === 2" class="stg__embed" data-testid="stg-embed-2">
      <h3 class="stg__embed-h">质量门修复单（需求阶段 G1 需求冻结的门禁记录）</h3>
      <GateRepairsPanel />
    </section>
    <section v-else-if="stage === 3" class="stg__embed" data-testid="stg-embed-3">
      <h3 class="stg__embed-h">断点诊断与知识图谱（分析期的组织视图）</h3>
      <GovOrgKnowledgeView />
    </section>
    <section v-else-if="stage === 4" class="stg__embed" data-testid="stg-embed-4">
      <h3 class="stg__embed-h">开发期风险与交接</h3>
      <CapacityLampBanner />
      <HandoffSection />
    </section>
    <section v-if="stage === 4" class="stg__embed" data-testid="stg-embed-4b">
      <h3 class="stg__embed-h">审批待办（等人工决定的事项·开发期实时队列）</h3>
      <GatekeeperSection />
    </section>
    <section v-else-if="stage === 5" class="stg__embed" data-testid="stg-embed-5">
      <h3 class="stg__embed-h">AC 判定链（验收现场核对）</h3>
      <TracePanel />
    </section>
    <section v-else-if="stage === 6" class="stg__embed" data-testid="stg-embed-6">
      <h3 class="stg__embed-h">遗留项清算（本阶段可直接操作）</h3>
      <ClearancePanel />
    </section>
    <!-- 阶段页工作台化（2026-10-17 层级批第二阶段）：各阶段高频件直接内嵌，
         阶段页从「跳板」变「工作台」——本阶段日常操作不必跳去中心再跳回。
         内嵌件全部复用中心既有自足组件（自带数据面与空态），零新端点。 -->
    <section v-if="stage === 2" class="stg__embed" data-testid="stg-embed-2b">
      <h3 class="stg__embed-h">运行态势（运行模式·遗留项清算灯·服务异常，点条进运行总览）</h3>
      <CockpitPanel />
    </section>
    <section v-if="stage === 4" class="stg__embed" data-testid="stg-embed-4c">
      <h3 class="stg__embed-h">证据反查（贴事件号或提交号，一键回原文）</h3>
      <EvidencePanel />
    </section>
    <section v-if="stage === 5" class="stg__embed" data-testid="stg-embed-5b">
      <h3 class="stg__embed-h">交付健康（分支新鲜度·14 件交付物核对）</h3>
      <DeliveryPanel />
    </section>
    <section v-if="stage === 6" class="stg__embed" data-testid="stg-embed-6b">
      <h3 class="stg__embed-h">问题清单对账（处置率·逐条状态）</h3>
      <GovIssuesPanel />
    </section>
    <div v-if="meta.tools.length" class="stg__tools">
      <button
        v-for="t in meta.tools"
        :key="t.key"
        type="button"
        class="stg__tool"
        :data-testid="`stg-tool-${t.key}`"
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
.stg { display: flex; flex-direction: column; gap: 10px; padding: 16px 24px; height: 100%; overflow: auto; }
.stg__head { display: flex; align-items: center; gap: 12px; }
.stg__no { font-size: 26px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.stg__no--done { color: var(--ia-fresh, var(--ia-fresh)); }
.stg__no--active { color: var(--ia-stale, var(--ia-stale)); }
.stg__heading { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.stg__title { margin: 0; font-size: 16px; }
.stg__state { font-size: 12px; color: var(--text-muted); }
.stg__error { color: var(--ia-fail); font-size: 12px; margin: 0 0 0 auto; }
.stg__embed { border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; background: rgba(127, 127, 127, 0.04); }
.stg__embed-h { margin: 0 0 10px; font-size: 13px; }
.stg__steps { display: flex; flex-direction: column; gap: 10px; }
.stg__step-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.stg__step {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--border-color); border-radius: 8px; padding: 7px 12px;
  background: transparent;
  &--done { border-left: 3px solid var(--ia-fresh, #2e9e5b); }
  &--active { border-left: 3px solid var(--ia-stale, #b8860b); background: color-mix(in srgb, var(--ia-stale, #b8860b) 5%, transparent); }
  &--pending, &--untracked { border-left: 3px solid var(--border-color); }
}
.stg__step-no { font-size: 14px; font-weight: 800; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 16px; }
.stg__step--done .stg__step-no { color: var(--ia-fresh, var(--ia-fresh)); }
.stg__step--active .stg__step-no { color: var(--ia-stale, var(--ia-stale)); }
.stg__step-name { font-size: 13px; font-weight: 600; flex-shrink: 0; }
.stg__step-purpose {
  flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stg__step-state { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }
.stg__step--done .stg__step-state { color: var(--ia-fresh, var(--ia-fresh)); }
.stg__step--active .stg__step-state { color: var(--ia-stale, var(--ia-stale)); font-weight: 600; }
.stg__step-go {
  border: 1px solid var(--accent-primary, var(--color-primary)); border-radius: 6px;
  background: transparent; color: var(--accent-primary, var(--color-primary));
  font-size: 12px; padding: 4px 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0;
  &:hover { background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 12%, transparent); }
  &:disabled { border-color: var(--text-muted); color: var(--text-muted); cursor: not-allowed; }
}
.stg__more { margin: 0; font-size: 12px; color: var(--text-muted); }
.stg__more-link {
  border: none; background: transparent; padding: 0; cursor: pointer; font-family: inherit;
  color: var(--accent-primary, var(--color-primary)); font-size: 12px;
}
.stg__tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.stg__tool {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;
  border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px;
  background: transparent; color: inherit; cursor: pointer;
  &:hover { border-color: var(--accent-primary, var(--color-primary)); background: rgba(127, 127, 127, 0.06); }
}
.stg__tool-label { font-size: 13px; font-weight: 600; }
.stg__tool-desc { font-size: 11.5px; color: var(--text-muted); }
.stg__go { font-size: 11px; color: var(--accent-primary, var(--color-primary)); margin-top: 2px; }
</style>
