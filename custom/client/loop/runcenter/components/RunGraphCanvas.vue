<!-- overlay/custom/client/loop/runcenter/components/RunGraphCanvas.vue -->
<!-- RunGraphCanvas — 执行图只读画布（task-6）。vue-flow 无编辑模式：
     节点状态着色（Pure Ink：done 灰实 / running 描边动画 / failed error /
     awaiting-input warning / skipped 虚化）、迭代徽标（节点完成次数，>1 显示）、
     回边虚线弧 + guard 徽标（maxIterations）、taken 边描色。
     P4 T8：spec 携带 containers 时为成员画包围框（容器框以专用节点类型
     rg-container 挂进视口，随画布平移缩放；标签 = container.label 或 id）。
     布局为手写分层（layoutRunGraph 纯函数）：固定六节点列布局。
     点击节点 emit('select-node')——B7 检查器预留的消费口。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { VueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { layoutRunGraph } from '../adapters/run-graph'
import type { RunGraphData } from '../adapters/run-graph'

/** P4 T8：容器可视化元数据（GraphSpec.containers 同构子集，结构性传入） */
interface RunGraphContainerLike {
  id: string
  label?: string
  nodeIds: string[]
}

const props = defineProps<{
  graph: RunGraphData
  /** 布局入口提示（缺省取零入边节点） */
  entryNode?: string
  selectedNodeId?: string | null
  /** spec 携带的 loop 容器（成员包围框 + 标签） */
  containers?: RunGraphContainerLike[]
}>()

const emit = defineEmits<{ (e: 'select-node', id: string): void }>()

/** 时长标签：<1s → ms；否则秒（一位小数）；0 不显示 */
function durationLabel(ms: number): string {
  if (ms <= 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 分层布局（节点与容器框共用同一坐标系） */
const positions = computed(() => layoutRunGraph(props.graph, props.entryNode))

// 容器框几何：节点卡片尺寸估计（.rg-node min/max 宽 + 两行内容高）+ 外扩留白。
// 手写布局无真实量测（jsdom / SSR 同口径），估计值只影响框的呼吸感不影响拓扑。
const CONTAINER_NODE_W = 176
const CONTAINER_NODE_H = 58
const CONTAINER_PAD = 14

/** 容器包围框：成员位置极值 + 留白（绝对定位 div 框挂专用节点进视口） */
const containerFrames = computed(() => {
  if (!props.containers || props.graph.nodes.length === 0) return []
  const frames: Array<{ key: string; containerId: string; label: string; x: number; y: number; w: number; h: number }> = []
  for (const c of props.containers) {
    const members = c.nodeIds
      .map(id => positions.value.get(id))
      .filter((p): p is { x: number; y: number } => Boolean(p))
    if (members.length === 0) continue
    const minX = Math.min(...members.map(m => m.x)) - CONTAINER_PAD
    const minY = Math.min(...members.map(m => m.y)) - CONTAINER_PAD * 2
    const maxX = Math.max(...members.map(m => m.x)) + CONTAINER_NODE_W + CONTAINER_PAD
    const maxY = Math.max(...members.map(m => m.y)) + CONTAINER_NODE_H + CONTAINER_PAD
    frames.push({
      key: `container-${c.id}`,
      containerId: c.id,
      label: c.label || c.id,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    })
  }
  return frames
})

/** 容器框挂成专用 vue-flow 节点（zIndex 压底、不可交互），随视口平移缩放 */
const containerNodes = computed<Node[]>(() =>
  containerFrames.value.map(f => ({
    id: f.key,
    type: 'rg-container',
    position: { x: f.x, y: f.y },
    data: { label: f.label, width: f.w, height: f.h, containerId: f.containerId },
    zIndex: 0,
    draggable: false,
    selectable: false,
    connectable: false,
  })))

const flowNodes = computed<Node[]>(() => {
  const content = props.graph.nodes.map((n) => {
    const p = positions.value.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      type: 'run-node',
      position: p,
      zIndex: 1,
      data: {
        label: n.label,
        type: n.type,
        status: n.status,
        iteration: n.iteration, // 节点完成次数；徽标仅 >1 显示（多次完成才叫迭代）
        duration: durationLabel(n.durationMs),
        selected: n.id === props.selectedNodeId,
      },
      // 状态类挂节点根上，供画布级样式（选中描边等）使用
      class: `is-${n.status} ${n.id === props.selectedNodeId ? 'is-selected' : ''}`,
      draggable: false,
      connectable: false,
      selectable: false,
    }
  })
  return [...containerNodes.value, ...content]
})

const flowEdges = computed<Edge[]>(() => {
  return props.graph.edges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'default',
    // 回边（带 guard）画虚线弧 + guard 徽标；taken 边描色加粗
    animated: false,
    label: e.guard !== undefined ? `×${e.guard}` : undefined,
    labelStyle: { fontSize: 10, fill: 'var(--text-muted, #878c99)' },
    labelBgStyle: { fillOpacity: 0 },
    markerEnd: MarkerType.ArrowClosed,
    style: {
      stroke: e.taken
        ? 'var(--accent-primary, var(--color-primary, #3b82f6))'
        : 'var(--border-color, #c8c8c8)',
      strokeWidth: e.taken ? 2 : 1,
      strokeDasharray: e.guard !== undefined ? '6 4' : undefined,
      opacity: e.taken ? 1 : 0.55,
    },
  }))
})

