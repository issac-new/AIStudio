<!-- overlay/custom/client/loop/runcenter/views/RunDetailView.vue -->
<!-- RunDetailView — 运行详情页（task-6，路由 /hermes/loop/runs/:runId）。
     左图右流：执行图画布（vue-flow 只读）+ 时间轴回放（useRunReplay 游标 =
     重放至第 N 事件，图与事件流共用前缀投影）；右栏下方挂节点检查器 attach 档
     （task-7 NodeInspector，选中节点驱动，inspectNode 纯函数投影）。
     数据：GET /api/graph/runs/:id（instance.graphDefId → 图规格）+
     GET /api/graph/runs/:id/replay（P2 规模内一次拉全量）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import RunStageBadge from '@/custom/loop/runcenter/components/RunStageBadge.vue'
import RunGraphCanvas from '@/custom/loop/runcenter/components/RunGraphCanvas.vue'
import RunTimeline from '@/custom/loop/runcenter/components/RunTimeline.vue'
import NodeInspector from '@/custom/loop/runcenter/components/NodeInspector.vue'
import { useRunReplay } from '@/custom/loop/runcenter/composables/useRunReplay'
import { buildRunGraph, projectEvents } from '@/custom/loop/runcenter/adapters/run-graph'
import type { RunGraphData, RunGraphTopologyLike, ReplayEventLike, TimelineMode } from '@/custom/loop/runcenter/adapters/run-graph'
import { runRest } from '@/custom/loop/runcenter/api'
import type { RunStatus } from '@/custom/loop/runcenter/types'
// M6 画布并入（补遗⑤ R-C1 裁决）：/app/l 循环画布退役，RunCanvas（链路条/
// 阶段流/事件编年/历史回放）作为详情区块挂入本页；loop 上下文按 graphId
// 约定（loop-<loopId>）自 run 详情解析装载。
import RunCanvas from '@/custom/ia2/components/flow/RunCanvas.vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { linkedTasksOfLoop } from '@/custom/ia2/adapters/flow'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const runId = computed(() => String(route.params.runId ?? ''))

// ── M6 循环画布区块（补遗⑤）：graphId = loop-<loopId> 约定解析 loop 上下文 ──

const loopStore = useLoopStore()
const runsStore = useRunCenterStore()
const workspaceStore = useWorkspaceStore()

/** 本 run 的 graphId（load() 捕获；instance.graphDefId 同值域兜底） */
const runGraphId = ref<string | null>(null)
const loopId = computed(() =>
  runGraphId.value && runGraphId.value.startsWith('loop-') ? runGraphId.value.slice(5) : null)

/** 装载 loop 画布上下文（契约驱动挂接任务/参与方；重复进入同 loop 幂等跳过） */
watch(loopId, id => {
  if (id && loopStore.currentLoop?.id !== id) void loopStore.fetchLoop(id)
}, { immediate: true })

/** 首事件时刻（ms；ISO∪ms 归一——与 WorkbenchView 原 loopLatestRunStartMs 同口径） */
const firstEventMs = computed(() => {
  let min = Number.POSITIVE_INFINITY
  for (const e of events.value) {
    const ms = typeof e.ts === 'number' ? e.ts : Date.parse(String(e.ts))
    if (!Number.isNaN(ms) && ms < min) min = ms
  }
  return Number.isFinite(min) ? min : null
})

/** 挂接任务（契约 → 看板任务解析，WorkbenchView 同源实现） */
const loopLinkedTasks = computed<CockpitTask[]>(() =>
  loopId.value && loopStore.currentLoop?.id === loopId.value
    ? linkedTasksOfLoop(loopStore.currentContracts ?? [], workspaceStore.tasks)
    : [])

/** 参与方（契约挂接任务的 assignee 去重；WorkbenchView loopParticipants 同口径） */
const loopParticipants = computed(() => {
  const byId = new Map((workspaceStore.tasks ?? []).map(x => [x.id, x]))
  const seen = new Set<string>()
  const out: Array<{ kind: 'agent'; name: string; role: string }> = []
  for (const c of loopStore.currentContracts ?? []) {
    const task = c.persistedTaskId ? byId.get(c.persistedTaskId) : null
    if (task?.assignee && !seen.has(task.assignee)) {
      seen.add(task.assignee)
      out.push({ kind: 'agent', name: task.assignee, role: t('ia2.rc.roleExec') })
    }
  }
  return out
})

