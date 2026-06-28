<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '../store/cockpit'
import { useRunTrace } from '../composables/useRunTrace'
import RunTraceGraph from './RunTraceGraph.vue'
import RunTraceTimeBand from './RunTraceTimeBand.vue'
import RunTraceInspector from './RunTraceInspector.vue'
import RunTraceSkillDrilldown from './RunTraceSkillDrilldown.vue'

const store = useCockpitStore()
const sessionId = computed(() => store.runTraceSessionId)
const trace = useRunTrace(sessionId)
const focusedId = ref<string | null>(null)
const drilldownSkillId = ref<string | null>(null)
const focusedNode = computed(() => trace.nodes.value.find(n => n.id === (focusedId.value || trace.focusedNodeId.value)) ?? null)
const drilldownSkill = computed(() => trace.nodes.value.find(n => n.id === drilldownSkillId.value && n.kind === 'skill') ?? null)

function focusNode(id: string) {
  focusedId.value = id
  const node = trace.nodes.value.find(n => n.id === id)
  if (node?.kind === 'skill') drilldownSkillId.value = id
}

/** Export trace as JSON dossier for offline analysis / audit */
function exportDossier() {
  const sid = sessionId.value
  if (!sid) return

  const dossier = {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    session_id: sid,
    run_id: store.runTraceRunId,
    task_id: store.runTraceTaskId,
    evidence_tier: trace.l2Available.value ? 'L2' : 'L1',
    nodes: trace.nodes.value,
    edges: trace.edges.value,
    focused_node_id: focusedNode.value?.id || null,
    active_skill: drilldownSkill.value ? {
      id: drilldownSkill.value.id,
      label: drilldownSkill.value.label,
      children: drilldownSkill.value.children,
    } : null,
  }

  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trace-dossier-${sid}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
<template>
  <teleport to="body">
    <div
      v-if="store.runTraceOpen"
      class="run-trace-modal"
      data-run-trace-modal
      role="dialog"
      aria-modal="true"
      aria-label="Run Observatory"
      tabindex="-1"
      @keydown.esc="store.closeRunTrace"
    >
      <header class="run-trace-modal__top">
        <span class="run-trace-modal__dot"></span>
        <div><b>Run Observatory</b><small>{{ store.runTraceSessionId }}</small></div>
        <span v-if="trace.l2Available.value" class="run-trace-modal__l2badge" title="Layer 2 data available">L2</span>
        <button type="button" data-action="export" class="run-trace-modal__export" @click="exportDossier" title="导出证据档案">📥</button>
        <button type="button" data-action="close" @click="store.closeRunTrace">×</button>
      </header>
      <RunTraceTimeBand :nodes="trace.nodes.value" />
      <main class="run-trace-modal__main">
        <RunTraceSkillDrilldown v-if="drilldownSkill" :skill="drilldownSkill" @back="drilldownSkillId = null" />
        <RunTraceGraph v-else :nodes="trace.nodes.value" :edges="trace.edges.value" :focused-node-id="focusedNode?.id || null" @focus-node="focusNode" />
        <RunTraceInspector :node="focusedNode" />
      </main>
    </div>
  </teleport>
</template>
<style scoped lang="scss">
.run-trace-modal { position: fixed; inset: 0; z-index: 3000; display: grid; grid-template-rows: 52px auto 1fr; background: var(--bg-primary); color: var(--text-primary); }
.run-trace-modal__top { display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-sidebar); }
.run-trace-modal__top b { display: block; font-size: 13px; }
.run-trace-modal__top small { display: block; font-size: 11px; color: var(--text-muted); }
.run-trace-modal__top button { margin-left: auto; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
.run-trace-modal__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
.run-trace-modal__l2badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: var(--accent-info); color: var(--text-on-accent); font-weight: 600; }
.run-trace-modal__export { margin-left: 8px !important; font-size: 14px; }
.run-trace-modal__main { min-height: 0; display: grid; grid-template-columns: 1fr 320px; }
</style>
