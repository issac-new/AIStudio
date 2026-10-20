<!-- overlay/custom/client/ia2/views/sim/DirectorPanel.vue
     导演台（2026-10-20 日常/推演拆分 P2 → 产品内推演 P4）：
     上半区=产品内图推演：需求 → 模块图 → 真实看板任务 → 人工闸；不依赖 harness 脚本。
     下半区=当前 harness 运行视图（只读导演视图）。
     首屏回答：这次演到哪、谁在演、卡在谁、下一步做什么；机读明细收进技术详情。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchRunState, type RunStateResponse } from '../../api/overview'
import { ACTS_7, countStepsDone, resolveGateRows, resolveStepRows } from './steps-registry'
import { useRunContext } from '../../composables/useRunContext'
import { useWorkspaceStore } from '../../store/workspace'
import { useDecisionRows } from '../../composables/useDecisionRows'
import OverviewPanel from './OverviewPanel.vue'
import {
  fetchDirectorScenarios, planDirectorScenario, startDirectorScenario,
  fetchGraphRun, fetchGraphEvents, resumeGraphGate,
  pendingGatesOf, recentEventRows,
  type DirectorScenario, type DirectorInput, type DirectorPlan,
  type GraphEvent, type GraphRunState,
} from '../../api/sim-director'

const router = useRouter()
const { run, remember } = useRunContext()
const workspace = useWorkspaceStore()
const { decisionRows } = useDecisionRows()

// ── 上半区：产品内图推演 ──────────────────────────────────────────────
const FALLBACK_SCENARIO: DirectorScenario = {
  id: 'default',
  title: '收单商户多端小程序支付收银台',
  description: '微信/支付宝双渠道支付收银台，含支付核心/渠道适配/小程序前端',
  modules: ['pay-core', 'channel-wechat', 'channel-alipay', 'cashier-mp'],
  assignees: { 'pay-core': 'chen', 'channel-wechat': 'hu', 'channel-alipay': 'lin', 'cashier-mp': 'xiao' },
}

const scenarios = ref<DirectorScenario[]>([])
const form = ref({ title: '', description: '', modules: '', cast: '' })
const plan = ref<DirectorPlan | null>(null)
const planning = ref(false)
const starting = ref(false)
const graphError = ref('')
const graphMsg = ref('')
const graphRunId = ref('')
const graphRun = ref<GraphRunState | null>(null)
const graphEvents = ref<GraphEvent[]>([])
const graphLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const GRAPH_RUN_KEY = 'ia2.directorGraphRun'
const GRAPH_STATUS_LABEL: Record<string, string> = {
  running: '运行中', 'awaiting-input': '等待人工', completed: '已完成', failed: '失败', paused: '已暂停', unknown: '未知',
}
const EVENT_LABEL: Record<string, string> = {
  'run.started': '运行开始', 'node.started': '节点开始', 'node.completed': '节点完成', 'node.failed': '节点失败',
  'interrupt.raised': '等待人工闸', 'graph.interrupt': '等待人工闸',
  'interrupt.resumed': '人工闸已处理', 'graph.resume': '人工闸已处理',
  'run.completed': '运行完成', 'run.failed': '运行失败', 'run.progress': '运行进度',
}

function applyScenario(s: DirectorScenario): void {
  const modules = s.modules ?? []
  const assignees = s.assignees ?? {}
  form.value = {
    title: s.title,
    description: s.description,
    modules: modules.join(', '),
    cast: modules.map(m => assignees[m] ?? '').filter(Boolean).join(', ') || 'chen, hu, lin, xiao',
  }
}

function splitList(v: string): string[] {
  return v.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean)
}

function buildInput(): DirectorInput {
  const modules = splitList(form.value.modules)
  const cast = splitList(form.value.cast)
  const assignees: Record<string, string> = {}
  modules.forEach((m, i) => { assignees[m] = cast[i] ?? cast[0] ?? 'chen' })
  return {
    title: form.value.title.trim(),
    description: form.value.description.trim(),
    ...(modules.length ? { modules } : {}),
    ...(Object.keys(assignees).length ? { assignees } : {}),
  }
}

