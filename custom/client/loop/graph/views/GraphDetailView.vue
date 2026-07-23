<!-- overlay/custom/client/loop/graph/views/GraphDetailView.vue -->
<!-- GraphDetailView — 单图详情（图可视化 + 事件轨迹 + 检查点 + fork） -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/custom/loop/graph/store/graph'
import GraphRenderer from '@/custom/loop/graph/components/GraphRenderer.vue'
import type { GraphEvent } from '../../server/loop/graph/types'

const store = useGraphStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const activeTab = ref<'graph' | 'events' | 'checkpoints' | 'state'>('graph')
const granularity = ref(2)

onMounted(() => {
  const id = route.params.id as string
  store.fetchInstance(id)
})

const instance = computed(() => store.currentInstance)
const def = computed(() => store.currentDef)
const events = computed(() => store.currentEvents)

// 从 GraphDef + events 构建节点数据（含状态）
const nodes = computed(() => {
  if (!def.value) return []
  const result: Array<{ id: string; label: string; type: string; status: string }> = []
  for (const [id, nodeDef] of def.value.nodes) {
    result.push({
      id,
      label: nodeDef.label,
      type: nodeDef.type,
      status: 'idle',
    })
  }
  return result
})

// 从 GraphDef + events 构建边数据（含类型和激活状态）
const edges = computed(() => {
  if (!def.value) return []
  return def.value.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: (edge.label === 'repair' ? 'repair' : edge.label === 'next tick' ? 'loop' : 'forward') as 'forward' | 'repair' | 'loop',
    active: false,
  }))
})

const checkpoints = computed(() =>
  events.value.filter(e => e.type === 'graph.checkpoint')
)

const interrupts = computed(() =>
  events.value.filter(e => e.type === 'graph.interrupt')
)

// 当前执行位置
const currentStepNodes = computed(() => {
  const lastStepStart = [...events.value].reverse().find(e => e.type === 'graph.step-start')
  return lastStepStart ? (lastStepStart as any).nodes as string[] : []
})

function onNodeSelect(nodeId: string) {
  activeTab.value = 'events'
}

async function onFork() {
  if (!instance.value) return
  const result = await store.forkGraph(instance.value.id)
  if (result) {
    router.push({ name: 'hermes.graphDetail', params: { id: result.id } })
  }
}
</script>

<template>
  <div class="graph-detail" v-if="instance && def">
    <div class="graph-detail__header">
      <button @click="router.push({ name: 'hermes.graph' })">{{ t('graph.detail.back') }}</button>
      <span class="graph-detail__name">{{ instance.state?.loopName ?? instance.graphDefId }}</span>
      <span :class="`graph-detail__status--${instance.status}`">{{ instance.status }}</span>
      <button @click="onFork">{{ t('graph.fork') }}</button>
    </div>
    <div class="graph-detail__meta">
      <span>{{ t('graph.detail.step') }}: {{ instance.currentStep }}</span>
      <span>{{ t('graph.detail.cost') }}: ${{ instance.totalCost.toFixed(2) }}</span>
      <span>{{ t('graph.detail.thread') }}: {{ instance.threadId }}</span>
      <span v-if="instance.state?.pattern">{{ t('graph.detail.pattern') }}: {{ instance.state.pattern }}</span>
      <span v-if="instance.state?.autonomyLevel">{{ t('graph.detail.level') }}: {{ instance.state.autonomyLevel }}</span>
    </div>
    <div class="graph-detail__tabs">
      <button v-for="tab in ['graph','events','checkpoints','state']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">{{ t(`graph.tabs.${tab}`) }}</button>
    </div>

    <!-- Graph visualization tab -->
    <div class="graph-detail__tab-content" v-if="activeTab === 'graph'">
      <GraphRenderer :nodes="nodes" :edges="edges" :events="events" @select="onNodeSelect" />
      <div v-if="currentStepNodes.length > 0" class="graph-detail__current-step">
        {{ t('graph.detail.currentStep') }}: {{ currentStepNodes.join(', ') }}
      </div>
    </div>

    <!-- Events tab -->
    <div class="graph-detail__tab-content" v-else-if="activeTab === 'events'">
      <input type="range" min="1" max="5" v-model="granularity" />
      <div v-for="event in events.slice(-20 * granularity)" :key="(event as any).ts + (event as any).type + (event as any).nodeId" class="graph-detail__event">
        <span class="graph-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="graph-detail__event-type">{{ event.type }}</span>
        <span v-if="(event as any).nodeId" class="graph-detail__event-node">{{ (event as any).nodeId }}</span>
      </div>
    </div>

    <!-- Checkpoints tab -->
    <div class="graph-detail__tab-content" v-else-if="activeTab === 'checkpoints'">
      <div v-for="cp in checkpoints" :key="(cp as any).checkpointId" class="graph-detail__checkpoint">
        <span>step {{ (cp as any).step }}</span>
        <span>{{ (cp as any).ts?.slice(11, 19) }}</span>
        <button @click="onFork">{{ t('graph.fork') }}</button>
      </div>
      <div v-if="checkpoints.length === 0" class="graph-detail__empty">
        {{ t('graph.checkpoints.empty') }}
      </div>
    </div>

    <!-- State tab -->
    <div class="graph-detail__tab-content" v-else-if="activeTab === 'state'">
      <div v-for="(value, key) in instance.state" :key="key" class="graph-detail__state-row">
        <span class="graph-detail__state-key">{{ key }}</span>
        <span class="graph-detail__state-value">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</span>
      </div>
    </div>

    <!-- Interrupts panel -->
    <div v-if="interrupts.length > 0" class="graph-detail__interrupts">
      <h4>{{ t('graph.interrupts.title') }}</h4>
      <div v-for="int in interrupts" :key="(int as any).interruptId" class="graph-detail__interrupt">
        <span>{{ (int as any).nodeId }}</span>
        <span>{{ JSON.stringify((int as any).value).slice(0, 100) }}</span>
      </div>
    </div>
  </div>
  <div class="graph-detail graph-detail--loading" v-else-if="store.loading">
    <div class="graph-detail__spinner" />
  </div>
  <div class="graph-detail graph-detail--error" v-else-if="store.error">
    <div class="graph-detail__error">{{ store.error }}</div>
  </div>
</template>
