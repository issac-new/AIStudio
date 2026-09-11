<!-- overlay/custom/client/loop/orchestrator/components/EditorCanvas.vue -->
<!-- P4 T6 —— 编辑画布（vue-flow 编辑模式，用法对齐 RunGraphCanvas：零新依赖）：
     面板拖入/点击落节点（父层 addToSpec 管唯一 id 与落位）、点选节点（右侧
     配置面板联动，Ctrl/Cmd+点击多选容器成员）、Handle 拖拽连线（父层 addEdge
     管回边自动 guard）、拖动节点落位（node-drag-stop 上抛坐标）。
     doc 是唯一事实源（父层纯函数产出新对象），本组件在 doc 变更时重建
     flow 视图；v-model 下的拖拽由 vue-flow 自管，落位后经 move-node 回流。 -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueFlow, MarkerType, Handle, Position, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { edgeId, type CanvasDoc } from '../adapters/editor'

const props = defineProps<{
  doc: CanvasDoc
  /** 选中的节点 id 集（多选 = 容器成员/批量删除目标） */
  selectedNodeIds: string[]
  /** 选中的边（`${from}->${to}`；配置面板隐藏、删边目标） */
  selectedEdgeId: string | null
  /** 违法边（校验警告/错误定位）：`${from}->${to}` */
  invalidEdgeIds: string[]
  /** 告警节点 id 集 */
  warningNodeIds: string[]
}>()

const emit = defineEmits<{
  (e: 'card-click', id: string, multi: boolean): void
  (e: 'edge-click', edgeKey: string): void
  (e: 'connect', pair: { from: string; to: string }): void
  (e: 'move-node', pos: { id: string; x: number; y: number }): void
  (e: 'drop-node', at: { type: string; x: number; y: number }): void
}>()

const wrapper = ref<HTMLElement | null>(null)
const flowNodes = ref<Node[]>([])
const flowEdges = ref<Edge[]>([])
const { t } = useI18n()

function rebuild(doc: CanvasDoc): void {
  flowNodes.value = doc.nodes.map(n => ({
    id: n.id,
    type: 'editor-node',
    position: { x: n.x, y: n.y },
    data: {
      label: (typeof n.config?.label === 'string' && n.config.label) || n.id,
      type: n.type,
      selected: props.selectedNodeIds.includes(n.id),
      warned: props.warningNodeIds.includes(n.id),
    },
    class: `ed-type-${n.type} ${props.selectedNodeIds.includes(n.id) ? 'is-selected' : ''}`,
    draggable: true,
    connectable: true,
    selectable: true,
  }))
  flowEdges.value = doc.edges.map(e => {
    const key = edgeId(e.from, e.to)
    const invalid = props.invalidEdgeIds.includes(key)
    return {
      id: key,
      source: e.from,
      target: e.to,
      type: 'default',
      label: e.guard !== undefined ? `×${e.guard.maxIterations}` : undefined,
      labelStyle: { fontSize: 10, fill: 'var(--text-muted, #878c99)' },
      labelBgStyle: { fillOpacity: 0 },
      markerEnd: MarkerType.ArrowClosed,
      // 回边（带 guard）虚线；违法边红；选中边加粗
      style: {
        stroke: invalid
          ? 'var(--error, var(--color-danger, #e11d48))'
          : key === props.selectedEdgeId
            ? 'var(--accent-primary, var(--color-primary, #3b82f6))'
            : 'var(--border-color, #c8c8c8)',
        strokeWidth: invalid || key === props.selectedEdgeId ? 2 : 1,
        strokeDasharray: e.guard !== undefined ? '6 4' : undefined,
      },
    }
  })
}

// doc / 选中态 / 校验标记任一变化 → 重建视图（doc 每次变更是新对象）
watch(
  () => [props.doc, props.selectedNodeIds, props.selectedEdgeId, props.invalidEdgeIds, props.warningNodeIds] as const,
  () => rebuild(props.doc),
  { immediate: true },
)

function onCardClick(id: string, ev: MouseEvent): void {
  emit('card-click', id, ev.ctrlKey || ev.metaKey)
}

function onConnect(pair: { source: string; target: string }): void {
  if (!pair.source || !pair.target) return
  emit('connect', { from: pair.source, to: pair.target })
}

function onDragStop(node: { id: string; position: { x: number; y: number } }): void {
  emit('move-node', { id: node.id, x: node.position.x, y: node.position.y })
}

/** 面板拖入落位：以画布元素左上角为原点（不补偿视口平移/缩放——小图近似够用，
 *  落点微调由拖拽完成）。dataTransfer 键与左侧面板约定 application/x-node-type。 */
function onDrop(ev: DragEvent): void {
  const type = ev.dataTransfer?.getData('application/x-node-type')
  if (!type || !wrapper.value) return
  const rect = wrapper.value.getBoundingClientRect()
  emit('drop-node', {
    type,
    x: Math.round(ev.clientX - rect.left - 80),
    y: Math.round(ev.clientY - rect.top - 24),
  })
}
</script>

<template>
  <div
    ref="wrapper"
    class="ed-canvas"
    data-editor-canvas
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <VueFlow
      v-if="props.doc.nodes.length > 0"
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :fit-view-on-init="true"
      :nodes-connectable="true"
      :elements-selectable="true"
      :pan-on-drag="true"
      :zoom-on-scroll="true"
      :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
      @connect="onConnect"
      @node-drag-stop="onDragStop"
      @edge-click="(edge: Edge) => emit('edge-click', String(edge.id))"
    >
      <template #node-editor-node="nodeProps">
        <div
          class="ed-node"
          :class="[
            `ed-node--${nodeProps.data.type}`,
            { 'is-selected': nodeProps.data.selected, 'is-warned': nodeProps.data.warned },
          ]"
          :data-node-id="nodeProps.id"
          :title="nodeProps.data.type"
          @click.stop="onCardClick(nodeProps.id, $event)"
        >
          <div class="ed-node__label">{{ nodeProps.data.label }}</div>
          <div class="ed-node__type">{{ nodeProps.data.type }}</div>
          <Handle type="target" :position="Position.Top" />
          <Handle type="source" :position="Position.Bottom" />
        </div>
      </template>
    </VueFlow>
    <div v-else class="ed-canvas__empty" data-editor-canvas-empty>
      {{ t('ia2.orchestrate.editor.canvas.empty') }}
    </div>
  </div>
</template>

<style scoped>
.ed-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background:
    radial-gradient(circle at 1px 1px, var(--border-light, rgba(127, 127, 127, 0.18)) 1px, transparent 0) 0 0 / 16px 16px;
}
:deep(.vue-flow) { width: 100%; height: 100%; background: transparent; }
:deep(.vue-flow__node) { width: auto; cursor: grab; }
:deep(.vue-flow__handle) {
  width: 8px;
  height: 8px;
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  border: 1px solid var(--bg-card, #fff);
}
.ed-canvas__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}

/* 可编辑节点卡（类型只做轻着色提示，状态语义仍由选中/告警描边承载） */
.ed-node {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
  max-width: 168px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card, var(--color-bg-primary, #fff));
  color: var(--text-primary, var(--color-text-primary, #1f2329));
  cursor: pointer;
}
.ed-node__label {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-node__type {
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ed-node.is-selected {
  border-width: 2px;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
.ed-node.is-warned { border-color: var(--color-warning, #f59e0b); }
</style>
