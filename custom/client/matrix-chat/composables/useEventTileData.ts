import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'
import type { ComputedRef } from 'vue'

export interface EventTileDataOptions {
  event: MatrixEvent
}

export interface EventTileData {
  /** Raw body text */
  content: ComputedRef<string>
  /** HTML formatted body (if present) */
  formattedContent: ComputedRef<string | null>
  /** msgtype (m.text, m.emote, etc.) */
  msgType: ComputedRef<string>
  /** Whether this is an emote (/me) message */
  isEmote: ComputedRef<boolean>
  /** Whether body is 1-6 emoji only (big emoji display) */
  isBigEmoji: ComputedRef<boolean>
  /** Display content with reply prefix stripped */
  displayContent: ComputedRef<string>
  /** Permalink URL for this event */
  permalink: ComputedRef<string>
  /** Room ID */
  roomId: ComputedRef<string | null>
  /** Event ID */
  eventId: ComputedRef<string | null>
  /** Sender user ID */
  sender: ComputedRef<string>
  /** Event date */
  date: ComputedRef<Date | null>
}

/**
 * Extract content and display metadata from a MatrixEvent.
 * Pure data transformation — no store dependencies.
 */
export function useEventTileData(options: EventTileDataOptions): EventTileData {
  const { event } = options

  const content = computed(() => {
    const c = event.getContent()
    return c?.body ?? ''
  })

  const formattedContent = computed(() => {
    const c = event.getContent()
    if (c?.format === 'org.matrix.custom.html' && c?.formatted_body) {
      return c.formatted_body
    }
    return null
  })

  const msgType = computed(() => {
    const c = event.getContent()
    return c?.msgtype ?? 'm.text'
  })

  const isEmote = computed(() => msgType.value === 'm.emote')

  const isBigEmoji = computed(() => {
    if (msgType.value !== 'm.text') return false
    const body = content.value.trim()
    const emojiRegex = /^(\p{Emoji}\uFE0F?\s?){1,6}$/u
    return emojiRegex.test(body)
  })

  const displayContent = computed(() => {
    const c = event.getContent()
    const body = c?.body ?? ''
    // Strip plain reply fallback prefix
    return body.replace(/^\u003e .*\n?/gm, '').trim()
  })

  const permalink = computed(() => {
    const roomId = event.getRoomId()
    const evtId = event.getId()
    if (!roomId || !evtId) return '#'
    return `https://matrix.to/#/${roomId}/${evtId}`
  })

  const roomId = computed(() => event.getRoomId() ?? null)
  const eventId = computed(() => event.getId() ?? null)
  const sender = computed(() => event.getSender() ?? '')
  const date = computed(() => event.getDate() ?? null)

  return {
    content,
    formattedContent,
    msgType,
    isEmote,
    isBigEmoji,
    displayContent,
    permalink,
    roomId,
    eventId,
    sender,
    date,
  }
}
