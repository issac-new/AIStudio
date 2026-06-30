<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { useKanbanTaskGraph, type TimeWindow } from '../composables/useKanbanTaskGraph'
import { computeGridLayout, KIND_ROWS } from '../composables/computeGridLayout'
import type { TraceNode } from '../adapters/run-trace-adapter'
import TimeRangeSlider from './TimeRangeSlider.vue'

const emit = defineEmits<{ (e: 'select-session', sid: string): void; (e: 'close'): void }>()

const graph = useKanbanTaskGraph()
const searchQuery = ref('')
const selectedTaskId = ref<string | null>(null)

// 状态过滤：默认隐藏已完成/已归档任务；用户主动勾选后才纳入
const includeDone = ref(false)
const includeArchived = ref(false)

// 时间窗：默认以天为维度，仅加载今天（今天 00:00:00 ~ 当前时间）。
// minTime/maxTime 为可浏览范围（默认近 30 天 ~ 现在），供滑块拖动。
const DAY_MS = 86400000
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}
const now = Date.now()
const minTime = ref(startOfDay(now) - 30 * DAY_MS) // 可浏览下限：30 天前
const maxTime = ref(now)
const windowStart = ref(startOfDay(now))           // 默认今天 00:00:00
const windowEnd = ref(now)                          // 默认当前时间

// datetime-local 输入绑定（格式 yyyy-MM-ddTHH:mm）
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

/** 统一重载入口：携带当前状态过滤 + 可选时间窗 */
function reload(win: TimeWindow | null = null) {
  return graph.load({ win, includeDone: includeDone.value, includeArchived: includeArchived.value })
}

// ── 上层聚合图布局 ──
const layout = computed(() => computeGridLayout(graph.nodes.value, graph.clusterMeta.value))

const CLUSTER_COLORS = [
  '#6B83D6', '#4CAF8B', '#D69B5A', '#B56BD6', '#5AAAD6',
  '#D65A6B', '#8B9C4C', '#6B6BD6', '#D6B05A', '#5AD6A8',
]
const clusterColorMap = computed(() => {
  const map = new Map<string, string>()
  layout.value.columns.forEach((c, i) => map.set(c.cluster, CLUSTER_COLORS[i % CLUSTER_COLORS.length]))
  return map
})

interface PositionedNode { node: TraceNode; pos: { col: number; row: number; x: number; y: number }; color?: string }
const positionedNodes = computed<PositionedNode[]>(() => {
  const pos = layout.value.positions
  const res: PositionedNode[] = []
  for (const n of graph.nodes.value) {
    const p = pos.get(n.id)
    if (!p) continue
    res.push({ node: n, pos: p, color: n.cluster ? clusterColorMap.value.get(n.cluster) : undefined })
  }
  return res
})

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
const firstHitCluster = computed(() => {
  const hit = hitClusters.value
  if (!hit || hit.size === 0) return null
  for (const col of layout.value.columns) if (hit.has(col.cluster)) return col.cluster
  return null
})

const scrollContainer = ref<HTMLElement | null>(null)
// 内容宽度溢出时才允许拖拽平移（运行时按 DOM 实际尺寸判断）
const canDragScroll = computed(() => {
  const el = scrollContainer.value
  return !!el && el.scrollWidth > el.clientWidth
})
watch(firstHitCluster, async (cluster) => {
  if (!cluster || !scrollContainer.value) return
  await nextTick()
  const col = layout.value.columns.find(c => c.cluster === cluster)
  if (!col) return
  scrollContainer.value.scrollTo({ left: Math.max(0, col.x - 120), behavior: 'smooth' })
})

