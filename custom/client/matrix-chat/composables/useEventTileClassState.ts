import { computed } from 'vue'
import { EventStatus } from 'matrix-js-sdk'
import type { MatrixEvent } from 'matrix-js-sdk'
import type { ComputedRef } from 'vue'

export interface EventTileClassStateOptions {
  event: MatrixEvent
  isContinuation?: boolean
  isLastInSection?: boolean
  isLast?: boolean
  layout?: 'group' | 'bubble' | 'irc'
  userId: string | null
  selectedEventId: string | null
}

export interface EventTileClassState {
  classList: ComputedRef<Record<string, boolean>>
  isOwnMessage: ComputedRef<boolean>
  sendStatus: ComputedRef<string>
  eventId: ComputedRef<string>
}

export function useEventTileClassState(options: EventTileClassStateOptions): EventTileClassState {
  const eventId = computed(() => options.event.getId() ?? '')

  const isOwnMessage = computed(() => options.userId === options.event.getSender())

  const sendStatus = computed(() => {
    const status = options.event.status
    if (status === EventStatus.SENDING) return 'sending'
    if (status === EventStatus.NOT_SENT) return 'failed'
    if (status === EventStatus.QUEUED) return 'sending'
    return ''
  })

  const classList = computed<Record<string, boolean>>(() => {
    const layout = options.layout ?? 'group'
    return {
      'mx_EventTile--own': isOwnMessage.value,
      'mx_EventTile--failed': sendStatus.value === 'failed',
      'mx_EventTile_continuation': options.isContinuation ?? false,
      'mx_EventTile_lastInSection': options.isLastInSection ?? false,
      'mx_EventTile--last': options.isLast ?? false,
      'mx_EventTile--selected': options.selectedEventId === eventId.value,
      [`mx_EventTile_${layout}Layout`]: true,
    }
  })

  return {
    classList,
    isOwnMessage,
    sendStatus,
    eventId,
  }
}