function onSelect(id: string): void {
  emit('select-node', id)
}
</script>

<template>
  <div class="rg-canvas" data-run-graph-canvas>
    <VueFlow
      v-if="graph.nodes.length > 0"
      :nodes="flowNodes"
      :edges="flowEdges"
      :fit-view-on-init="true"
      :nodes-connectable="false"
      :edges-connectable="false"
      :elements-selectable="false"
      :pan-on-drag="true"
      :zoom-on-scroll="true"
      :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
    >
      <template #node-rg-container="containerProps">
        <div
          class="rg-container"
          :data-container-id="containerProps.data.containerId"
          :style="{
            width: `${containerProps.data.width}px`,
            height: `${containerProps.data.height}px`,
          }"
        >
          <span class="rg-container__label">{{ containerProps.data.label }}</span>
        </div>
      </template>
      <template #node-run-node="nodeProps">
        <div
          class="rg-node"
          :class="[
            `is-${nodeProps.data.status}`,
            { 'is-selected': nodeProps.data.selected },
          ]"
          :data-node-id="nodeProps.id"
          :title="`${nodeProps.data.type} · ${nodeProps.data.status}`"
          @click.stop="onSelect(nodeProps.id)"
        >
          <div class="rg-node__head">
            <span class="rg-node__label">{{ nodeProps.data.label }}</span>
            <span v-if="nodeProps.data.iteration > 1" class="rg-node__iteration">
              #{{ nodeProps.data.iteration }}
            </span>
          </div>
          <div class="rg-node__meta">
            <span class="rg-node__type">{{ nodeProps.data.type }}</span>
            <span v-if="nodeProps.data.duration" class="rg-node__duration">{{ nodeProps.data.duration }}</span>
          </div>
        </div>
      </template>
    </VueFlow>
    <div v-else class="rg-canvas__empty">
      <slot name="empty" />
    </div>
  </div>
</template>

<style scoped>
.rg-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background:
    radial-gradient(circle at 1px 1px, var(--border-light, rgba(127, 127, 127, 0.18)) 1px, transparent 0) 0 0 / 16px 16px;
}
:deep(.vue-flow) { width: 100%; height: 100%; background: transparent; }
:deep(.vue-flow__node) { cursor: pointer; width: auto; }
:deep(.vue-flow__node.is-selected .rg-node) { border-width: 2px; }

.rg-canvas__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-size: 12px;
}

/* 节点卡片（Pure Ink 语义着色，只映射语义变量不写死主题色） */
.rg-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 128px;
  max-width: 168px;
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card, var(--color-bg-primary, #fff));
  color: var(--text-primary, var(--color-text-primary, #1f2329));
  transition: box-shadow 0.2s;
}
.rg-node__head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.rg-node__label {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rg-node__iteration {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill, 999px);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rg-node__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rg-node__type {
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rg-node__duration { font-size: 10px; font-variant-numeric: tabular-nums; color: var(--text-muted, #878c99); }

/* 状态着色：done 灰实 / running 描边动画 / failed error / awaiting-input warning / skipped 虚化 */
.rg-node.is-done { border-color: var(--border-color); opacity: 0.82; }
.rg-node.is-done .rg-node__label { color: var(--text-secondary, var(--color-text-secondary, #5c6470)); }
.rg-node.is-running { border-color: var(--color-success, #28bf5c); animation: rg-node-running 1.6s ease-in-out infinite; }
.rg-node.is-failed { border-color: var(--color-danger, #e11d48); }
.rg-node.is-failed .rg-node__label { color: var(--color-danger, #e11d48); }
.rg-node.is-awaiting-input { border-color: var(--color-warning, #f59e0b); box-shadow: 0 0 0 1px var(--color-warning, #f59e0b); }
.rg-node.is-skipped { border-style: dashed; opacity: 0.45; }
.rg-node.is-selected { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }

/* P4 T8：loop 容器包围框（虚线 + 标签；压在节点层之下） */
.rg-container {
  position: relative;
  box-sizing: border-box;
  border: 1.5px dashed var(--accent-primary, var(--color-primary, #3b82f6));
  border-radius: var(--radius-standard, 8px);
  background: rgba(59, 130, 246, 0.04);
  pointer-events: none;
}
.rg-container__label {
  position: absolute;
  top: -9px;
  left: 10px;
  padding: 0 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-card, var(--color-bg-primary, #fff));
  font-size: 10px;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
  white-space: nowrap;
}

@keyframes rg-node-running {
  0%, 100% { box-shadow: 0 0 0 0 rgba(40, 191, 92, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(40, 191, 92, 0); }
}
</style>