// ── 下层详细视图：选中任务全树 ──
const focusResult = ref<{ nodes: TraceNode[]; edges: any[]; tasks: any[]; clusterMeta: Map<string, any> } | null>(null)
const focusLoading = ref(false)
const focusLayout = computed(() => focusResult.value ? computeGridLayout(focusResult.value.nodes, focusResult.value.clusterMeta) : null)
const focusColorMap = computed(() => {
  const map = new Map<string, string>()
  focusLayout.value?.columns.forEach((c, i) => map.set(c.cluster, CLUSTER_COLORS[i % CLUSTER_COLORS.length]))
  return map
})
const focusPositionedNodes = computed<PositionedNode[]>(() => {
  if (!focusResult.value || !focusLayout.value) return []
  const pos = focusLayout.value.positions
  const res: PositionedNode[] = []
  for (const n of focusResult.value.nodes) {
    const p = pos.get(n.id)
    if (!p) continue
    res.push({ node: n, pos: p, color: n.cluster ? focusColorMap.value.get(n.cluster) : undefined })
  }
  return res
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

// 时间窗变化
function onWindowUpdate(p: { start: number; end: number }) {
  windowStart.value = p.start
  windowEnd.value = p.end
  startInput.value = toLocalInput(p.start)
  endInput.value = toLocalInput(p.end)
}
function onWindowApply(p: { start: number; end: number }) {
  windowStart.value = p.start
  windowEnd.value = p.end
  startInput.value = toLocalInput(p.start)
  endInput.value = toLocalInput(p.end)
  reload({ start: p.start, end: p.end })
  clearFocus()
}

/** 按天步进：保持窗口宽度，整体左/右平移 1 天，自动夹到 [minTime, maxTime] */
function stepDay(dir: -1 | 1) {
  const span = windowEnd.value - windowStart.value
  let ns = windowStart.value + dir * DAY_MS
  let ne = ns + span
  // 夹到可浏览范围
  if (ns < minTime.value) { ns = minTime.value; ne = ns + span }
  if (ne > maxTime.value) { ne = maxTime.value; ns = ne - span }
  onWindowApply({ start: ns, end: ne })
}

/** 日期+时间输入应用：手动精确设定起止 */
function applyDateInput() {
  const ns = fromLocalInput(startInput.value)
  const ne = fromLocalInput(endInput.value)
  if (!ns || !ne || ns >= ne) return
  onWindowApply({ start: ns, end: ne })
}

/** 切换"已完成/已归档"标签：主动重新加载 */
function toggleStatusFilter(which: 'done' | 'archived') {
  if (which === 'done') includeDone.value = !includeDone.value
  else includeArchived.value = !includeArchived.value
  // 用当前时间窗重载
  reload({ start: windowStart.value, end: windowEnd.value })
  clearFocus()
}

onMounted(async () => {
  // 默认加载今天（今天 00:00:00 ~ 当前时间）
  await reload({ start: windowStart.value, end: windowEnd.value })
})

function onNodeClick(n: TraceNode) {
  // 任务节点（ingress/workflow）→ 页内聚焦该任务全树
  const sid = n.ref?.sessionId
  if (n.cluster) {
    selectTask(n.cluster)
    return
  }
  // 其它节点（会话级 tool/skill）→ 进入单会话详细视图
  if (sid) emit('select-session', sid)
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** 日期标签：同一天显示「M/D 周X」，跨天显示「M/D → M/D」 */
function fmtDateLabel(ms: number): string {
  const d = new Date(ms)
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const sameDay = startOfDay(windowStart.value) === startOfDay(windowEnd.value)
  if (sameDay) return `${d.getMonth() + 1}/${d.getDate()} 周${week}`
  const e = new Date(windowEnd.value)
  return `${d.getMonth() + 1}/${d.getDate()} → ${e.getMonth() + 1}/${e.getDate()}`
}

// ── scroll 区域拖拽平移：宽度显示不下时，鼠标按住左右拖动平移内容 ──
const dragState = ref<{ active: boolean; startX: number; startScroll: number } | null>(null)
function onScrollPointerDown(e: PointerEvent) {
  // 仅左键且内容确实溢出时启用拖拽
  const el = scrollContainer.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  // 点击节点/列头时不启动拖拽（避免误触）
  const target = e.target as HTMLElement
  if (target.closest('.trace-node-card, .run-trace-overview__col-head')) return
  dragState.value = { active: true, startX: e.clientX, startScroll: el.scrollLeft }
  el.setPointerCapture?.(e.pointerId)
}
function onScrollPointerMove(e: PointerEvent) {
  if (!dragState.value?.active) return
  const el = scrollContainer.value
  if (!el) return
  el.scrollLeft = dragState.value.startScroll - (e.clientX - dragState.value.startX)
}
function onScrollPointerUp() {
  if (dragState.value) dragState.value = null
}
</script>

<template>
  <div class="run-trace-overview" data-run-trace-overview role="dialog" aria-modal="true" aria-label="Run Observatory 全局聚合">
    <header class="run-trace-overview__top">
      <span class="run-trace-overview__dot"></span>
      <div class="run-trace-overview__title">
        <b>Run Observatory</b>
        <small>kanban 任务树全聚合 · {{ graph.tasks.value.length }} 任务 / {{ layout.columns.length }} 聚类</small>
      </div>
      <div class="run-trace-overview__search">
        <input type="text" v-model="searchQuery" placeholder="检索任务 ID / 标题 / board / 状态…" />
        <span v-if="hitClusters" class="run-trace-overview__search-hit">命中 {{ hitClusters.size }} 任务</span>
      </div>
      <!-- 状态过滤标签：默认隐藏已完成/已归档，勾选后主动重新加载 -->
      <div class="run-trace-overview__filters">
        <button type="button" class="run-trace-overview__filter" :class="{ 'is-on': includeDone }" @click="toggleStatusFilter('done')" title="勾选后重新加载已完成任务">已完成</button>
        <button type="button" class="run-trace-overview__filter" :class="{ 'is-on': includeArchived }" @click="toggleStatusFilter('archived')" title="勾选后重新加载已归档任务">已归档</button>
      </div>
      <div v-if="graph.loading.value" class="run-trace-overview__progress">
        <div class="run-trace-overview__progress-bar" :style="{ width: graph.progress.value + '%' }"></div>
        <span>{{ graph.progress.value }}%</span>
      </div>
      <button type="button" class="run-trace-overview__close" @click="emit('close')" title="关闭">×</button>
    </header>

    <!-- 时间筛选：按天步进 + 日期时间输入 + 可拖动滑块 -->
    <div class="run-trace-overview__timebar">
      <div class="run-trace-overview__date-step">
        <button type="button" class="run-trace-overview__step-btn" @click="stepDay(-1)" title="向左按天拖动（上一日）">‹</button>
        <span class="run-trace-overview__date-label">{{ fmtDateLabel(windowStart) }}</span>
        <button type="button" class="run-trace-overview__step-btn" @click="stepDay(1)" title="向右按天拖动（下一日）">›</button>
      </div>
      <div class="run-trace-overview__date-inputs">
        <input type="datetime-local" class="run-trace-overview__date-input" v-model="startInput" @change="applyDateInput" title="起始时间" />
        <span class="run-trace-overview__date-sep">→</span>
        <input type="datetime-local" class="run-trace-overview__date-input" v-model="endInput" @change="applyDateInput" title="结束时间" />
        <button type="button" class="run-trace-overview__apply-btn" @click="applyDateInput" title="应用时间筛选">应用</button>
      </div>
      <TimeRangeSlider
        :min-time="minTime"
        :max-time="maxTime"
        :window-start="windowStart"
        :window-end="windowEnd"
        @update:window="onWindowUpdate"
        @apply="onWindowApply"
      />
    </div>

    <!-- 上层聚合图（宽度溢出时可左右拖动平移） -->
    <div
      ref="scrollContainer"
      class="run-trace-overview__scroll"
      :class="{ 'is-draggable': canDragScroll }"
      @pointerdown="onScrollPointerDown"
      @pointermove="onScrollPointerMove"
      @pointerup="onScrollPointerUp"
      @pointercancel="onScrollPointerUp"
    >
      <div v-if="graph.loading.value && graph.nodes.value.length === 0" class="run-trace-overview__empty">
        加载聚合数据中… {{ graph.progress.value }}%
      </div>
      <div v-else-if="!graph.loading.value && graph.nodes.value.length === 0" class="run-trace-overview__empty">
        {{ graph.error.value || '暂无任务/会话记录' }}
      </div>

      <div v-else class="run-trace-overview__grid" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
        <!-- 左侧行标签 -->
        <div class="run-trace-overview__row-labels">
          <div class="run-trace-overview__corner"></div>
          <div v-for="r in KIND_ROWS" :key="r.kind" class="run-trace-overview__row-label">
            <span class="run-trace-overview__row-kind" :class="`is-${r.kind}`"></span>
            <span>{{ r.label }}</span>
          </div>
        </div>

        <!-- 列头（任务：board + taskId + title） -->
        <div
          v-for="col in layout.columns"
          :key="col.cluster"
          class="run-trace-overview__col-head"
          :class="{ 'is-hit': hitClusters?.has(col.cluster), 'is-first-hit': firstHitCluster === col.cluster, 'is-selected': selectedTaskId === col.cluster }"
          :style="{ left: col.x + 'px', width: '240px' }"
          :title="`[${col.board}] ${col.cluster} · ${col.title}`"
          @click="selectTask(col.cluster)"
        >
          <span class="run-trace-overview__col-dot" :style="{ background: clusterColorMap.get(col.cluster) }"></span>
          <span class="run-trace-overview__col-board">{{ col.board }}</span>
          <span class="run-trace-overview__col-title">{{ col.cluster }}</span>
          <span class="run-trace-overview__col-meta">{{ col.sessionCount }}会话 · {{ fmtTime(col.startedAt) }}</span>
        </div>

        <!-- 行/列分隔线 -->
        <div v-for="(r, i) in KIND_ROWS" :key="'rl-' + r.kind" class="run-trace-overview__row-line" :style="{ top: (56 + i * 110) + 'px' }"></div>
        <div v-for="col in layout.columns" :key="'cl-' + col.cluster" class="run-trace-overview__col-line" :class="{ 'is-hit': hitClusters?.has(col.cluster) }" :style="{ left: col.x + 'px' }"></div>

        <!-- 节点卡片 -->
        <div
          v-for="item in positionedNodes"
          :key="item.node.id"
          class="trace-node-card"
          :class="[`is-${item.node.kind}`, item.node.status === 'running' ? 'is-running' : '']"
          :style="{ left: item.pos.x + 'px', top: item.pos.y + 'px', '--cluster-color': item.color }"
          @click.stop="onNodeClick(item.node)"
        >
          <span class="trace-node-card__dot"></span>
          <span class="trace-node-card__text">
            <b>{{ item.node.label }}</b>
            <small v-if="item.node.detail">{{ item.node.detail }}</small>
            <small v-if="item.node.profile" class="trace-node-card__profile">{{ item.node.profile }}</small>
          </span>
        </div>
      </div>
    </div>

    <!-- 下层详细视图：选中任务全树 -->
    <section v-if="selectedTaskId" class="run-trace-detail" data-task-detail-view>
      <header class="run-trace-detail__head">
        <span class="run-trace-detail__title">
          <b>聚焦任务全树</b>
          <small>{{ selectedTaskId }} · {{ graph.tasks.value.find(t => t.taskId === selectedTaskId)?.title }}</small>
        </span>
        <button type="button" class="run-trace-detail__back" @click="clearFocus">返回全部</button>
      </header>
      <div v-if="focusLoading" class="run-trace-overview__empty">加载任务全树…</div>
      <div v-else-if="focusResult && focusResult.nodes.length === 0" class="run-trace-overview__empty">该任务树暂无会话/执行数据</div>
      <div v-else-if="focusLayout" class="run-trace-detail__scroll">
        <div class="run-trace-overview__grid" :style="{ width: focusLayout.width + 'px', height: focusLayout.height + 'px' }">
          <div class="run-trace-overview__row-labels">
            <div class="run-trace-overview__corner"></div>
            <div v-for="r in KIND_ROWS" :key="r.kind" class="run-trace-overview__row-label">
              <span class="run-trace-overview__row-kind" :class="`is-${r.kind}`"></span>
              <span>{{ r.label }}</span>
            </div>
          </div>
          <div
            v-for="col in focusLayout.columns"
            :key="'d-' + col.cluster"
            class="run-trace-overview__col-head is-selected"
            :style="{ left: col.x + 'px', width: '240px' }"
            :title="`[${col.board}] ${col.cluster} · ${col.title}`"
          >
            <span class="run-trace-overview__col-dot" :style="{ background: focusColorMap.get(col.cluster) }"></span>
            <span class="run-trace-overview__col-board">{{ col.board }}</span>
            <span class="run-trace-overview__col-title">{{ col.cluster }}</span>
            <span class="run-trace-overview__col-meta">{{ col.sessionCount }}会话 · {{ fmtTime(col.startedAt) }}</span>
          </div>
          <div v-for="(r, i) in KIND_ROWS" :key="'drl-' + r.kind" class="run-trace-overview__row-line" :style="{ top: (56 + i * 110) + 'px' }"></div>
          <div v-for="col in focusLayout.columns" :key="'dcl-' + col.cluster" class="run-trace-overview__col-line is-hit" :style="{ left: col.x + 'px' }"></div>
          <div
            v-for="item in focusPositionedNodes"
            :key="'dn-' + item.node.id"
            class="trace-node-card"
            :class="[`is-${item.node.kind}`, item.node.status === 'running' ? 'is-running' : '']"
            :style="{ left: item.pos.x + 'px', top: item.pos.y + 'px', '--cluster-color': item.color }"
            @click.stop="onNodeClick(item.node)"
          >
            <span class="trace-node-card__dot"></span>
            <span class="trace-node-card__text">
              <b>{{ item.node.label }}</b>
              <small v-if="item.node.detail">{{ item.node.detail }}</small>
              <small v-if="item.node.profile" class="trace-node-card__profile">{{ item.node.profile }}</small>
            </span>
          </div>
        </div>
      </div>
    </section>

    <footer class="run-trace-overview__legend">
      <span class="run-trace-overview__legend-item"><span class="trace-node-card__dot is-ingress"></span>入口</span>
      <span class="run-trace-overview__legend-item"><span class="trace-node-card__dot is-workflow"></span>Run</span>
      <span class="run-trace-overview__legend-item"><span class="trace-node-card__dot is-agent"></span>Agent</span>
      <span class="run-trace-overview__legend-item"><span class="trace-node-card__dot is-skill"></span>Skill</span>
      <span class="run-trace-overview__legend-item"><span class="trace-node-card__dot is-tool"></span>Tool</span>
      <span class="run-trace-overview__legend-hint">列 = 任务（board+taskId，按时间从左到右） · 行 = 下钻维度（从上到下） · 点击任务列聚焦全树</span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.run-trace-overview { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--bg-primary); }
.run-trace-overview__top { display: flex; align-items: center; gap: 12px; padding: 8px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0; }
.run-trace-overview__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); flex-shrink: 0; }
.run-trace-overview__title b { display: block; font-size: 13px; }
.run-trace-overview__title small { display: block; font-size: 10px; color: var(--text-muted); }
.run-trace-overview__search { flex: 1; max-width: 420px; display: flex; align-items: center; gap: 8px; }
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

