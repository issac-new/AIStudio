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
</script>
<template>
  <teleport to="body">
    <div v-if="store.runTraceOpen" class="run-trace-modal" data-run-trace-modal>
      <header class="run-trace-modal__top">
        <span class="run-trace-modal__dot"></span>
        <div><b>Run Observatory</b><small>{{ store.runTraceSessionId }}</small></div>
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
.run-trace-modal__main { min-height: 0; display: grid; grid-template-columns: 1fr 320px; }
</style>
