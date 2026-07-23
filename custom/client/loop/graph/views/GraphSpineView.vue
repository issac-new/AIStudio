<!-- overlay/custom/client/loop/graph/views/GraphSpineView.vue -->
<!-- GraphSpineView — 图实例总览（升级自 Loop Spine） -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGraphStore } from '@/custom/loop/graph/store/graph'

const store = useGraphStore()
const { t } = useI18n()
const router = useRouter()

onMounted(() => { store.fetchInstances() })

const statusGroups = computed(() => [
  { label: t('graph.sidebar.all'), count: store.instances.length, status: undefined, icon: '📊' },
  { label: t('graph.sidebar.running'), count: store.runningInstances.length, status: 'running' as const, icon: '●' },
  { label: t('graph.sidebar.awaiting'), count: store.awaitingInstances.length, status: 'awaiting-input' as const, icon: '⚠' },
  { label: t('graph.sidebar.completed'), count: store.completedInstances.length, status: 'completed' as const, icon: '✓' },
  { label: t('graph.sidebar.failed'), count: store.failedInstances.length, status: 'failed' as const, icon: '✗' },
])

const activeFilter = ref<string | undefined>(undefined)
const filteredInstances = computed(() => {
  if (!activeFilter.value) return store.instances
  return store.instances.filter(i => i.status === activeFilter.value)
})

function selectGroup(status?: string) {
  activeFilter.value = status
}

function onSelect(id: string) {
  router.push({ name: 'hermes.graphDetail', params: { id } })
}
</script>

<template>
  <div class="graph-spine">
    <div class="graph-spine__sidebar">
      <div class="graph-spine__group"
        v-for="g in statusGroups" :key="g.label"
        :class="{ 'graph-spine__group--active': activeFilter === g.status }"
        @click="selectGroup(g.status)">
        <span>{{ g.icon }}</span>
        <span>{{ g.label }}</span>
        <span class="graph-spine__count">{{ g.count }}</span>
      </div>
      <button class="graph-spine__new">{{ t('graph.newGraph') }}</button>
    </div>
    <div class="graph-spine__main">
      <h2 class="graph-spine__title">{{ t('graph.title') }}</h2>
      <div v-if="store.loading" class="graph-spine__spinner" />
      <div v-else-if="store.error" class="graph-spine__error">{{ store.error }}</div>
      <div v-else class="graph-spine__table">
        <div class="graph-spine__header">
          <span>{{ t('graph.table.name') }}</span>
          <span>{{ t('graph.table.status') }}</span>
          <span>{{ t('graph.table.step') }}</span>
          <span>{{ t('graph.table.cost') }}</span>
          <span>{{ t('graph.table.actions') }}</span>
        </div>
        <div v-for="inst in filteredInstances" :key="inst.id"
          class="graph-spine__row" @click="onSelect(inst.id)">
          <span>{{ inst.graphDefId }}</span>
          <span :class="`graph-spine__status--${inst.status}`">{{ inst.status }}</span>
          <span>{{ inst.currentStep }}</span>
          <span>${{ inst.totalCost.toFixed(2) }}</span>
          <span>[▶] [⏸] [🗑]</span>
        </div>
        <div v-if="filteredInstances.length === 0" class="graph-spine__empty">
          {{ t('graph.empty') }}
        </div>
      </div>
    </div>
  </div>
</template>
