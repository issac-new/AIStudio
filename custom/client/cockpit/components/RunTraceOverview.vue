<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { useKanbanTaskGraph, type TimeWindow } from '../composables/useKanbanTaskGraph'
import type { TraceNode } from '../adapters/run-trace-adapter'
import RunTraceTopology from './RunTraceTopology.vue'
import RunTraceNodeDetail from './RunTraceNodeDetail.vue'

const emit = defineEmits<{ (e: 'select-session', sid: string): void; (e: 'close'): void }>()

const graph = useKanbanTaskGraph()
const searchQuery = ref('')
const selectedTaskId = ref<string | null>(null)
const detailNode = ref<TraceNode | null>(null)

// 状态过滤：默认隐藏已完成/已归档任务；用户主动勾选后才纳入
const includeDone = ref(false)
const includeArchived = ref(false)

// 时间窗：默认以天为维度，仅加载今天（今天 00:00:00 ~ 当前时间）。
const DAY_MS = 86400000
function startOfDay(ts: number): number {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime()
}
const now = Date.now()
const windowStart = ref(startOfDay(now))
const windowEnd = ref(now)

// datetime-local 输入绑定
const startInput = ref(toLocalInput(windowStart.value))
const endInput = ref(toLocalInput(windowEnd.value))
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): number {
  const t = new Date(v).getTime()
  return isNaN(t) ? 0 : t
}

/** 统一重载入口 */
function reload(win: TimeWindow | null = null) {
  return graph.load({ win, includeDone: includeDone.value, includeArchived: includeArchived.value })
}

// ── 检索：命中任务所在 cluster 集合 ──
const hitClusters = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return null
  const set = new Set<string>()
  for (const t of graph.tasks.value) {
    const hay = [t.taskId, t.title, t.board, t.status].join(' ').toLowerCase()
    if (hay.includes(q)) set.add(t.taskId)
  }
  return set
})

// ── 下层详细视图：选中任务全树 ──
const focusResult = ref<{ nodes: TraceNode[]; edges: any[]; tasks: any[]; clusterMeta: Map<string, any> } | null>(null)
const focusLoading = ref(false)

// 上层数据源：选中任务时用 focusResult（全树），否则用全量 graph
const topNodes = computed<TraceNode[]>(() => {
  if (selectedTaskId.value && focusResult.value) return focusResult.value.nodes
  return graph.nodes.value
})
const topEdges = computed(() => {
  if (selectedTaskId.value && focusResult.value) return focusResult.value.edges
  return graph.edges.value
})

async function selectTask(taskId: string) {
  selectedTaskId.value = taskId
  focusLoading.value = true
  focusResult.value = null
  try {
    const r = await graph.focusTaskTree(taskId)
    focusResult.value = r as any
  } finally {
    focusLoading.value = false
  }
}
function clearFocus() {
  selectedTaskId.value = null
  focusResult.value = null
}

// 时间窗
function onWindowApply(p: { start: number; end: number }) {
  windowStart.value = p.start
  windowEnd.value = p.end
  startInput.value = toLocalInput(p.start)
  endInput.value = toLocalInput(p.end)
  reload({ start: p.start, end: p.end })
  clearFocus()
}
/** 按天步进：
 *  向左（‹）：左边起始往前减一天，右边结束不变（窗口扩大）
 *  向右（›）：右边结束往后加一天，左边起始不变（窗口扩大） */
function stepDay(dir: -1 | 1) {
  if (dir < 0) {
    onWindowApply({ start: windowStart.value - DAY_MS, end: windowEnd.value })
  } else {
    onWindowApply({ start: windowStart.value, end: windowEnd.value + DAY_MS })
  }
}
/** 日期+时间输入应用 */
function applyDateInput() {
  const ns = fromLocalInput(startInput.value)
  const ne = fromLocalInput(endInput.value)
  if (!ns || !ne || ns >= ne) return
  onWindowApply({ start: ns, end: ne })
}
/** 切换"已完成/已归档"标签 */
function toggleStatusFilter(which: 'done' | 'archived') {
  if (which === 'done') includeDone.value = !includeDone.value
  else includeArchived.value = !includeArchived.value
  reload({ start: windowStart.value, end: windowEnd.value })
  clearFocus()
}

