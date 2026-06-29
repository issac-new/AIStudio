import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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

  /** Upload a file and send as m.file / m.image message (Element Web parity) */
  async function sendFile(file: File) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const isImage = file.type.startsWith('image/')
      let info: Record<string, unknown> = { size: file.size, mimetype: file.type }
      let msgtype = 'm.file'

      if (isImage) {
        msgtype = 'm.image'
        try {
          const imgInfo = await getImageInfo(file)
          if (imgInfo) {
            info = { ...info, w: imgInfo.w, h: imgInfo.h }
          }
        } catch {
          // Fall back to m.file on image load failure (Element Web behavior)
          msgtype = 'm.file'
        }
      }

      const contentUri = await clientStore.client.uploadContent(file, {
        name: file.name,
        type: file.type,
        includeFilename: true,
      })

      await clientStore.client.sendEvent(
        roomStore.activeRoomId,
        'm.room.message' as any,
        {
          body: file.name,
          msgtype,
          url: contentUri,
          info,
        } as any,
      )
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send file'
      throw err
    }
  }

  /** Get natural image dimensions (Element Web parity: infoForImageFile) */
  function getImageInfo(file: File): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ w: img.naturalWidth, h: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    })
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
   * Mirrors element-web ReactionsRow + ReactionPicker.getReactions():
   * each group carries `myReactionEventId` so the picker can highlight the
   * current user's existing reaction and toggle (redact) on re-select.
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

  /**
   * The reaction keys the current user has already sent for an event.
   * Mirrors element-web ReactionPicker `selectedEmojis` (getAnnotationsBySender).
   * Used by the picker to highlight existing reactions before the user toggles.
   */
  function getMyReactionKeys(eventId: string | null): Set<string> {
    if (!eventId) return new Set()
    return new Set(
      getEventReactions(eventId)
        .filter((r) => r.myReactionEventId)
        .map((r) => r.key),
    )
  }

  /**
   * Toggle a reaction the way element-web ReactionPicker.onChoose does:
   * if the current user has already sent this emoji → redact it,
   * otherwise → send a new m.reaction annotation.
   * Returns 'sent' | 'redacted' | null (null = no-op / error swallowed).
   */
  async function toggleReaction(targetEventId: string | null, emoji: string): Promise<'sent' | 'redacted' | null> {
    if (!clientStore.client || !roomStore.activeRoomId || !targetEventId) return null
    const existing = getEventReactions(targetEventId).find((r) => r.key === emoji)
    if (existing?.myReactionEventId) {
      try {
        await clientStore.client.redactEvent(roomStore.activeRoomId, existing.myReactionEventId)
        return 'redacted'
      } catch (err: any) {
        clientStore.error = err?.message || 'Failed to remove reaction'
        throw err
      }
    }
    try {
      await (clientStore.client as any).sendEvent(roomStore.activeRoomId, EventType.Reaction, {
        'm.relates_to': { rel_type: RelationType.Annotation, event_id: targetEventId, key: emoji },
      })
      return 'sent'
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send reaction'
      throw err
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

  // ── Power-level gating (mirror element-web RoomContext canReact / canSendMessages) ──
  /**
   * Whether the current user may send m.room.message in the active room.
   * Mirrors element-web `RoomContext.canSendMessages` (maySendMessage + membership).
   */
  const canSendMessages = computed(() => {
    const room = roomStore.activeRoom
    const client = clientStore.client
    if (!room || !client) return false
    try {
      const me = client.getUserId()
      if (!me) return false
      return room.currentState.maySendMessage(me)
    } catch {
      return false
    }
  })

  /**
   * Whether the current user may send m.reaction in the active room.
   * Mirrors element-web `RoomContext.canReact` (default events_power_levels for m.reaction).
   */
  const canReact = computed(() => {
    const room = roomStore.activeRoom
    const client = clientStore.client
    if (!room || !client) return false
    try {
      const me = client.getUserId()
      if (!me) return false
      // element-web falls back to maySendEvent('m.reaction', ...) then to the
      // configured reactions power level; the SDK exposes maySendEvent for this.
      return room.currentState.maySendEvent(EventType.Reaction, me)
    } catch {
      return false
    }
  })

  /**
   * Whether the current user may redact their own events in the active room.
   * Mirrors element-web `RoomContext.canSelfRedact` (power to redact own events).
   */
  const canSelfRedact = computed(() => {
    const room = roomStore.activeRoom
    const client = clientStore.client
    if (!room || !client) return false
    try {
      const me = client.getUserId()
      if (!me) return false
      return room.currentState.maySendRedactionForEvent(
        // maySendRedactionForEvent needs an event; use a synthetic check via
        // the user's own redact power level. Fall back to maySendEvent('m.room.redaction').
        { getSender: () => me } as any,
        me,
      )
    } catch {
      try {
        const me = client.getUserId()
        return me ? room.currentState.maySendEvent(EventType.RoomRedaction, me) : false
      } catch {
        return false
      }
    }
  })

  // ── Reply-in-thread visibility guards (mirror element-web
  //    EventTileActionBarViewModel.canShowReplyInThreadAction + isThreadReplyAllowed) ──

  /**
   * Whether the "Reply in thread" action should be *shown* at all for an event.
   * Mirrors element-web `canShowReplyInThreadAction`:
   *   - only outside a Thread timeline (the thread view has its own composer)
   *   - not for m.key.verification.request / m.beacon_info messages
   * Callers additionally require content-actionable + canSendMessages.
   */
  function canShowReplyInThreadAction(event: MatrixEvent, timelineRenderingType: 'room' | 'thread' | 'threads-list' = 'room'): boolean {
    if (timelineRenderingType === 'thread') return false
    const type = event.getType()
    const content = event.getContent()
    // Mirror element-web isAllowedMessageType exclusions
    if (content?.msgtype === MsgType.KeyVerificationRequest) return false
    if (type === 'm.beacon_info' || type === 'org.matrix.msc3672.beacon_info') return false
    return true
  }

  /**
   * Whether starting/continuing a thread from this event is *allowed* (not disabled).
   * Mirrors element-web `isThreadReplyAllowed`:
   *   disallowed when the event already has a non-thread relation (e.g. it is
   *   itself a reply or an edit), which would conflict with a thread root.
   */
  function isThreadReplyAllowed(event: MatrixEvent): boolean {
    const relationType = event.getRelation()?.rel_type
    return !(!!relationType && relationType !== RelationType.Thread)
  }

  return {
    composerMode, replyToEvent, editingEvent,
    redactingEventId, showRedactDialog,
    setReplyTo, setEditing, clearComposerMode,
    requestRedact, closeRedactDialog,
    sendMessage, stripPlainReply, sendReply, sendEdit, redactEvent,
    canEditOwnMessage, isContentActionable, getReplyEventId, getReplyEvent, isEdited,
    getEventReactions, getMyReactionKeys, toggleReaction, sendReaction, removeReaction,
    sendFile,
    // Power-level gating (mirror element-web RoomContext)
    canSendMessages, canReact, canSelfRedact,
    // Reply-in-thread visibility guards
    canShowReplyInThreadAction, isThreadReplyAllowed,
  }
})