async function loadScenarios(): Promise<void> {
  try {
    const list = await fetchDirectorScenarios()
    scenarios.value = list
    applyScenario(list[0] ?? FALLBACK_SCENARIO)
  } catch {
    scenarios.value = []
    applyScenario(FALLBACK_SCENARIO)
  }
}

async function preview(): Promise<void> {
  planning.value = true
  graphError.value = ''
  graphMsg.value = ''
  try {
    plan.value = await planDirectorScenario(buildInput())
    graphMsg.value = `已生成 ${plan.value.nodeCount} 个节点、${plan.value.gateCount} 道人工闸。`
  } catch (e) {
    plan.value = null
    graphError.value = e instanceof Error ? e.message : String(e)
  } finally {
    planning.value = false
  }
}

async function start(): Promise<void> {
  const input = buildInput()
  if (!input.title || !input.description) { graphError.value = '需求标题和描述不能为空。'; return }
  const ok = window.confirm('启动会创建真实看板任务并由代理执行，可能持续较长时间。确认启动这次产品内推演？')
  if (!ok) return
  starting.value = true
  graphError.value = ''
  graphMsg.value = ''
  try {
    const r = await startDirectorScenario(input)
    graphRunId.value = r.runId
    try { localStorage.setItem(GRAPH_RUN_KEY, r.runId) } catch { /* 隐私模式忽略 */ }
    graphMsg.value = `已起跑：${r.runId}（${r.cast.length} 位模拟员工）。`
    await refreshGraph()
    startPolling()
  } catch (e) {
    graphError.value = e instanceof Error ? e.message : String(e)
  } finally {
    starting.value = false
  }
}