.run-trace-overview__scroll { flex: 1; min-height: 0; overflow: auto; position: relative; background: var(--bg-primary); }
.run-trace-overview__scroll.is-draggable { cursor: grab; }
.run-trace-overview__scroll.is-draggable:active { cursor: grabbing; }

/* 时间筛选条 */
.run-trace-overview__timebar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; flex-wrap: wrap; }
.run-trace-overview__date-step { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.run-trace-overview__step-btn { width: 26px; height: 26px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font-size: 16px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); border-color: var(--text-muted); }
}
.run-trace-overview__date-label { font-size: 12px; font-weight: 600; color: var(--text-primary); min-width: 96px; text-align: center; font-variant-numeric: tabular-nums; }
.run-trace-overview__date-inputs { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.run-trace-overview__date-input { height: 26px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 11px; font-family: ui-monospace, monospace; outline: none;
  &:focus { border-color: var(--accent-primary); }
}
.run-trace-overview__date-sep { font-size: 11px; color: var(--text-muted); }
.run-trace-overview__apply-btn { height: 26px; padding: 0 10px; border: 1px solid var(--accent-primary); border-radius: 4px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 600;
  &:hover { filter: brightness(1.08); }
}
.run-trace-overview__timebar :deep(.time-range-slider) { flex: 1; min-width: 180px; padding: 0; background: transparent; border-bottom: none; }
.run-trace-overview__empty { padding: 48px 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.run-trace-overview__grid { position: relative; min-width: 100%; }

.run-trace-overview__row-labels { position: sticky; left: 0; top: 0; z-index: 20; float: left; background: var(--bg-primary); }
.run-trace-overview__corner { height: 56px; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.run-trace-overview__row-label { height: 110px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-right: 1px solid var(--border-color); border-bottom: 1px dashed var(--border-color); font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.run-trace-overview__row-kind { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.run-trace-overview__row-kind.is-ingress { background: var(--text-muted); }
.run-trace-overview__row-kind.is-workflow { background: var(--accent-primary); }
.run-trace-overview__row-kind.is-agent { background: var(--success); }
.run-trace-overview__row-kind.is-skill { background: var(--accent-info); }
.run-trace-overview__row-kind.is-tool { background: var(--warning); }

.run-trace-overview__col-head { position: absolute; top: 0; height: 56px; padding: 4px 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); background: var(--bg-card); z-index: 15; overflow: hidden; cursor: pointer;
  &:hover { background: var(--bg-secondary); }
  &.is-hit { background: rgba(var(--accent-primary-rgb, 64,120,192), 0.08); }
  &.is-first-hit { box-shadow: 0 0 0 2px var(--accent-primary) inset; }
  &.is-selected { background: rgba(var(--accent-primary-rgb, 64,120,192), 0.14); box-shadow: 0 0 0 2px var(--accent-primary) inset; }
}
.run-trace-overview__col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.run-trace-overview__col-board { font-size: 9px; font-weight: 600; padding: 0 4px; border-radius: 3px; background: var(--bg-secondary); color: var(--text-muted); text-transform: uppercase; }
.run-trace-overview__col-title { font-size: 11px; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; font-family: ui-monospace, monospace; }
.run-trace-overview__col-meta { font-size: 9px; color: var(--text-muted); width: 100%; }

.run-trace-overview__row-line { position: absolute; left: 0; right: 0; height: 0; border-bottom: 1px dashed var(--border-color); z-index: 5; pointer-events: none; }
.run-trace-overview__col-line { position: absolute; top: 0; bottom: 0; width: 0; border-right: 1px solid var(--border-color); z-index: 4; pointer-events: none;
  &.is-hit { border-right-color: var(--accent-primary); }
}

.trace-node-card { position: absolute; display: flex; align-items: center; gap: 7px; width: 150px; height: 38px; padding: 4px 8px; border: 1px solid var(--cluster-color, var(--border-color)); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; z-index: 10; transition: box-shadow 0.15s, transform 0.1s;
  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); transform: translateY(-1px); z-index: 11; }
}
.trace-node-card.is-running { animation: trace-node-pulse 1.5s ease-in-out infinite; border-color: var(--success); }
.trace-node-card__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cluster-color, var(--text-muted)); flex-shrink: 0; }
.trace-node-card.is-agent .trace-node-card__dot { background: var(--success); }
.trace-node-card.is-skill .trace-node-card__dot { background: var(--accent-info); }
.trace-node-card.is-tool .trace-node-card__dot { background: var(--warning); }
.trace-node-card.is-error .trace-node-card__dot { background: var(--error); }
.trace-node-card__text { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.trace-node-card__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-node-card__text small { font-size: 9px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-node-card__profile { font-size: 8px; color: var(--cluster-color, var(--text-muted)); font-weight: 600; }
@keyframes trace-node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(76, 175, 80, 0); }
}