onMounted(async () => {
  await reload({ start: windowStart.value, end: windowEnd.value })
})

function onShowDetail(n: TraceNode) { detailNode.value = n }
function onTopFocusTask(taskId: string) { selectTask(taskId) }
function onTopSelectSession(sid: string) { emit('select-session', sid) }
</script>

<template>
  <div class="run-trace-overview" data-run-trace-overview role="dialog" aria-modal="true" aria-label="Run Observatory 全局聚合">
    <header class="run-trace-overview__top">
      <span class="run-trace-overview__dot"></span>
      <div class="run-trace-overview__title">
        <b>Run Observatory</b>
        <small>kanban 任务树拓扑 · {{ graph.tasks.value.length }} 任务{{ selectedTaskId ? ' · 聚焦 ' + selectedTaskId : '' }}</small>
      </div>
      <div class="run-trace-overview__search">
        <input type="text" v-model="searchQuery" placeholder="检索任务 ID / 标题 / board / 状态…" />
        <span v-if="hitClusters" class="run-trace-overview__search-hit">命中 {{ hitClusters.size }} 任务</span>
      </div>
      <!-- 日期时间筛选（位于“已完成”按钮左侧）：按天步进 + datetime 输入 -->
      <div class="run-trace-overview__date-bar">
        <button type="button" class="run-trace-overview__step-btn" @click="stepDay(-1)" title="时间范围在当前基础上往前增加一天">‹</button>
        <input type="datetime-local" class="run-trace-overview__date-input" v-model="startInput" @change="applyDateInput" title="起始时间" />
        <span class="run-trace-overview__date-sep">→</span>
        <input type="datetime-local" class="run-trace-overview__date-input" v-model="endInput" @change="applyDateInput" title="结束时间" />
        <button type="button" class="run-trace-overview__step-btn" @click="stepDay(1)" title="时间范围在当前基础上往后增加一天">›</button>
        <button type="button" class="run-trace-overview__apply-btn" @click="applyDateInput" title="应用时间筛选">应用</button>
      </div>
      <!-- 状态过滤标签 -->
      <div class="run-trace-overview__filters">
        <button type="button" class="run-trace-overview__filter" :class="{ 'is-on': includeDone }" @click="toggleStatusFilter('done')" title="勾选后重新加载已完成任务">已完成</button>
        <button type="button" class="run-trace-overview__filter" :class="{ 'is-on': includeArchived }" @click="toggleStatusFilter('archived')" title="勾选后重新加载已归档任务">已归档</button>
      </div>
      <div v-if="graph.loading.value" class="run-trace-overview__progress">
        <div class="run-trace-overview__progress-bar" :style="{ width: graph.progress.value + '%' }"></div>
        <span>{{ graph.progress.value }}%</span>
      </div>
      <button v-if="selectedTaskId" type="button" class="run-trace-overview__back-all" @click="clearFocus" title="返回全部任务（不修改筛选条件）">← 返回全部</button>
      <button type="button" class="run-trace-overview__close" @click="emit('close')" title="关闭">×</button>
    </header>

    <!-- 上层拓扑图（选中任务时仅显示该任务全树） -->
    <div class="run-trace-overview__topo">
      <div v-if="graph.loading.value && graph.nodes.value.length === 0" class="run-trace-overview__empty">
        加载聚合数据中… {{ graph.progress.value }}%
      </div>
      <div v-else-if="!graph.loading.value && topNodes.length === 0" class="run-trace-overview__empty">
        {{ graph.error.value || '暂无任务/会话记录' }}
      </div>
      <RunTraceTopology
        v-else
        :nodes="topNodes"
        :edges="topEdges"
        :hit-clusters="hitClusters"
        :selected-task-id="selectedTaskId"
        @focus-task="onTopFocusTask"
        @select-session="onTopSelectSession"
        @show-detail="onShowDetail"
      />
    </div>

    <!-- 节点详情浮层 -->
    <RunTraceNodeDetail :node="detailNode" @close="detailNode = null" />

    <footer class="run-trace-overview__legend">
      <span class="run-trace-overview__legend-item"><span class="run-trace-overview__legend-dot is-ingress"></span>入口</span>
      <span class="run-trace-overview__legend-item"><span class="run-trace-overview__legend-dot is-workflow"></span>Run</span>
      <span class="run-trace-overview__legend-item"><span class="run-trace-overview__legend-dot is-agent"></span>Agent</span>
      <span class="run-trace-overview__legend-item"><span class="run-trace-overview__legend-dot is-skill"></span>Skill</span>
      <span class="run-trace-overview__legend-item"><span class="run-trace-overview__legend-dot is-tool"></span>Tool</span>
      <span class="run-trace-overview__legend-hint">拓扑：左→右 时序 · 上→下 执行层级 · 实线=call · 虚线=delegate · 动画=spawn · 点任务聚焦该任务 · 点ⓘ看详情 · ±折叠展开</span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.run-trace-overview { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--bg-primary); }