/** 画布事件 → 详情页动线（看板/IDE 深链；open-timeline 即本页主时间轴，无需另行跳转） */
function onCanvasOpenTask(taskId: string): void {
  void router.push({ name: 'ia2.board', query: { task: taskId } })
}
function onCanvasOpenIde(taskId: string): void {
  void router.push({ name: 'ide.shell', query: { task: taskId } })
}
function onCanvasGotoBoard(): void {
  void router.push({ name: 'ia2.board' })
}

// ── 数据 ──
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref<RunStatus>('unknown')
const spec = ref<RunGraphTopologyLike | null>(null)
const specMissing = ref(false)
const events = ref<ReplayEventLike[]>([])

// ── 回放（游标持有者；图与时间轴共用 visibleEvents 前缀）──
const {
  cursorIndex, total, playing, speed, visibleEvents, seek, toggle, setSpeed,
} = useRunReplay(events)
const mode = ref<TimelineMode>('normal')
const selectedNodeId = ref<string | null>(null)

/** 空图（spec 缺失/未载入时的画布占位） */
const EMPTY_GRAPH: RunGraphData = { nodes: [], edges: [] }

const graph = computed<RunGraphData>(() =>
  spec.value ? buildRunGraph(spec.value, visibleEvents.value) : EMPTY_GRAPH,
)
const rows = computed(() => projectEvents(visibleEvents.value, mode.value))

/** 检查器（task-7）：选中节点的图投影产物（null = 未选中 → 检查器空态） */
const selectedNode = computed(() =>
  graph.value.nodes.find(n => n.id === selectedNodeId.value) ?? null,
)

async function load(): Promise<void> {
  const id = runId.value
  if (!id) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  specMissing.value = false
  selectedNodeId.value = null
  try {
    // 详情（状态 + graphDefId）与回放事件并行拉取
    const [detail, replayEvents] = await Promise.all([
      runRest.getRun(id),
      runRest.replay(id),
    ])
    // 陈旧响应守卫（2026-09-10 风险审查 #3）：路由复用本组件实例，快速 A→B 切换时
    // 两个 load 并发，慢的 A 响应若不比对当前 runId 会覆盖 B 的数据并使游标错位
    if (runId.value !== id) return
    events.value = replayEvents
    // 初始游标落全量：打开详情先看当前状态，回放是显式动作
    seek(replayEvents.length)
    status.value = ((detail.instance as { status?: RunStatus }).status) ?? 'unknown'
    const specId = ((detail.instance as { graphDefId?: string }).graphDefId) || detail.graphId
    // M6 循环画布区块：graphId 留存（loop-<loopId> 约定解析，非 loop 图为 null）
    runGraphId.value = detail.graphId ?? specId ?? null
    const specDetail = await runRest.getSpec(specId)
    if (runId.value !== id) return
    spec.value = specDetail
    if (!spec.value) specMissing.value = true
  } catch (e) {
    if (runId.value === id) error.value = e instanceof Error ? e.message : String(e)
  } finally {
    // 仅本次 load 仍是当前请求时才收 loading——避免陈旧请求提前关闭新请求的加载态
    if (runId.value === id) loading.value = false
  }
}

onMounted(load)
watch(runId, () => { void load() })

