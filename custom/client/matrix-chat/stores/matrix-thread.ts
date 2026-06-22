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
import { useMatrixRightPanelStore } from './matrix-right-panel'

export type ThreadNotificationIndicator = 'none' | 'unread' | 'highlight'

export const useMatrixThreadStore = defineStore('matrix-thread', () => {
  const clientStore = useMatrixClientStore()
  const roomStore = useMatrixRoomStore()
  const composer = useMatrixComposerStore()
  const rightPanelStore = useMatrixRightPanelStore()

  // threadMessages/threadsLoading retained for onThreadUpdate live-refresh
  // signaling (thread detail timeline reactivity). View-state (threadRootEventId)
  // was migrated to the right-panel store in Task 1; the back-compat computed
  // is removed now that all call sites use right-panel phase directly.
  const threadMessages = ref<MatrixEvent[]>([])
  const threadsLoading = ref(false)

  function refreshThreadMessages() {
    const rootId = rightPanelStore.rightPanelThreadRootId
    if (!rootId || !roomStore.activeRoom) {
      threadMessages.value = []
      return
    }
    const thread = roomStore.activeRoom.getThread(rootId)
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
    rightPanelStore.openThreadView(eventId)
    composer.composerMode = 'thread'
    composer.replyToEvent = null
    composer.editingEvent = null
    refreshThreadMessages()
  }

  /**
   * Reply-in-thread trigger (mirrors element-web
   * EventTileActionBarViewModel.onReplyInThreadClick + MessageContextMenu
   * ReplyInThreadButton.onClick):
   *
   *   - if the event already belongs to a thread AND is not the thread root →
   *     open that existing thread (rooted at the thread's root event),
   *   - otherwise → start a new thread rooted at this event.
   *
   * Both branches land on the ThreadView right-panel card. The view's composer
   * is auto-focused on mount (MatrixThreadView focuses its textarea), matching
   * element-web's post-ShowThread `FocusSendMessageComposer` dispatch.
   */
  function openThreadFromEvent(event: MatrixEvent) {
    const thread = getThreadForEvent(event)
    const isThreadRoot = event.isThreadRoot ?? false
    if (thread?.rootEvent && !isThreadRoot) {
      // Open the existing thread, rooted at its root event.
      const rootEvent = thread.rootEvent
      if (rootEvent) {
        setThreadView(rootEvent)
        return
      }
    }
    // No existing thread (or this IS the root): start a new one here.
    setThreadView(event)
  }

  function clearThreadView() {
    rightPanelStore.clearThreadView()
    threadMessages.value = []
    composer.composerMode = 'normal'
    composer.replyToEvent = null
    composer.editingEvent = null
  }

  function openThreadPanel() {
    // Back-compat: 委托 right-panel store 进入 ThreadPanel phase。
    // (('__list__' 语义已被 ThreadPanel phase 取代)
    rightPanelStore.openThreadPanel()
    threadMessages.value = []
  }

  function toggleThreadPanel() {
    if (
      rightPanelStore.rightPanelPhase === 'ThreadPanel' ||
      rightPanelStore.rightPanelPhase === 'ThreadView'
    ) {
      rightPanelStore.closeRightPanel()
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

  /**
   * 话题通知指示器(镜像 element-web determineUnreadState + notificationLevelToIndicator)。
   * 读 room.threadsAggregateNotificationType。
   */
  function getThreadNotificationIndicator(): ThreadNotificationIndicator {
    if (!roomStore.activeRoom) return 'none'
    try {
      const t = roomStore.activeRoom.threadsAggregateNotificationType
      if (t === NotificationCountType.Highlight) return 'highlight'
      if (t === NotificationCountType.Total) return 'unread'
      return 'none'
    } catch {
      return 'none'
    }
  }

  /** Check if current room has thread notifications (unread/highlight threads) */
  const hasThreadNotifications = computed(
    () => getThreadNotificationIndicator() !== 'none',
  )

  // Register on event bus
  matrixEventBus.onSelectRoom.value = () => {
    rightPanelStore.closeRightPanel()
    threadMessages.value = []
  }
  matrixEventBus.onThreadUpdate.value = refreshThreadMessages

  return {
    threadMessages,
    threadsLoading,
    refreshThreadMessages,
    setThreadView,
    openThreadFromEvent,
    clearThreadView,
    openThreadPanel,
    toggleThreadPanel,
    sendThreadMessage,
    initRoomThreads,
    getThreadForEvent,
    getThreadReplyCount,
    getThreadLastReply,
    getRoomThreads,
    getThreadNotificationIndicator,
    hasThreadNotifications,
  }
})