.run-trace-overview__top { display: flex; align-items: center; gap: 12px; padding: 8px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0; flex-wrap: wrap; }
.run-trace-overview__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); flex-shrink: 0; }
.run-trace-overview__title b { display: block; font-size: 13px; }
.run-trace-overview__title small { display: block; font-size: 10px; color: var(--text-muted); }
.run-trace-overview__search { flex: 1; min-width: 200px; max-width: 360px; display: flex; align-items: center; gap: 8px; }
.run-trace-overview__search input { flex: 1; height: 28px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; outline: none;
  &:focus { border-color: var(--accent-primary); }
  &::placeholder { color: var(--text-muted); }
}
.run-trace-overview__search-hit { font-size: 10px; color: var(--accent-primary); white-space: nowrap; }
.run-trace-overview__filters { display: flex; gap: 4px; flex-shrink: 0; }
.run-trace-overview__filter { height: 26px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 13px; background: var(--bg-card); color: var(--text-muted); cursor: pointer; font-size: 11px; font-family: inherit; transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { border-color: var(--text-muted); color: var(--text-secondary); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
.run-trace-overview__progress { display: flex; align-items: center; gap: 6px; width: 120px; }
.run-trace-overview__progress-bar { height: 4px; background: var(--accent-primary); border-radius: 2px; flex: 1; transition: width 0.2s; }
.run-trace-overview__progress span { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.run-trace-overview__close { width: 28px; height: 28px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; flex-shrink: 0;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}

/* 日期时间筛选（嵌入 header，位于“已完成”按钮左侧） */
.run-trace-overview__date-bar { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.run-trace-overview__step-btn { width: 26px; height: 26px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font-size: 16px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); border-color: var(--text-muted); }
}
.run-trace-overview__date-input { height: 26px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 11px; font-family: ui-monospace, monospace; outline: none; width: 150px; flex-shrink: 0;
  &:focus { border-color: var(--accent-primary); }
}
.run-trace-overview__date-sep { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.run-trace-overview__apply-btn { height: 26px; padding: 0 10px; border: 1px solid var(--accent-primary); border-radius: 4px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 600; flex-shrink: 0;
  &:hover { filter: brightness(1.08); }
}

/* 拓扑图区 */
.run-trace-overview__topo { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.run-trace-overview__empty { padding: 48px 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.run-trace-overview__back-all { height: 28px; padding: 0 12px; border: 1px solid var(--accent-primary); border-radius: 6px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-size: 12px; font-family: inherit; font-weight: 600; flex-shrink: 0;
  &:hover { filter: brightness(1.08); }
}

/* 图例 */
.run-trace-overview__legend { display: flex; align-items: center; gap: 14px; padding: 6px 18px; border-top: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0; flex-wrap: wrap; }
.run-trace-overview__legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-secondary); }
.run-trace-overview__legend-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.run-trace-overview__legend-dot.is-ingress { background: var(--text-muted); }
.run-trace-overview__legend-dot.is-workflow { background: var(--accent-primary); }
.run-trace-overview__legend-dot.is-agent { background: var(--success); }
.run-trace-overview__legend-dot.is-skill { background: var(--accent-info); }
.run-trace-overview__legend-dot.is-tool { background: var(--warning); }
.run-trace-overview__legend-hint { font-size: 9px; color: var(--text-muted); margin-left: auto; }
</style>
