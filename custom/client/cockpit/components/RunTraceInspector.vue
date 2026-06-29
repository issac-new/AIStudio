<script setup lang="ts">
import type { TraceNode } from '../adapters/run-trace-adapter'
defineProps<{ node: TraceNode | null }>()
</script>
<template>
  <aside class="run-trace-inspector" data-run-trace-inspector>
    <template v-if="node">
      <div class="run-trace-inspector__head"><span></span><b>{{ node.label }}</b><em>{{ node.evidence }}</em></div>
      <section><h5>概览</h5><p>{{ node.detail || '无详情' }}</p></section>
      <section><h5>状态</h5><p>{{ node.status }}<template v-if="node.durationMs"> · {{ node.durationMs }}ms</template></p></section>
    </template>
    <p v-else class="run-trace-inspector__empty">选择节点查看详情</p>
  </aside>
</template>
<style scoped lang="scss">
.run-trace-inspector { border-left: 1px solid var(--border-color); background: var(--bg-sidebar); padding: 16px; overflow: auto; }
.run-trace-inspector__head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); margin-bottom: 14px; }
.run-trace-inspector__head span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-info); }
.run-trace-inspector__head b { font-size: 13px; }
.run-trace-inspector__head em { margin-left: auto; font-size: 10px; color: var(--text-muted); font-style: normal; }
.run-trace-inspector section { margin-bottom: 14px; }
.run-trace-inspector h5 { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 6px; }
.run-trace-inspector p { font-size: 11px; color: var(--text-secondary); line-height: 1.6; }
.run-trace-inspector__empty { color: var(--text-muted); }
</style>
