// overlay/custom/client/loop/store/loop.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoopInstance, LoopEvent, TaskContract } from '../types'
import * as rest from '../api/loop-rest'
import { connectLoop, disconnectLoop, subscribeToLoop } from '../api/loop-socket'
import type { Socket } from 'socket.io-client'

export const useLoopStore = defineStore('loop', () => {
  const loops = ref<LoopInstance[]>([])
  const currentLoop = ref<LoopInstance | null>(null)
  const currentContracts = ref<TaskContract[]>([])
  const currentEvents = ref<LoopEvent[]>([])
  // I9: patterns ref 已移除 — wizard 直接用 PATTERN_TEMPLATES(types.ts),
  // 服务端 /api/loop/patterns 端点也已移除。
  const loading = ref(false)
  const error = ref<string | null>(null)
  let socket: Socket | null = null

  const activeLoops = computed(() => loops.value.filter(l => l.status === 'running'))
  const awaitingReviewLoops = computed(() => loops.value.filter(l => l.status === 'awaiting-review'))
  const blockedLoops = computed(() => loops.value.filter(l => l.status === 'blocked'))
  const archivedLoops = computed(() => loops.value.filter(l => l.status === 'completed' || l.status === 'failed'))

  async function fetchLoops(): Promise<void> {
    loading.value = true
    try {
      loops.value = await rest.loopRest.listLoops()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLoop(id: string): Promise<void> {
    loading.value = true
    try {
      currentLoop.value = await rest.loopRest.getLoop(id)
      currentContracts.value = await rest.loopRest.getContracts(id)
      currentEvents.value = await rest.loopRest.getEvents(id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createLoop(loop: Partial<LoopInstance>): Promise<void> {
    const created = await rest.loopRest.createLoop(loop)
    loops.value.push(created)
    currentLoop.value = created
  }

  async function tickLoop(id: string): Promise<void> {
    await rest.loopRest.tickLoop(id)
    await fetchLoops()
  }

  async function pauseLoop(id: string): Promise<void> {
    await rest.loopRest.pauseLoop(id)
    await fetchLoops()
  }

  async function deleteLoop(id: string): Promise<void> {
    await rest.loopRest.deleteLoop(id)
    loops.value = loops.value.filter(l => l.id !== id)
  }

  function connectSocket(loopId: string): void {
    if (!socket) {
      socket = connectLoop()
    }
    subscribeToLoop(socket, loopId, (event) => {
      currentEvents.value.push(event)
      // Update loop status based on events
      if (event.type === 'loop.stage-transition' && currentLoop.value) {
        currentLoop.value.stage = (event as any).to
      }
      if (event.type === 'loop.tick-complete' && currentLoop.value) {
        currentLoop.value.stats = (event as any).stats
      }
    })
  }

  function disconnectSocket(): void {
    disconnectLoop()
    socket = null
  }

  return {
    loops, currentLoop, currentContracts, currentEvents,
    loading, error,
    activeLoops, awaitingReviewLoops, blockedLoops, archivedLoops,
    fetchLoops, fetchLoop, createLoop, tickLoop, pauseLoop, deleteLoop,
    connectSocket, disconnectSocket,
  }
})

