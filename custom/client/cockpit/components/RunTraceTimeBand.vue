<script setup lang="ts">
import { computed } from 'vue'
import type { TraceNode } from '../adapters/run-trace-adapter'
const props = defineProps<{ nodes: TraceNode[] }>()
const bars = computed(() => {
  const timed = props.nodes.filter(n => typeof n.durationMs === 'number' && n.durationMs! > 0)
  const max = Math.max(1, ...timed.map(n => n.durationMs ?? 1))
  return timed.map(n => ({ id: n.id, label: n.label, width: `${Math.max(6, Math.round(((n.durationMs ?? 1) / max) * 100))}%`, kind: n.kind, status: n.status }))
})
</script>
<template>
  <div class="run-trace-timeband" data-run-trace-timeband>
    <span class="run-trace-timeband__label">TIME BAND</span>
    <div class="run-trace-timeband__track">
      <span v-for="bar in bars" :key="bar.id" class="run-trace-timeband__bar" :class="[`is-${bar.kind}`, `is-${bar.status}`]" :style="{ width: bar.width }">{{ bar.label }}</span>
    </div>
  </div>
</template>
<style scoped lang="scss">
.run-trace-timeband { display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.run-trace-timeband__label { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; }
.run-trace-timeband__track { display: flex; gap: 4px; align-items: center; min-width: 0; }
.run-trace-timeband__bar { display: inline-flex; min-width: 28px; max-width: 100%; height: 10px; align-items: center; overflow: hidden; white-space: nowrap; border-radius: 3px; padding: 0 4px; font-size: 8px; color: var(--text-on-accent); background: var(--text-muted); }
.run-trace-timeband__bar.is-error { background: var(--error); }
.run-trace-timeband__bar.is-running { background: var(--warning); }
</style>
