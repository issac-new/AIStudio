import { defineStore } from 'pinia'
import { ref } from 'vue'
import { MatrixEvent, MsgType, RelationType, EventType, EventStatus } from 'matrix-js-sdk'
// Reads room/client data through the god-store facade; re-pointed to the
// dedicated matrix-client / matrix-room stores in S1-5 once they exist.
import { useMatrixClientStore } from './matrix-client'
import { useMatrixRoomStore } from './matrix-room'

export type ComposerMode = 'normal' | 'reply' | 'edit' | 'thread'

export const useMatrixComposerStore = defineStore('matrix-composer', () => {
  const clientStore = useMatrixClientStore()
  const roomStore = useMatrixRoomStore()

  // ── Composer state ──
  const composerMode = ref<ComposerMode>('normal')
  const replyToEvent = ref<MatrixEvent | null>(null)
  const editingEvent = ref<MatrixEvent | null>(null)

  function setReplyTo(event: MatrixEvent) {
    composerMode.value = 'reply'
    replyToEvent.value = event
    editingEvent.value = null
  }
  function setEditing(event: MatrixEvent) {
    composerMode.value = 'edit'
    editingEvent.value = event
    replyToEvent.value = null
  }
  function clearComposerMode() {
    composerMode.value = 'normal'
    replyToEvent.value = null
    editingEvent.value = null
    // Don't clear threadRootEventId — managed by the thread store.
  }

  // ── Redact dialog ──
  const redactingEventId = ref<string | null>(null)
  const showRedactDialog = ref(false)
  function requestRedact(eventId: string) {
    redactingEventId.value = eventId
    showRedactDialog.value = true
  }
  function closeRedactDialog() {
    redactingEventId.value = null
    showRedactDialog.value = false
  }

  // ── Send / reply / edit / redact ──
  async function sendMessage(text: string) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      await clientStore.client.sendTextMessage(roomStore.activeRoomId, text)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send message'
      throw err
    }
  }

  /** Strip reply fallback (lines starting with `> `) from plain body */
  function stripPlainReply(body: string): string {
    const lines = body.split('\n')
    while (lines.length && lines[0].startsWith('> ')) lines.shift()
    if (lines[0] === '') lines.shift()
    return lines.join('\n')
  }

  /** Send a reply message with m.in_reply_to relation */
  async function sendReply(text: string, replyEvent: MatrixEvent) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const content: Record<string, unknown> = {
        body: text,
        msgtype: MsgType.Text,
        'm.relates_to': { 'm.in_reply_to': { event_id: replyEvent.getId() } },
      }
      if (replyEvent.threadRootId) {
        (content['m.relates_to'] as Record<string, unknown>)['is_falling_back'] = false
      }
      await clientStore.client.sendEvent(roomStore.activeRoomId, 'm.room.message' as any, content as any)
      clearComposerMode()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send reply'
      throw err
    }
  }

  /** Send an edit message with m.replace relation */
  async function sendEdit(text: string, originalEvent: MatrixEvent) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const content: Record<string, unknown> = {
        body: `* ${text}`,
        msgtype: MsgType.Text,
        'm.new_content': { body: text, msgtype: MsgType.Text },
        'm.relates_to': { rel_type: RelationType.Replace, event_id: originalEvent.getId() },
      }
      await clientStore.client.sendEvent(roomStore.activeRoomId, 'm.room.message' as any, content as any)
      clearComposerMode()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send edit'
      throw err
    }
  }

  /** Redact (delete) a message */
  async function redactEvent(eventId: string, roomId: string, reason?: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.redactEvent(roomId, eventId, undefined, reason ? { reason } : undefined)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to redact message'
      throw err
    }
  }

  // ── Message-interaction helpers ──
  /** Check if the current user can edit their own message */
  function canEditOwnMessage(event: MatrixEvent): boolean {
    if (!clientStore.client) return false
    if (event.getType() !== 'm.room.message') return false
    if (event.isRedacted()) return false
    if (event.isRelation(RelationType.Replace)) return false
    if (event.status !== null) return false // not yet fully sent
    if (event.getSender() !== clientStore.client.getUserId()) return false
    const originalContent = event.getOriginalContent()
    const msgtype = originalContent?.msgtype
    if (msgtype !== MsgType.Text && msgtype !== MsgType.Emote) return false
    return typeof originalContent?.body === 'string' && originalContent.body.length > 0
  }

  /** Check if a message is actionable (allows reply, react, etc.) */
  function isContentActionable(event: MatrixEvent): boolean {
    const status = event.status
    const isSent = !status || status === EventStatus.SENT
    if (!isSent || event.isRedacted()) return false
    if (event.getType() === 'm.room.message') {
      const content = event.getContent()
      if (content.msgtype && content.msgtype !== 'm.bad.encrypted' && 'body' in content) return true
    }
    return false
  }

  /** Get the m.in_reply_to event_id from a message, if present */
  function getReplyEventId(event: MatrixEvent): string | undefined {
    if (event.isRedacted()) return undefined
    return event.replyEventId ?? undefined
  }

  /** Find the referenced reply event in the room timeline */
  function getReplyEvent(event: MatrixEvent): MatrixEvent | null {
    const replyId = getReplyEventId(event)
    if (!replyId || !roomStore.activeRoom) return null
    const found = roomStore.activeRoom.timeline.find((evt: MatrixEvent) => evt.getId() === replyId)
    return found ?? null
  }

  /** Check if a message has been edited (has a replacing event) */
  function isEdited(event: MatrixEvent): boolean {
    return Boolean(event.replacingEvent()) || event.getRelation()?.rel_type === RelationType.Replace
  }

  // ── Reactions ──
  /**
   * Get all reactions for a given event, grouped by reaction key.
   * Uses room.relations.getChildEventsForEvent() from the SDK.
   */
  function getEventReactions(eventId: string | null): { key: string; count: number; senders: string[]; myReactionEventId: string | null }[] {
    if (!roomStore.activeRoom || !eventId) return []
    try {
      const relations = roomStore.activeRoom.relations.getChildEventsForEvent(
        eventId, RelationType.Annotation, EventType.Reaction,
      )
      if (!relations) return []
      const sorted = relations.getSortedAnnotationsByKey()
      if (!sorted) return []
      const myUserId = clientStore.client?.getUserId()
      return sorted.map(([key, eventSet]) => {
        const events = Array.from(eventSet)
        const senders = events.map((evt: MatrixEvent) => evt.getSender() ?? '')
        let myReactionEventId: string | null = null
        if (myUserId) {
          const myEvt = events.find((evt: MatrixEvent) => evt.getSender() === myUserId)
          myReactionEventId = myEvt?.getId() ?? null
        }
        return { key, count: events.length, senders, myReactionEventId }
      })
    } catch {
      return []
    }
  }

  /** Send a reaction to a target event */
  async function sendReaction(targetEventId: string | null, emoji: string): Promise<void> {
    if (!clientStore.client || !roomStore.activeRoomId || !targetEventId) return
    try {
      await (clientStore.client as any).sendEvent(roomStore.activeRoomId, EventType.Reaction, {
        'm.relates_to': { rel_type: RelationType.Annotation, event_id: targetEventId, key: emoji },
      })
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send reaction'
      throw err
    }
  }

  /** Remove a reaction by redacting its event */
  async function removeReaction(reactionEventId: string): Promise<void> {
    if (!clientStore.client || !roomStore.activeRoomId || !reactionEventId) return
    try {
      await clientStore.client.redactEvent(roomStore.activeRoomId, reactionEventId)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to remove reaction'
      throw err
    }
  }

  return {
    composerMode, replyToEvent, editingEvent,
    redactingEventId, showRedactDialog,
    setReplyTo, setEditing, clearComposerMode,
    requestRedact, closeRedactDialog,
    sendMessage, stripPlainReply, sendReply, sendEdit, redactEvent,
    canEditOwnMessage, isContentActionable, getReplyEventId, getReplyEvent, isEdited,
    getEventReactions, sendReaction, removeReaction,
  }
})
