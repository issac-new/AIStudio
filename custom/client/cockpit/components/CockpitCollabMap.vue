<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, shallowRef, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { isHumanActionStatus } from '../adapters/topology-adapter'
import { resolveStatusColors, resolveStatusBg, resolveNeutrals } from '../styles/status-colors'

echarts.use([GraphChart, TooltipComponent, CanvasRenderer])

const store = useCockpitStore()
const { t } = useI18n()

const chartEl = ref<HTMLElement | null>(null)
const chart = shallowRef<echarts.ECharts | null>(null)

// 画布参考尺寸（用于坐标计算；ECharts 会自适应容器）
const BASE_W = 360
const BASE_H = 240

/** 获取实际容器尺寸，用于节点位置计算 */
function getContainerSize(): { w: number; h: number } {
  if (chart.value) {
    const w = chart.value.getWidth()
    const h = chart.value.getHeight()
    if (w > 0 && h > 0) return { w, h }
  }
  return { w: BASE_W, h: BASE_H }
}

// 节点布局：中心居中，四方向分区延伸（layout:'none' 自定义坐标）
function computePositions(topo: typeof store.topologyForSelectedTask): Record<string, { x: number; y: number }> {
  const { w, h } = getContainerSize()
  const cx = w / 2
  const cy = h / 2
  const trunkLen = 75
  const layerH = 55
  const nodeHGap = 16
  const sideGap = 100
  const pos: Record<string, { x: number; y: number }> = {}

  const center = topo.nodes.find(n => n.kind === 'center')
  if (center) pos[center.id] = { x: cx, y: cy }

  // 祖先：上方
  const ancestors = topo.nodes.filter(n => n.kind === 'ancestor')
  const ancDepths = new Map<number, typeof ancestors>()
  for (const n of ancestors) {
    if (!ancDepths.has(n.depth)) ancDepths.set(n.depth, [])
    ancDepths.get(n.depth)!.push(n)
  }
  for (const [depth, list] of ancDepths) {
    const totalW = list.length * 100 + (list.length - 1) * nodeHGap
    let x = cx - totalW / 2
    const yOff = trunkLen + (Math.abs(depth) - 1) * layerH
    for (const n of list) {
      pos[n.id] = { x: x + 50, y: cy - yOff }
      x += 100 + nodeHGap
    }
  }

  // 后代：下方
  const descendants = topo.nodes.filter(n => n.kind === 'descendant')
  const descDepths = new Map<number, typeof descendants>()
  for (const n of descendants) {
    if (!descDepths.has(n.depth)) descDepths.set(n.depth, [])
    descDepths.get(n.depth)!.push(n)
  }
  for (const [depth, list] of descDepths) {
    const totalW = list.length * 100 + (list.length - 1) * nodeHGap
    let x = cx - totalW / 2
    const yOff = trunkLen + (depth - 1) * layerH
    for (const n of list) {
      pos[n.id] = { x: x + 50, y: cy + yOff }
      x += 100 + nodeHGap
    }
  }

  // 频道：左侧
  topo.nodes.filter(n => n.kind === 'channel').forEach((n, i) => {
    pos[n.id] = { x: cx - trunkLen - i * sideGap, y: cy }
  })
  // 人员：右侧
  topo.nodes.filter(n => n.kind === 'person').forEach((n, i) => {
    pos[n.id] = { x: cx + trunkLen + i * sideGap, y: cy }
  })
  // folded
  const folded = topo.nodes.find(n => n.kind === 'folded')
  if (folded) pos[folded.id] = { x: cx + 80, y: cy + 60 }
  return pos
}