.run-trace-overview__legend-item .trace-node-card__dot { display: inline-block; }
.run-trace-overview__legend-item .trace-node-card__dot.is-ingress { background: var(--text-muted); }
.run-trace-overview__legend-item .trace-node-card__dot.is-workflow { background: var(--accent-primary); }
.run-trace-overview__legend-item .trace-node-card__dot.is-agent { background: var(--success); }
.run-trace-overview__legend-item .trace-node-card__dot.is-skill { background: var(--accent-info); }
.run-trace-overview__legend-item .trace-node-card__dot.is-tool { background: var(--warning); }

/* 下层详细视图 */
.run-trace-detail { flex-shrink: 0; max-height: 45%; display: flex; flex-direction: column; border-top: 2px solid var(--accent-primary); background: var(--bg-primary); }
.run-trace-detail__head { display: flex; align-items: center; justify-content: space-between; padding: 6px 18px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.run-trace-detail__title b { font-size: 12px; margin-right: 8px; }
.run-trace-detail__title small { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.run-trace-detail__back { height: 24px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font-size: 11px; font-family: inherit;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
}
.run-trace-detail__scroll { flex: 1; min-height: 0; overflow: auto; }

/* 图例 */
.run-trace-overview__legend { display: flex; align-items: center; gap: 14px; padding: 6px 18px; border-top: 1px solid var(--border-color); background: var(--bg-card); flex-shrink: 0; flex-wrap: wrap; }
.run-trace-overview__legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-secondary); }
.run-trace-overview__legend-hint { font-size: 9px; color: var(--text-muted); margin-left: auto; }
</style>
