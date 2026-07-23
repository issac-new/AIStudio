<!-- overlay/custom/client/loop/graph/views/GraphSpineView.vue -->
<!-- GraphSpineView — 图实例总览（真实数据驱动，升级自 Loop Spine） -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGraphStore } from '@/custom/loop/graph/store/graph'
import { request } from '@/api/client'

const store = useGraphStore()
const { t } = useI18n()
const router = useRouter()
const showForkDialog = ref(false)
const forkSourceId = ref('')
const forkName = ref('')

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

async function onTick(id: string) {
  // 映射为 loop tick
  const loopId = id.replace(/^graph-/, '')
  try {
    await request(`/api/loop/loops/${loopId}/tick`, { method: 'POST', body: JSON.stringify({}) })
    await store.fetchInstances()
  } catch (e: any) {
    store.error = e.message
  }
}

async function onPause(id: string) {
  const loopId = id.replace(/^graph-/, '')
  try {
    await request(`/api/loop/loops/${loopId}/pause`, { method: 'POST', body: JSON.stringify({}) })
    await store.fetchInstances()
  } catch (e: any) {
    store.error = e.message
  }
}

async function onDelete(id: string) {
  const loopId = id.replace(/^graph-/, '')
  try {
    await request(`/api/loop/loops/${loopId}`, { method: 'DELETE' })
    await store.fetchInstances()
  } catch (e: any) {
    store.error = e.message
  }
}

function openForkDialog(id: string) {
  forkSourceId.value = id
  forkName.value = ''
  showForkDialog.value = true
}

async function confirmFork() {
  if (!forkSourceId.value) return
  const result = await store.forkGraph(forkSourceId.value, forkName.value || undefined)
  if (result) {
    showForkDialog.value = false
    forkSourceId.value = ''
    forkName.value = ''
  }
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
    </div>
    <div class="graph-spine__main">
      <h2 class="graph-spine__title">{{ t('graph.title') }}</h2>
      <div v-if="store.loading" class="graph-spine__spinner" />
      <div v-else-if="store.error" class="graph-spine__error">{{ store.error }}</div>
      <div v-else class="graph-spine__table">
        <div class="graph-spine__header">
          <span class="graph-spine__col--name">{{ t('graph.table.name') }}</span>
          <span>{{ t('graph.table.status') }}</span>
          <span>{{ t('graph.table.step') }}</span>
          <span>{{ t('graph.table.cost') }}</span>
          <span>{{ t('graph.table.actions') }}</span>
        </div>
        <div v-for="inst in filteredInstances" :key="inst.id"
          class="graph-spine__row" @click="onSelect(inst.id)">
          <span class="graph-spine__col--name">{{ inst.state?.loopName ?? inst.graphDefId }}</span>
          <span :class="`graph-spine__status--${inst.status}`">{{ inst.status }}</span>
          <span>step {{ inst.currentStep }}</span>
          <span>${{ inst.totalCost.toFixed(2) }}</span>
          <span class="graph-spine__actions">
            <button @click.stop="onTick(inst.id)" :title="t('graph.actions.run')">▶</button>
            <button @click.stop="onPause(inst.id)" :title="t('graph.actions.pause')">⏸</button>
            <button @click.stop="openForkDialog(inst.id)" :title="t('graph.actions.fork')">🍴</button>
            <button @click.stop="onDelete(inst.id)" :title="t('graph.actions.delete')">🗑</button>
          </span>
        </div>
        <div v-if="filteredInstances.length === 0" class="graph-spine__empty">
          {{ t('graph.empty') }}
        </div>
      </div>
    </div>

    <!-- Fork dialog -->
    <div v-if="showForkDialog" class="graph-spine__fork-dialog">
      <div class="graph-spine__fork-overlay" @click="showForkDialog = false"></div>
      <div class="graph-spine__fork-content">
        <h3>{{ t('graphFork.title') }}</h3>
        <label>{{ t('graphFork.name') }} <input v-model="forkName" /></label>
        <div class="graph-spine__fork-actions">
          <button @click="confirmFork">{{ t('graphFork.confirm') }}</button>
          <button @click="showForkDialog = false">{{ t('graphFork.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