// 四维度样式配置（Pure Ink 风格）
// label 放节点内部（inside），symbolSize 按 label 长度自适应增大
// overlay[fix-pure-ink]: 颜色从主题变量 resolve，不再硬编码 hex（dark/comic 主题自动适配）
const _n = resolveNeutrals()
const STYLE = {
  center: {
    itemStyle: { color: _n.accent, borderColor: _n.ink, borderWidth: 3 },
    label: { color: _n.bgCard, fontSize: 13, fontWeight: 'bold', position: 'inside' },
    symbol: 'circle', symbolSizeBase: 48,
  },
  ancestor: {
    itemStyle: { color: _n.bgCard, borderColor: _n.inkSecondary, borderWidth: 2.5 },
    label: { color: _n.ink, fontSize: 11, fontWeight: '600', position: 'inside' },
    symbol: 'circle', symbolSizeBase: 34,
  },
  descendant: {
    itemStyle: { color: _n.bgCard, borderColor: _n.muted, borderWidth: 1.5, borderType: 'dashed' },
    label: { color: _n.inkSecondary, fontSize: 11, fontWeight: 'normal', position: 'inside' },
    symbol: 'diamond', symbolSizeBase: 34,
  },
  channel: {
    itemStyle: { color: _n.bgSecondary, borderColor: _n.accent, borderWidth: 2 },
    label: { color: _n.ink, fontSize: 11, fontWeight: 'bold', position: 'inside' },
    symbol: 'roundRect', symbolSizeBase: 34,
  },
  person: {
    itemStyle: { color: _n.bgCard, borderColor: _n.border, borderWidth: 1 },
    label: { color: _n.muted, fontSize: 10, fontWeight: 'normal', position: 'inside' },
    symbol: 'circle', symbolSizeBase: 28,
  },
  folded: {
    itemStyle: { color: _n.bgSecondary, borderColor: _n.border, borderWidth: 1, borderType: 'dotted' },
    label: { color: _n.muted, fontSize: 9, position: 'inside' },
    symbol: 'circle', symbolSizeBase: 24,
  },
}

// 连线样式：按节点类型组合
function linkStyle(fromKind: string, toKind: string) {
  const n = resolveNeutrals()
  // 垂直关系（ancestor↔center↔descendant）
  if (fromKind === 'ancestor' || toKind === 'ancestor') {
    return { color: n.muted, width: 1.5, type: 'solid' as const }  // 实线
  }
  if (fromKind === 'descendant' || toKind === 'descendant') {
    return { color: n.border, width: 1.5, type: 'dashed' as const }  // 虚线
  }
  // 水平关系（channel/person）
  if (fromKind === 'channel' || toKind === 'channel') {
    return { color: n.muted, width: 1.5, type: 'dotted' as const }  // 点线
  }
  return { color: n.border, width: 1, type: 'solid' as const }  // 人员细线
}

// ── 需要人工介入的状态视觉区分 ──
// 仅对 center/ancestor/descendant 任务节点生效，覆盖默认边框+背景
// blocked: 红色（阻塞，需人工取消阻塞）
// todo: 蓝色（待办，需人工启动）
// triage: 信息蓝（分诊，需人工细化/分流）
// review: 橙色（待审核，需人工审核）
// overlay[fix-pure-ink]: 状态色统一从 status-colors.ts resolve，与 Kanban/Attention/Legend 一致
function humanActionStyles() {
  const c = resolveStatusColors()
  const bg = (s: 'blocked' | 'todo' | 'triage' | 'review') => resolveStatusBg(s, 0.12)
  return {
    blocked: {
      itemStyle: { borderColor: c.blocked, borderWidth: 3, color: bg('blocked'), shadowBlur: 8, shadowColor: resolveStatusBg('blocked', 0.3) },
      label: { color: c.blocked, fontWeight: 'bold' },
    },
    todo: {
      itemStyle: { borderColor: c.todo, borderWidth: 2.5, color: bg('todo'), shadowBlur: 6, shadowColor: resolveStatusBg('todo', 0.25) },
      label: { color: c.todo, fontWeight: '600' },
    },
    triage: {
      itemStyle: { borderColor: c.triage, borderWidth: 2.5, color: bg('triage'), shadowBlur: 6, shadowColor: resolveStatusBg('triage', 0.25) },
      label: { color: c.triage, fontWeight: '600' },
    },
    review: {
      itemStyle: { borderColor: c.review, borderWidth: 2.5, color: bg('review'), shadowBlur: 6, shadowColor: resolveStatusBg('review', 0.25) },
      label: { color: c.review, fontWeight: '600' },
    },
  } as const
}