// ── 导出 JSON（P3 台账 #30）：取打包 JSON 后用 Blob 触发浏览器下载 ──
// （REST 走授权头，<a href> 直链不带凭证；文件名与服务端 Content-Disposition 同口径）
const exporting = ref(false)
async function exportRun(): Promise<void> {
  const id = runId.value
  if (!id || exporting.value) return
  exporting.value = true
  try {
    const bundle = await runRest.exportRun(id)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `run-${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    exporting.value = false
  }
}

function goBack(): void {
  // 2026-09-18 统一导航：运行中心落运行场景枢纽（ia2.ops runs tab），
  // hermes.loopRuns 旧落点已直删（Task 5 守卫退役），页内返回直进枢纽
  router.push({ name: 'ia2.runs', query: { tab: 'runs' } })
}

function onSelectNode(id: string): void {
  selectedNodeId.value = id
}
</script>

<template>
  <div class="rd-view" data-run-detail-view>
    <!-- 头部：返回 + run 标识 + 状态 -->
    <div class="rd-view__header">
      <button class="rd-view__back" :title="t('runcenter.detail.back')" @click="goBack">
        <CockpitIcon name="back" :size="13" />
        <span>{{ t('runcenter.detail.back') }}</span>
      </button>
      <h2 class="rd-view__title">{{ runId }}</h2>
      <RunStageBadge :status="status" />
      <span v-if="!loading && total > 0" class="rd-view__count">
        {{ t('runcenter.replay.count', { n: total }) }}
      </span>
      <button
        class="rd-view__export"
        data-export-run
        :disabled="loading || exporting"
        @click="exportRun"
      >
        {{ exporting ? t('runcenter.detail.exporting') : t('runcenter.detail.export') }}
      </button>
    </div>

    <div v-if="error" class="rd-view__error">
      <span>{{ t('runcenter.detail.loadFailed') }}</span>
      <code>{{ error }}</code>
    </div>

    <!-- 左图右流（窄屏纵叠） -->
    <div class="rd-view__main">
      <div class="rd-view__graph">
        <div v-if="specMissing" class="rd-view__nospec">{{ t('runcenter.detail.noSpec') }}</div>
        <RunGraphCanvas
          v-else
          :graph="graph"
          :entry-node="spec?.entryNode"
          :selected-node-id="selectedNodeId"
          @select-node="onSelectNode"
        />
      </div>

      <div class="rd-view__side">
        <div class="rd-view__timeline">
          <RunTimeline
            :rows="rows"
            :cursor-index="cursorIndex"
            :total="total"
            :playing="playing"
            :speed="speed"
            :mode="mode"
            :loading="loading"
            @seek="seek"
            @toggle-play="toggle"
            @set-speed="setSpeed"
            @set-mode="(m: TimelineMode) => (mode = m)"
          />
        </div>
        <!-- 节点检查器（attach 档，task-7）：选中图节点后显示 -->
        <NodeInspector
          class="rd-view__inspector"
          :node="selectedNode"
          :events="visibleEvents"
          :run-id="runId"
        />
      </div>
    </div>

    <!-- M6 循环画布区块（补遗⑤ R-C1：/app/l 退役，RunCanvas 能力并入详情页；
         非 loop 图（graphId 无 loop- 前缀）不渲染） -->
    <section
      v-if="loopId && loopStore.currentLoop?.id === loopId"
      class="rd-view__canvas"
      data-testid="rd-loop-canvas"
    >
      <h3 class="rd-view__canvas-title">{{ t('runcenter.detail.loopCanvas') }}</h3>
      <RunCanvas
        :loop="loopStore.currentLoop"
        :loop-row="{
          kind: 'loop', id: loopStore.currentLoop.id, name: loopStore.currentLoop.name,
          stageIndex: 0, stageTotal: 5, stageTone: 'todo', progressPct: 0,
          statusKey: 'idle', awaitingYou: false, blocked: false, updatedAt: null,
        }"
        :linked-tasks="loopLinkedTasks"
        :latest-run-id="runId"
        :latest-run-status="status"
        :latest-run-start-ms="firstEventMs"
        :live-connected="runsStore.connection === 'connected'"
        :participants="loopParticipants"
        @open-task="onCanvasOpenTask"
        @open-ide="onCanvasOpenIde"
        @reassign="onCanvasOpenTask"
        @handle-task="onCanvasOpenTask"
        @goto-board="onCanvasGotoBoard"
      />
    </section>
  </div>
</template>

<style scoped>
.rd-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 12px;
  overflow: auto;
}

.rd-view__header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.rd-view__back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rd-view__title {
  margin: 0;
  font-size: 15px;
  font-family: var(--font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rd-view__count {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}

.rd-view__export {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rd-view__export:disabled {
  opacity: 0.6;
  cursor: default;
}

.rd-view__error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid var(--color-danger, #e11d48);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-danger, #e11d48);
  font-size: 12px;
}
.rd-view__error code {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  word-break: break-all;
}

.rd-view__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 440px;
  gap: 12px;
  flex: 1;
  min-height: 480px;
}
/* 窄屏纵叠 */
@media (max-width: 960px) {
  .rd-view__main { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .rd-view__graph { min-height: 320px; }
}

.rd-view__graph { position: relative; min-height: 0; }
.rd-view__nospec {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard, 6px);
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 12px;
}

.rd-view__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.rd-view__timeline { min-height: 0; flex: 1; }
.rd-view__inspector { max-height: 300px; flex-shrink: 0; }

/* M6 循环画布区块：固定高度带内滚（RunCanvas 自带视图条与左右分区） */
.rd-view__canvas {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 420px;
  max-height: 560px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  overflow: hidden;
}
.rd-view__canvas-title {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.rd-view__canvas > :deep(.rc-view),
.rd-view__canvas > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
