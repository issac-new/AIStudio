import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  MatrixEvent,
  MsgType,
  RelationType,
  NotificationCountType,
} from 'matrix-js-sdk'
import { matrixEventBus } from './matrix-events'
import { useMatrixClientStore } from './matrix-client'
import { useMatrixRoomStore } from './matrix-room'
import { useMatrixComposerStore } from './matrix-composer'

export const useMatrixThreadStore = defineStore('matrix-thread', () => {
  const clientStore = useMatrixClientStore()
  const roomStore = useMatrixRoomStore()
  const composer = useMatrixComposerStore()

  const threadRootEventId = ref<string | null>(null)
  const threadMessages = ref<MatrixEvent[]>([])
  const threadsLoading = ref(false)

  function refreshThreadMessages() {
    if (!threadRootEventId.value || !roomStore.activeRoom) {
      threadMessages.value = []
      return
    }
    const thread = roomStore.activeRoom.getThread(threadRootEventId.value)
    if (!thread || !thread.timelineSet) {
      threadMessages.value = []
      return
    }
    // Get thread replies from the live timeline
    const liveTimeline = thread.timelineSet.getLiveTimeline()
    const events = liveTimeline?.getEvents() ?? []
    threadMessages.value = [...events.filter(
      (evt: MatrixEvent) => evt.getType() === 'm.room.message' && !evt.isRedacted(),
    )]
  }

  function setThreadView(event: MatrixEvent) {
    const eventId = event.getId()
    if (!eventId) return
    threadRootEventId.value = eventId
    // Composer state lives on the composer store; write directly (the god-store
    // facade exposes composerMode/replyToEvent/editingEvent as read-only computeds).
    composer.composerMode = 'thread'
    composer.replyToEvent = null
    composer.editingEvent = null
    refreshThreadMessages()
  }

  function clearThreadView() {
    threadRootEventId.value = null
    threadMessages.value = []
    composer.composerMode = 'normal'
    composer.replyToEvent = null
    composer.editingEvent = null
  }

  function openThreadPanel() {
    // Use '__list__' as a special marker to show the thread list (no specific
    // thread selected). The panel reads threadRootEventId to decide its mode.
    threadRootEventId.value = '__list__'
    threadMessages.value = []
  }

  function toggleThreadPanel() {
    if (threadRootEventId.value) {
      clearThreadView()
    } else {
      openThreadPanel()
    }
  }

  /** Send a message in a thread with m.thread relation */
  async function sendThreadMessage(text: string, threadRootId: string, lastReplyId?: string) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const content: Record<string, unknown> = {
        body: text,
        msgtype: MsgType.Text,
        'm.relates_to': {
          rel_type: RelationType.Thread,
          event_id: threadRootId,
          is_falling_back: true,
          'm.in_reply_to': {
            event_id: lastReplyId ?? threadRootId,
          },
        },
      }
      await clientStore.client.sendEvent(roomStore.activeRoomId, 'm.room.message' as any, content as any)
      // Don't clearComposerMode — stay in thread mode for continuous conversation
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send thread message'
      throw err
    }
  }

  /** Initialize threads from server (mirrors element-web ThreadPanel onMount) */
  async function initRoomThreads(): Promise<void> {
    if (!roomStore.activeRoom) return
    threadsLoading.value = true
    try {
      await roomStore.activeRoom.createThreadsTimelineSets()
      await roomStore.activeRoom.fetchRoomThreads()
    } catch {
      // Server may not support threads — ignore
    }
    threadsLoading.value = false
  }

  // ── Thread helpers (moved from god-store) ──────────────

  /** Get the Thread object for an event */
  function getThreadForEvent(event: MatrixEvent): any | null {
    if (!roomStore.activeRoom) return null
    const eventId = event.getId()
    if (!eventId) return null
    return roomStore.activeRoom.getThread(eventId) ?? null
  }

  /** Get reply count for a thread rooted at this event */
  function getThreadReplyCount(event: MatrixEvent): number {
    const thread = getThreadForEvent(event)
    if (!thread) return 0
    return thread.length ?? 0
  }

  /** Get the last reply event in a thread */
  function getThreadLastReply(event: MatrixEvent): MatrixEvent | null {
    const thread = getThreadForEvent(event)
    if (!thread) return null
    return thread.replyToEvent ?? null
  }

  /** Get all threads in the current room */
  function getRoomThreads(): any[] {
    if (!roomStore.activeRoom) return []
    try {
      const threadList = roomStore.activeRoom.getThreads()
      if (!threadList) return []
      return [...threadList]
    } catch {
      return []
    }
  }

  /** Check if current room has thread notifications (unread threads) */
  const hasThreadNotifications = computed(() => {
    if (!roomStore.activeRoom) return false
    try {
      const notificationType = roomStore.activeRoom.threadsAggregateNotificationType
      if (notificationType === NotificationCountType.Highlight || notificationType === NotificationCountType.Total) {
        return true
      }
      return getRoomThreads().length > 0
    } catch {
      return false
    }
  })

  // Register on event bus
  matrixEventBus.onSelectRoom.value = clearThreadView
  matrixEventBus.onThreadUpdate.value = refreshThreadMessages

  return {
    threadRootEventId,
    threadMessages,
    threadsLoading,
    refreshThreadMessages,
    setThreadView,
    clearThreadView,
    openThreadPanel,
    toggleThreadPanel,
    sendThreadMessage,
    initRoomThreads,
    getThreadForEvent,
    getThreadReplyCount,
    getThreadLastReply,
    getRoomThreads,
    hasThreadNotifications,
  }
})