async function refreshGraph(): Promise<void> {
  const id = graphRunId.value.trim()
  if (!id) return
  graphLoading.value = true
  graphError.value = ''
  try {
    const [runState, events] = await Promise.all([fetchGraphRun(id), fetchGraphEvents(id)])
    graphRun.value = runState
    graphEvents.value = events
  } catch (e) {
    graphError.value = e instanceof Error ? e.message : String(e)
  } finally {
    graphLoading.value = false
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(() => {
    const status = String(graphRun.value?.instance?.status ?? '')
    if (status === 'completed' || status === 'failed') { stopPolling(); return }
    void refreshGraph()
  }, 3000)
}
function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function approveGate(interruptId: string, approved: boolean): Promise<void> {
  if (!graphRunId.value) return
  graphMsg.value = ''
  graphError.value = ''
  try {
    await resumeGraphGate(graphRunId.value, interruptId, approved)
    graphMsg.value = approved ? '已批准，继续执行。' : '已打回；该分支不会继续。'
    await refreshGraph()
  } catch (e) {
    graphError.value = e instanceof Error ? e.message : String(e)
  }
}

const pendingGates = computed(() => pendingGatesOf(graphEvents.value))
const recentEvents = computed(() => recentEventRows(graphEvents.value, 10))
/** 实例 status 在 resume/等卡期间可能滞留 awaiting-input；以事件流为准，
 *  只有未应答 interrupt 才显示“等待人工”。 */
const graphStatus = computed(() => {
  const inst = String(graphRun.value?.instance?.status ?? '')
  if (inst === 'completed' || inst === 'failed') return inst
  if (pendingGates.value.length) return 'awaiting-input'
  const kind = (e: GraphEvent): string => String(e.kind ?? e.type ?? '')
  const last = [...graphEvents.value].reverse().find(e => /^(run\.(completed|failed|started)|node\.(started|completed|failed)|interrupt\.(raised|resumed))$/.test(kind(e)))
  if (last) {
    if (kind(last) === 'run.completed') return 'completed'
    if (kind(last) === 'run.failed') return 'failed'
    if (kind(last) === 'interrupt.raised') return 'awaiting-input'
  }
  if (inst === 'paused') return 'paused'
  return inst === 'unknown' && !graphEvents.value.length ? 'unknown' : 'running'
})
const graphStatusLabel = computed(() => GRAPH_STATUS_LABEL[graphStatus.value] ?? graphStatus.value)
const planCounts = computed(() => {
  const nodes = plan.value?.spec.nodes ?? []
  const count = (type: string) => nodes.filter(n => n.type === type).length
  return { tasks: count('agent-task'), reviews: count('agent-review'), tests: count('agent-test'), gates: count('human-gate'), reports: count('report-gen') }
})
const eventLabel = (kind: string): string => EVENT_LABEL[kind] ?? kind

// ── 下半区：harness 运行只读视图 ──────────────────────────────────────
const loading = ref(false)
const loadError = ref('')
const state = ref<RunStateResponse | null>(null)
const showTechnical = ref(false)

async function load(): Promise<void> {
  const name = run.value.trim()
  if (!name) { state.value = null; return }
  loading.value = true
  loadError.value = ''
  try {
    state.value = await fetchRunState(name)
    remember()
  } catch {
    state.value = null
    loadError.value = '本轮运行数据暂不可用（可能尚未启动或已被清理）。'
  } finally {
    loading.value = false
  }
}
watch(run, () => { void load() })

const stepRows = computed(() => state.value ? resolveStepRows(state.value.steps, state.value.gates) : [])
const gateRows = computed(() => state.value ? resolveGateRows(state.value.gates, state.value.steps, null) : [])
const stepsDone = computed(() => countStepsDone(stepRows.value))
const gatesPassed = computed(() => gateRows.value.filter(g => g.passed).length)

const acts = computed(() => {
  const current = ACTS_7.find(a => stepRows.value.filter(r => r.no >= a.from && r.no <= a.to && r.state !== 'done').length > 0)?.act ?? ACTS_7.length
  return ACTS_7.map(a => {
    const rows = stepRows.value.filter(r => r.no >= a.from && r.no <= a.to)
    const done = rows.filter(r => r.state === 'done').length
    return {
      ...a,
      done,
      total: rows.length,
      status: rows.length > 0 && done === rows.length ? 'done' : a.act === current ? 'current' : done > 0 ? 'current' : 'pending',
    }
  })
})

const cast = computed(() => {
  const counts = new Map<string, number>()
  for (const e of workspace.rawTasks) {
    const who = String(e.task.assignee ?? '').trim()
    if (!who) continue
    counts.set(who, (counts.get(who) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
})
const interventions = computed(() => decisionRows.value.slice(0, 3))
const openLedger = computed(() => state.value?.ledger.open ?? 0)

function goOrchestration(): void { void router.push({ name: 'ia2.simOrchestration' }) }
function goInbox(): void { void router.push({ name: 'ia2.inbox' }) }
function goDaily(): void { void router.push({ name: 'ia2.collab' }) }

onMounted(() => {
  void loadScenarios()
  void load()
  try { graphRunId.value = localStorage.getItem(GRAPH_RUN_KEY) ?? '' } catch { graphRunId.value = '' }
  if (graphRunId.value) { void refreshGraph(); startPolling() }
})
onBeforeUnmount(() => { stopPolling() })
</script>

<template>
  <div class="dir" data-testid="director-panel">
    <!-- 上半区：产品内图推演 -->
    <section class="dir__card dir__graph" data-testid="director-graph">
      <header class="dir__head">
        <div>
          <h3 class="dir__title">产品内推演</h3>
          <p class="dir__sub">从需求生成模块图，创建真实看板任务，由代理执行；人工闸在这里放行。</p>
        </div>
      </header>

      <div class="dir__form">
        <label class="dir__field dir__field--wide">需求标题<input v-model="form.title" data-testid="director-form-title" /></label>
        <label class="dir__field dir__field--wide">需求描述<textarea v-model="form.description" rows="2" data-testid="director-form-desc" /></label>
        <label class="dir__field">模块（逗号分隔）<input v-model="form.modules" data-testid="director-form-modules" /></label>
        <label class="dir__field">模拟员工（按模块顺序）<input v-model="form.cast" data-testid="director-form-cast" /></label>
      </div>
      <div class="dir__actions">
        <button type="button" class="dir__btn" :disabled="planning" data-testid="director-plan" @click="preview">
          {{ planning ? '生成中…' : '预览场景' }}
        </button>
        <button type="button" class="dir__btn dir__btn--primary" :disabled="starting" data-testid="director-start-graph" @click="start">
          {{ starting ? '启动中…' : '启动推演 →' }}
        </button>
      </div>
      <p v-if="graphError" class="dir__error" data-testid="director-graph-error">{{ graphError }}</p>
      <p v-if="graphMsg" class="dir__ok" data-testid="director-graph-msg">{{ graphMsg }}</p>

      <div v-if="plan" class="dir__plan" data-testid="director-plan-preview">
        <div class="dir__plan-row"><b>模块</b><span v-for="m in plan.modules" :key="m" class="dir__pill">{{ m }}</span></div>
        <div class="dir__plan-row"><b>模拟员工</b><span v-for="p in plan.cast" :key="p" class="dir__pill dir__pill--person">{{ p }}</span></div>
        <p class="dir__hint">
          {{ planCounts.tasks }} 个任务节点 · {{ planCounts.reviews }} 个评审 · {{ planCounts.tests }} 个测试 ·
          {{ planCounts.gates }} 道人工闸 · {{ planCounts.reports }} 个报告节点
        </p>
      </div>

      <section v-if="graphRunId" class="dir__run" data-testid="director-graph-run">
        <header class="dir__run-head">
          <h4 class="dir__h">图运行 <span class="dir__h-n">{{ graphRunId }}</span></h4>
          <span class="dir__status" :class="`dir__status--${graphStatus}`">{{ graphStatusLabel }}</span>
          <button type="button" class="dir__link" :disabled="graphLoading" @click="refreshGraph">刷新</button>
        </header>

        <div v-if="pendingGates.length" class="dir__gates" data-testid="director-gates">
          <article v-for="g in pendingGates" :key="g.interruptId" class="dir__gate" :data-testid="`director-gate-${g.interruptId}`">
            <div class="dir__gate-main">
              <span class="dir__gate-prompt">{{ g.prompt }}</span>
              <span class="dir__gate-node">{{ g.nodeId }}</span>
            </div>
            <div class="dir__gate-actions">
              <button type="button" class="dir__btn dir__btn--primary" @click="approveGate(g.interruptId, true)">批准</button>
              <button type="button" class="dir__btn" @click="approveGate(g.interruptId, false)">打回</button>
            </div>
          </article>
        </div>
        <p v-else-if="graphStatus === 'awaiting-input'" class="dir__hint">等待人工闸，但暂未读到闸详情；点刷新重试。</p>
        <p v-else-if="graphStatus === 'completed'" class="dir__hint">图运行已完成。</p>
        <p v-else-if="graphStatus === 'failed'" class="dir__hint">图运行失败；展开最近事件查看停在哪个节点。</p>
        <p v-else class="dir__hint">代理执行中；人工闸出现时会在这里显示。</p>

        <details class="dir__events" data-testid="director-events">
          <summary>最近事件（{{ recentEvents.length }}）</summary>
          <ul>
            <li v-for="(e, i) in recentEvents" :key="i">
              <span>{{ eventLabel(e.kind) }}</span><span v-if="e.nodeId" class="dir__hint"> · {{ e.nodeId }}</span>
            </li>
          </ul>
        </details>
      </section>
    </section>

    <!-- 下半区：harness 运行只读视图 -->
    <section class="dir__harness" data-testid="director-harness">
      <h3 class="dir__title">Harness 运行</h3>
      <p v-if="loadError" class="dir__error" data-testid="director-error">{{ loadError }}</p>
      <div v-else-if="!state" class="dir__empty" data-testid="director-empty">
        <p class="dir__empty-title">当前没有可读的 harness 运行</p>
        <p class="dir__empty-sub">harness 运行由外部脚本启动；这里展示当前运行、模拟员工与待人介入。</p>
        <div class="dir__actions">
          <button type="button" class="dir__btn dir__btn--primary" data-testid="director-start" @click="goOrchestration">查看运行编排 →</button>
          <button type="button" class="dir__btn" data-testid="director-back-daily" @click="goDaily">返回日常工作台</button>
        </div>
      </div>

      <template v-else>
        <header class="dir__head" data-testid="director-head">
          <div>
            <p class="dir__sub">当前运行 <b>{{ state.run }}</b> · 模式 {{ state.posture }} · 启动/续跑由 harness 执行</p>
          </div>
          <div class="dir__actions">
            <button type="button" class="dir__btn dir__btn--primary" data-testid="director-orchestrate" @click="goOrchestration">查看运行编排 →</button>
            <button type="button" class="dir__btn" data-testid="director-back-daily-2" @click="goDaily">返回日常工作台</button>
          </div>
        </header>

        <div class="dir__kpis">
          <div class="dir__kpi" data-testid="director-kpi-steps"><span class="dir__kpi-n">{{ stepsDone }}<em>/26</em></span><span class="dir__kpi-l">步骤完成</span></div>
          <div class="dir__kpi" data-testid="director-kpi-gates"><span class="dir__kpi-n">{{ gatesPassed }}<em>/6</em></span><span class="dir__kpi-l">质量门通过</span></div>
          <div class="dir__kpi" :class="{ 'dir__kpi--warn': interventions.length }" data-testid="director-kpi-wait"><span class="dir__kpi-n">{{ interventions.length }}</span><span class="dir__kpi-l">待人介入</span></div>
          <div class="dir__kpi" :class="{ 'dir__kpi--warn': openLedger > 0 }" data-testid="director-kpi-ledger"><span class="dir__kpi-n">{{ openLedger }}</span><span class="dir__kpi-l">未清遗留项</span></div>
        </div>

        <section class="dir__card" data-testid="director-acts">
          <h4 class="dir__h">阶段推进</h4>
          <ol class="dir__acts">
            <li v-for="a in acts" :key="a.act" class="dir__act" :class="`dir__act--${a.status}`" :data-testid="`director-act-${a.act}`">
              <span class="dir__act-no">{{ a.act }}</span><span class="dir__act-name">{{ a.displayName }}</span><span class="dir__act-stat">{{ a.done }}/{{ a.total }}</span>
            </li>
          </ol>
        </section>

        <div class="dir__cols">
          <section class="dir__card" data-testid="director-cast">
            <h4 class="dir__h">模拟员工名册 <span class="dir__h-n">{{ cast.length }}</span></h4>
            <p v-if="!cast.length" class="dir__hint">本轮还没有任务执行人记录；派活后会在这里出现。</p>
            <template v-else>
              <p class="dir__hint">按当前看板任务执行人聚合（人类账号与 agent 同列）。</p>
              <ul class="dir__cast">
                <li v-for="p in cast" :key="p.name" class="dir__cast-row"><span class="dir__cast-dot" aria-hidden="true" /><span class="dir__cast-name">{{ p.name }}</span><span class="dir__cast-n">{{ p.count }} 项</span></li>
              </ul>
            </template>
          </section>

          <section class="dir__card" data-testid="director-interventions">
            <h4 class="dir__h">待人介入 <span class="dir__h-n">{{ interventions.length }}</span></h4>
            <p v-if="!interventions.length" class="dir__hint">没有等你拍板的事——推演按当前节奏继续。</p>
            <ul v-else class="dir__waits">
              <li v-for="w in interventions" :key="w.id" class="dir__wait"><span class="dir__wait-title">{{ w.title }}</span><span class="dir__wait-tag">{{ w.kind === 'task-review' || w.kind === 'gate-review' ? '待审' : '待介入' }}</span></li>
            </ul>
            <button v-if="interventions.length" type="button" class="dir__link" data-testid="director-open-inbox" @click="goInbox">去审批收件箱处理 →</button>
          </section>
        </div>

        <div class="dir__tech">
          <button type="button" class="dir__link" data-testid="director-toggle-tech" @click="showTechnical = !showTechnical">
            {{ showTechnical ? '收起技术详情' : '展开技术详情（26 步执行表 / 交付物 / 质量门明细）' }}
          </button>
          <OverviewPanel v-if="showTechnical" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dir { display: flex; flex-direction: column; gap: 16px; }
.dir__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dir__title { margin: 0; font-size: 16px; }
.dir__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.dir__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dir__btn {
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  border-radius: 6px; padding: 5px 14px; font-family: inherit; font-size: 12px; cursor: pointer;
}
.dir__btn--primary { border-color: var(--accent-primary); color: var(--accent-primary); }
.dir__btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
.dir__btn:disabled { opacity: .55; cursor: default; }
.dir__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.dir__kpi { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.dir__kpi--warn { border-color: var(--ia-stale, #b8860b); }
.dir__kpi-n { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dir__kpi-n em { font-size: 12px; font-style: normal; color: var(--text-muted); font-weight: 500; }
.dir__kpi-l { font-size: 11px; color: var(--text-muted); }
.dir__card { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; }
.dir__h { margin: 0 0 8px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.dir__h-n { font-size: 11px; color: var(--text-muted); font-weight: 500; }
.dir__acts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
.dir__act { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-muted); }
.dir__act--done { border-left: 3px solid var(--ia-fresh, #2e9e5b); color: var(--text-primary); }
.dir__act--current { border-left: 3px solid var(--ia-stale, #b8860b); color: var(--text-primary); background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent); }
.dir__act-no { font-weight: 700; }
.dir__act-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__act-stat { font-variant-numeric: tabular-nums; }
.dir__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
.dir__cast, .dir__waits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dir__cast-row, .dir__wait { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dir__cast-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ia-fresh, #2e9e5b); }
.dir__cast-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__cast-n { font-size: 11px; color: var(--text-muted); }
.dir__wait-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir__wait-tag { font-size: 10px; color: var(--ia-stale, #b8860b); border: 1px solid var(--ia-stale, #b8860b); border-radius: 4px; padding: 0 4px; }
.dir__hint { margin: 0; font-size: 12px; color: var(--text-muted); }
.dir__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.dir__ok { color: var(--ia-fresh, #2e9e5b); font-size: 12px; margin: 0; }
.dir__empty { border: 1px dashed var(--border-color); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.dir__empty-title { margin: 0; font-size: 14px; font-weight: 600; }
.dir__empty-sub { margin: 0; font-size: 12px; color: var(--text-muted); }
.dir__tech { display: flex; flex-direction: column; gap: 8px; }
.dir__link { align-self: flex-start; border: none; background: transparent; color: var(--accent-info, var(--accent-primary)); font-size: 11.5px; cursor: pointer; padding: 0; }
.dir__link:hover { text-decoration: underline; text-underline-offset: 3px; }
.dir__graph { display: flex; flex-direction: column; gap: 10px; }
.dir__form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.dir__field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text-muted); }
.dir__field--wide { grid-column: 1 / -1; }
.dir__field input, .dir__field textarea {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px;
  font-family: inherit; font-size: 12px; background: transparent; color: var(--text-primary); resize: vertical;
}
.dir__plan { border: 1px dashed var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.dir__plan-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.dir__pill { border: 1px solid var(--border-color); border-radius: 999px; padding: 0 8px; font-size: 11px; }
.dir__pill--person { color: var(--accent-primary); border-color: var(--accent-primary); }
.dir__run { border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.dir__run-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dir__status { font-size: 11px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--border-color); color: var(--text-muted); }
.dir__status--running { color: var(--accent-info); border-color: var(--accent-info); }
.dir__status--awaiting-input { color: var(--ia-stale, #b8860b); border-color: var(--ia-stale, #b8860b); }
.dir__status--completed { color: var(--ia-fresh, #2e9e5b); border-color: var(--ia-fresh, #2e9e5b); }
.dir__status--failed { color: var(--ia-fail); border-color: var(--ia-fail); }
.dir__gates { display: flex; flex-direction: column; gap: 6px; }
.dir__gate { border: 1px solid var(--ia-stale, #b8860b); border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent); }
.dir__gate-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dir__gate-prompt { font-size: 12px; }
.dir__gate-node { font-size: 10.5px; color: var(--text-muted); font-family: var(--font-mono); }
.dir__gate-actions { display: flex; gap: 6px; }
.dir__events { font-size: 11.5px; color: var(--text-muted); }
.dir__events summary { cursor: pointer; }
.dir__events ul { margin: 6px 0 0; padding-left: 16px; }
.dir__harness { display: flex; flex-direction: column; gap: 12px; border-top: 1px dashed var(--border-color); padding-top: 14px; }
</style>