// 图表数据（函数形式：每次调用重新计算，确保容器尺寸变化时坐标更新）
function buildChartOption() {
  const topo = store.topologyForSelectedTask
  if (!topo.nodes.length) return { series: [] }
  const positions = computePositions(topo)
  const nodeKindMap = new Map(topo.nodes.map(n => [n.id, n.kind]))

  const nodes = topo.nodes.map((n) => {
    const st = STYLE[n.kind] ?? STYLE.folded
    const p = positions[n.id] ?? { x: BASE_W / 2, y: BASE_H / 2 }
    // symbolSize 按 label 长度自适应（让文字尽量放得下）
    const labelLen = n.label.length
    const dynSize = Math.min(90, st.symbolSizeBase + labelLen * 3.2)
    // label 截断宽度 = symbolSize - padding（保证文字在框内）
    const truncW = dynSize - 10
    // 截断 label 使其放得下
    let label = n.label
    const approxCharW = st.label.fontSize > 11 ? 8 : 6.5
    const maxChars = Math.floor(truncW / approxCharW)
    if (labelLen > maxChars) label = label.slice(0, maxChars - 1) + '…'

    // 人工介入状态覆盖：仅对任务节点（center/ancestor/descendant）且状态属于需介入类型时生效
    const isTaskNode = n.kind === 'center' || n.kind === 'ancestor' || n.kind === 'descendant'
    const statusStyle = (isTaskNode && isHumanActionStatus(n.status))
      ? (humanActionStyles() as any)[n.status as 'blocked' | 'todo' | 'triage' | 'review']
      : null

    const itemStyle = statusStyle
      ? { ...st.itemStyle, ...statusStyle.itemStyle }
      : st.itemStyle
    const labelStyle = statusStyle
      ? { ...st.label, color: statusStyle.label.color, fontWeight: statusStyle.label.fontWeight }
      : st.label

    // 状态标记：节点 label 保持纯文本标题（状态由边框颜色+图例表达，不再用 emoji 前缀）
    const displayLabel = label

    return {
      id: n.id,
      name: displayLabel,
      x: p.x,
      y: p.y,
      symbol: st.symbol,
      symbolSize: dynSize,
      itemStyle,
      label: { ...labelStyle, show: true, overflow: 'truncate', width: truncW },
      _nodeKind: n.kind,
      _taskId: n.taskId,
      _status: n.status,
      _targetTaskId: n.target?.taskId,
      _routeTarget: n.target?.routeTarget,
    }
  })

  const links = topo.relations.map((r) => {
    const fromKind = nodeKindMap.get(r.from) ?? ''
    const toKind = nodeKindMap.get(r.to) ?? ''
    return {
      source: r.from,
      target: r.to,
      lineStyle: linkStyle(fromKind, toKind),
    }
  })

  return {
    tooltip: {
      show: true,
      formatter: (params: any) => {
        if (params.dataType !== 'node') return ''
        const d = params.data
        if (!d) return ''
        // overlay[fix-pure-ink]: tooltip 状态文字不带 emoji，颜色交给状态色
        const statusLabels: Record<string, string> = {
          blocked: '阻塞 — 需人工取消阻塞',
          todo: '待办 — 需人工启动',
          triage: '分诊 — 需人工细化/分流',
          review: '待审核 — 需人工审核',
          scheduled: '已排期',
          ready: '就绪',
          running: '进行中',
          done: '已完成',
          archived: '已归档',
        }
        const statusText = d._status ? (statusLabels[d._status] ?? d._status) : ''
        const rawName = typeof d.name === 'string' ? d.name : ''
        return statusText ? `<b>${rawName}</b><br/><span style="font-size:11px;opacity:0.75">${statusText}</span>` : `<b>${rawName}</b>`
      },
    },
    series: [{
      type: 'graph',
      layout: 'none',      // 自定义坐标（四方向分区）
      roam: true,           // 滚轮缩放 + 拖拽平移
      draggable: false,     // 节点不可拖（固定分区布局）
      label: { show: true },
      emphasis: {
        focus: 'adjacency',
        label: { fontSize: 13, fontWeight: 'bold' },
        lineStyle: { width: 2.5, color: resolveNeutrals().inkSecondary },
      },
      scaleLimit: { min: 0.5, max: 3 },
      data: nodes,
      links,
    }],
  }
}

