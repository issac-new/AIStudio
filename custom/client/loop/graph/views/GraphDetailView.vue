<!-- overlay/custom/client/loop/graph/views/GraphDetailView.vue -->
<!-- GraphDetailView — 单图详情（图可视化 + 事件轨迹 + 检查点） -->
<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/custom/loop/graph/store/graph'
import GraphRenderer from '@/custom/loop/graph/components/GraphRenderer.vue'
import type { GraphEvent } from '../../../server/loop/graph/types'

const store = useGraphStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const activeTab = ref<'graph' | 'events' | 'checkpoints'>('graph')

onMounted(() => {
  const id = route.params.id as string
  store.fetchInstance(id)
})

const instance = computed(() => store.currentInstance)
const events = computed(() => store.currentEvents)

// 从事件中提取节点和边（用于图渲染）
const nodes = computed(() => {
  const nodeSet = new Set<string>()
  for (const e of events.value) {
    if ((e as any).nodeId) nodeSet.add((e as any).nodeId)
  }
  return [...nodeSet].map(id => ({ id, label: id, type: 'function' }))
})

const edges = computed(() => {
  const edgeSet = new Set<string>()
  const result: Array<{ source: string; target: string }> = []
  let prevNode: string | null = null
  for (const e of events.value) {
    if (e.type === 'graph.node-complete' && prevNode) {
      const key = `${prevNode}->${(e as any).nodeId}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        result.push({ source: prevNode, target: (e as any).nodeId })
      }
    }
    if (e.type === 'graph.node-complete') prevNode = (e as any).nodeId
  }
  return result
})

const checkpoints = computed(() =>
  events.value.filter(e => e.type === 'graph.checkpoint')
)

function onNodeSelect(nodeId: string) {
  // 选中节点 → 高亮相关事件
  activeTab.value = 'events'
}
</script>

<template>
  <div class="graph-detail" v-if="instance">
    <div class="graph-detail__header">
      <button @click="router.push({ name: 'hermes.graph' })">{{ t('graph.detail.back') }}</button>
      <span class="graph-detail__name">{{ instance.graphDefId }}</span>
      <span :class="`graph-detail__status--${instance.status}`">{{ instance.status }}</span>
    </div>
    <div class="graph-detail__meta">
      <span>step: {{ instance.currentStep }}</span>
      <span>cost: ${{ instance.totalCost.toFixed(2) }}</span>
      <span>thread: {{ instance.threadId }}</span>
    </div>
    <div class="graph-detail__tabs">
      <button v-for="tab in ['graph','events','checkpoints']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">{{ t(`graph.tabs.${tab}`) }}</button>
    </div>
    <div class="graph-detail__tab-content" v-if="activeTab === 'graph'">
      <GraphRenderer :nodes="nodes" :edges="edges" :events="events" @select="onNodeSelect" />
    </div>
    <div class="graph-detail__tab-content" v-else-if="activeTab === 'events'">
      <div v-for="event in events.slice(-50)" :key="(event as any).ts" class="graph-detail__event">
        <span class="graph-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="graph-detail__event-type">{{ event.type }}</span>
      </div>
    </div>
    <div class="graph-detail__tab-content" v-else-if="activeTab === 'checkpoints'">
      <div v-for="cp in checkpoints" :key="(cp as any).checkpointId" class="graph-detail__checkpoint">
        <span>step {{ (cp as any).step }}</span>
        <span>{{ (cp as any).ts?.slice(11, 19) }}</span>
        <button>{{ t('graph.fork') }}</button>
      </div>
    </div>
  </div>
  <div class="graph-detail graph-detail--loading" v-else-if="store.loading">
    <div class="graph-detail__spinner" />
  </div>
</template>
