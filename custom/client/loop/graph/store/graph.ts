// overlay/custom/client/loop/graph/store/graph.ts
// Graph Pinia store — 管理图实例列表 + 当前图状态

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GraphEvent, GraphInstance, GraphDef } from '../../../server/loop/graph/types'

export const useGraphStore = defineStore('graph', () => {
  const instances = ref<GraphInstance[]>([])
  const currentInstance = ref<GraphInstance | null>(null)
  const currentEvents = ref<GraphEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runningInstances = computed(() => instances.value.filter(i => i.status === 'running'))
  const awaitingInstances = computed(() => instances.value.filter(i => i.status === 'awaiting-input'))
  const completedInstances = computed(() => instances.value.filter(i => i.status === 'completed'))
  const failedInstances = computed(() => instances.value.filter(i => i.status === 'failed'))

  async function fetchInstances(): Promise<void> {
    loading.value = true
    try {
      // TODO: fetch from server API
      instances.value = []
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchInstance(id: string): Promise<void> {
    loading.value = true
    try {
      // TODO: fetch from server API
      currentInstance.value = null
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  function handleEvent(event: GraphEvent): void {
    currentEvents.value.push(event)
    if (event.type === 'graph.completed' && currentInstance.value) {
      currentInstance.value.status = 'completed'
    }
  }

  return {
    instances, currentInstance, currentEvents, loading, error,
    runningInstances, awaitingInstances, completedInstances, failedInstances,
    fetchInstances, fetchInstance, handleEvent,
  }
})