// 节点点击处理
function onChartClick(params: any) {
  if (params.dataType !== 'node') return
  const d = params.data
  if (!d) return
  const kind = d._nodeKind
  if (kind === 'folded') return
  if (d._targetTaskId) {
    store.selectTask(d._targetTaskId)
  } else if (kind === 'center') {
    store.selectTask(d._taskId)
  } else if (kind === 'channel' && d._routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === d._taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

function renderChart() {
  if (!chart.value) return
  // 容器尺寸为 0 时跳过 setOption，防 eCharts 内部矩阵 null 崩溃
  if (!chartEl.value || chartEl.value.clientWidth === 0 || chartEl.value.clientHeight === 0) return
  try {
    chart.value.setOption(buildChartOption(), { notMerge: true })
  } catch {
    // eCharts 内部矩阵可能因之前的 0 尺寸初始化而损坏，重建实例
    chart.value.dispose()
    chart.value = echarts.init(chartEl.value)
    chart.value.on('click', onChartClick)
    chart.value.on('dblclick', onChartDblClick)
    chart.value.resize()
    chart.value.setOption(buildChartOption(), { notMerge: true })
  }
}

const hasTask = computed(() => !!store.selectedTask)

// 计算当前拓扑中存在哪些人工介入状态（驱动图例显示）
const legendStatuses = computed(() => {
  const result = { blocked: false, todo: false, triage: false, review: false }
  for (const n of store.topologyForSelectedTask.nodes) {
    if (n.status === 'blocked') result.blocked = true
    else if (n.status === 'todo') result.todo = true
    else if (n.status === 'triage') result.triage = true
    else if (n.status === 'review') result.review = true
  }
  return result
})
const hasHumanActionNodes = computed(() => {
  const l = legendStatuses.value
  return l.blocked || l.todo || l.triage || l.review
})

// 节点双击：弹窗显示 kanban 详情
function onChartDblClick(params: any) {
  if (params.dataType !== 'node') return
  const d = params.data
  if (!d) return
  // 用 taskId 打开 kanban 详情（center 用自身 taskId，其他用 target.taskId）
  const tid = d._targetTaskId ?? d._taskId
  if (tid) store.openKanbanDetail(tid)
}

// 拓扑数据变化时重渲染
watch(() => store.topologyForSelectedTask, () => renderChart(), { deep: true })

// hasTask 变 true 时（chartEl 从 v-if 渲染出来）初始化 ECharts
watch(hasTask, (v, oldV) => {
  if (v && !oldV) {
    nextTick(() => initChart())
  } else if (!v && chart.value) {
    chart.value.dispose()
    chart.value = null
  }
})

function initChart() {
  if (chart.value || !chartEl.value) return
  // 容器尺寸为 0 时（jsdom 测试环境 / 初始渲染）仍尝试初始化，
  // ResizeObserver 会在尺寸变化后触发 resize。
  chart.value = echarts.init(chartEl.value)
  chart.value.on('click', onChartClick)
  chart.value.on('dblclick', onChartDblClick)
  chart.value.resize()
  renderChart()
}

onMounted(() => {
  // 若 onMounted 时 hasTask 已为 true（chartEl 已渲染），直接 init
  if (hasTask.value && chartEl.value) {
    initChart()
  }
  window.addEventListener('resize', onResize)
})

function safeResizeAndRender() {
  // 容器尺寸为 0 时（动画过渡期间）跳过，防 eCharts 内部矩阵 null 崩溃
  if (!chartEl.value || chartEl.value.clientWidth === 0 || chartEl.value.clientHeight === 0) return
  chart.value?.resize()
  renderChart()
}

function onResize() {
  safeResizeAndRender()
}

// 面板最大化/折叠/展开/分割线拖拽时容器尺寸可能变化，ECharts 需重新自适应
watch(() => [
  store.maximized.mid, store.collapsed.mid,
  store.maximized.left, store.collapsed.left,
  store.maximized.right, store.collapsed.right,
  store.midTopCollapsed, store.midBottomCollapsed,
], () => {
  nextTick(() => safeResizeAndRender())
})

// ResizeObserver: 更精确地监听容器自身大小变化（面板拖拽分割线等场景）
// 每次 chartEl 变化（v-if 销毁/重建）时重建 observer，避免监听已卸载元素
let resizeObserver: ResizeObserver | null = null
watch(chartEl, (el) => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (el) {
    resizeObserver = new ResizeObserver(() => safeResizeAndRender())
    resizeObserver.observe(el)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <span class="cockpit-map__hint-inline">{{ t('cockpit.mapHint') }}</span>
      <!-- 人工介入状态图例 -->
      <div v-if="hasHumanActionNodes" class="cockpit-map__legend">
        <span v-if="legendStatuses.blocked" class="legend-item legend-blocked">
          <span class="legend-dot"></span>{{ t('cockpit.legendBlocked') }}
        </span>
        <span v-if="legendStatuses.todo" class="legend-item legend-todo">
          <span class="legend-dot"></span>{{ t('cockpit.legendTodo') }}
        </span>
        <span v-if="legendStatuses.triage" class="legend-item legend-triage">
          <span class="legend-dot"></span>{{ t('cockpit.legendTriage') }}
        </span>
        <span v-if="legendStatuses.review" class="legend-item legend-review">
          <span class="legend-dot"></span>{{ t('cockpit.legendReview') }}
        </span>
      </div>
    </div>
    <div v-if="hasTask" ref="chartEl" class="cockpit-map__chart"></div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 10px 44px 6px 16px; flex-shrink: 0; flex-wrap: wrap; }
.cockpit-map__title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.cockpit-map__hint-inline { font-size: 10px; color: var(--text-muted); }
.cockpit-map__chart { flex: 1 1 0; min-height: 100px; width: 100%; }
.cockpit-map__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; }

/* 人工介入状态图例 */
.cockpit-map__legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-wrap: wrap;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1.4;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid currentColor;
  flex-shrink: 0;
}
.legend-blocked { color: var(--error); background: rgba(var(--error-rgb, 198, 40, 40), 0.08); }
.legend-blocked .legend-dot { background: rgba(var(--error-rgb, 198, 40, 40), 0.15); }
.legend-todo { color: var(--accent-primary); background: rgba(var(--accent-primary-rgb, 51, 51, 51), 0.08); }
.legend-todo .legend-dot { background: rgba(var(--accent-primary-rgb, 51, 51, 51), 0.12); }
.legend-triage { color: var(--accent-info); background: rgba(var(--accent-info-rgb, 74, 144, 217), 0.08); }
.legend-triage .legend-dot { background: rgba(var(--accent-info-rgb, 74, 144, 217), 0.15); }
.legend-review { color: var(--warning); background: rgba(var(--warning-rgb, 245, 127, 23), 0.08); }
.legend-review .legend-dot { background: rgba(var(--warning-rgb, 245, 127, 23), 0.15); }
</style>
