<script setup lang="ts">
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
const props = defineProps<{ nodes: TraceNode[]; edges: TraceEdge[]; focusedNodeId: string | null }>()
const emit = defineEmits<{ (e: 'focus-node', id: string): void }>()
function evidenceClass(e: { evidence: string }) { return `is-${e.evidence.toLowerCase()}` }
</script>
<template>
  <div class="run-trace-graph" data-run-trace-graph :class="{ 'has-focus': !!focusedNodeId }">
    <div class="run-trace-graph__edges" aria-hidden="true">
      <span v-for="edge in edges" :key="edge.id" class="run-trace-graph__edge" :class="[evidenceClass(edge)]">{{ edge.kind }}</span>
    </div>
    <button
      v-for="node in nodes"
      :key="node.id"
      type="button"
      class="run-trace-node"
      :class="[`is-${node.kind}`, `is-${node.status}`, evidenceClass(node), { 'is-focus': node.id === focusedNodeId }]"
      :data-node-id="node.id"
      :aria-label="`${node.kind}: ${node.label}`"
      @click="emit('focus-node', node.id)"
    >
      <span class="run-trace-node__dot"></span>
      <span class="run-trace-node__text"><b>{{ node.label }}</b><small>{{ node.detail || node.evidence }}</small></span>
    </button>
  </div>
</template>
<style scoped lang="scss">
.run-trace-graph { position: relative; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 10px; padding: 16px; min-height: 360px; overflow: auto; background: radial-gradient(circle at 1px 1px, var(--border-light) 1px, transparent 0) 0 0 / 16px 16px; }
.run-trace-graph__edges { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 6px; font-size: 9px; color: var(--text-muted); }
.run-trace-graph__edge.is-l2 { border-bottom: 1px dashed var(--text-muted); }
.run-trace-graph__edge.is-l3 { border-bottom: 1px dotted var(--text-muted); }
.run-trace-node { display: flex; align-items: center; gap: 7px; min-width: 120px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-family: inherit; text-align: left; }
.run-trace-node:hover { background: var(--bg-card-hover); }
.run-trace-node.is-focus { border-color: var(--accent-primary); border-width: 2px; box-shadow: 0 0 0 3px rgba(107, 163, 214, 0.16); }
.run-trace-node.is-l3 { border-style: dashed; }
.run-trace-node__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.run-trace-node.is-agent .run-trace-node__dot { background: var(--success); }
.run-trace-node.is-skill .run-trace-node__dot { background: var(--accent-info); }
.run-trace-node.is-memory .run-trace-node__dot { background: var(--warning); }
.run-trace-node.is-error .run-trace-node__dot { background: var(--error); }
.run-trace-node__text { display: flex; flex-direction: column; min-width: 0; }
.run-trace-node__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-trace-node__text small { font-size: 9px; color: var(--text-muted); }
</style>
