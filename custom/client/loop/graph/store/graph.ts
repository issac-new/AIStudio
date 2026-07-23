// overlay/custom/client/loop/graph/store/graph.ts
// Graph Pinia store — 真实数据驱动（复用 loop REST API + graph REST API）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { request } from '@/api/client'
import type { GraphInstance, GraphEvent, GraphDef } from '../../server/loop/graph/types'

export const useGraphStore = defineStore('graph', () => {
  const instances = ref<GraphInstance[]>([])
  const currentInstance = ref<GraphInstance | null>(null)
  const currentDef = ref<GraphDef | null>(null)
  const currentEvents = ref<GraphEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runningInstances = computed(() => instances.value.filter(i => i.status === 'running'))
  const awaitingInstances = computed(() => instances.value.filter(i => i.status === 'awaiting-input'))
  const completedInstances = computed(() => instances.value.filter(i => i.status === 'completed'))
  const failedInstances = computed(() => instances.value.filter(i => i.status === 'failed'))

  async function fetchInstances(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await request<{ graphs: GraphInstance[] }>('/api/graph/graphs')
      instances.value = res.graphs
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchInstance(id: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await request<{ graph: GraphInstance; def: GraphDef }>(`/api/graph/graphs/${id}`)
      currentInstance.value = res.graph
      currentDef.value = res.def
      // 同时获取事件
      await fetchEvents(id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchEvents(id: string): Promise<void> {
    try {
      const res = await request<{ events: GraphEvent[] }>(`/api/graph/graphs/${id}/events`)
      currentEvents.value = res.events
    } catch (e: any) {
      // 事件获取失败不阻塞主流程
      console.warn('[graph] failed to fetch events:', e.message)
    }
  }

  async function forkGraph(id: string, name?: string): Promise<GraphInstance | null> {
    try {
      const res = await request<{ graph: GraphInstance }>(`/api/graph/graphs/${id}/fork`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      instances.value.push(res.graph)
      return res.graph
    } catch (e: any) {
      error.value = e.message
      return null
    }
  }

  function handleEvent(event: GraphEvent): void {
    currentEvents.value.push(event)
    if (event.type === 'graph.completed' && currentInstance.value) {
      currentInstance.value.status = 'completed'
    }
    if (event.type === 'graph.failed' && currentInstance.value) {
      currentInstance.value.status = 'failed'
    }
  }

  return {
    instances, currentInstance, currentDef, currentEvents, loading, error,
    runningInstances, awaitingInstances, completedInstances, failedInstances,
    fetchInstances, fetchInstance, fetchEvents, forkGraph, handleEvent,
  }
})
