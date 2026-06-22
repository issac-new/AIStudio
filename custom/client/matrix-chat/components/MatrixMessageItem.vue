<script setup lang="ts">
import { computed, ref, toValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { EventStatus } from 'matrix-js-sdk'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useEventTileClassState } from '@/custom/matrix-chat/composables/useEventTileClassState'
import { useEventTileData } from '@/custom/matrix-chat/composables/useEventTileData'
import MatrixMessageTimestamp from './MatrixMessageTimestamp.vue'
import MatrixSenderProfile from './MatrixSenderProfile.vue'
import MatrixReplyChain from './MatrixReplyChain.vue'
import MatrixMessageContextMenu from './MatrixMessageContextMenu.vue'
import MatrixMessageBody from './MatrixMessageBody.vue'
import MatrixMessageActionBar from './MatrixMessageActionBar.vue'
import MatrixEventTileFooter from './MatrixEventTileFooter.vue'

interface Props {
  event: MatrixEvent
  showSender?: boolean
  isContinuation?: boolean
  isLastInSection?: boolean
  isLast?: boolean
  layout?: 'group' | 'bubble' | 'irc'
  renderingType?: 'room' | 'thread' | 'threads-list'
  threadId?: string
  showReactions?: boolean
  alwaysShowTimestamps?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSender: true,
  isContinuation: false,
  isLastInSection: false,
  isLast: false,
  layout: 'group',
  renderingType: 'room',
  threadId: undefined,
  showReactions: true,
  alwaysShowTimestamps: false,
})

const { t } = useI18n()
const roomStore = useMatrixRoomStore()
const composerStore = useMatrixComposerStore()
const threadStore = useMatrixThreadStore()
const clientStore = useMatrixClientStore()
const rightPanelStore = useMatrixRightPanelStore()

// ─── EventTile class state (extracted composable) ────────
const tileState = useEventTileClassState({
  event: props.event,
  isContinuation: props.isContinuation,
  isLastInSection: props.isLastInSection,
  isLast: props.isLast,
  layout: props.layout,
  userId: clientStore.userId,
  selectedEventId: roomStore.selectedEventId,
})

// ─── EventTile data (extracted composable) ───────────────
const tileData = useEventTileData({ event: props.event })

const isOwnMessage = computed(() => toValue(tileState.isOwnMessage))
const sendStatus = computed(() => toValue(tileState.sendStatus))
const eventId = computed(() => toValue(tileState.eventId))

const sender = computed(() => toValue(tileData.sender))
const senderAvatarUrl = computed(() => roomStore.getUserAvatarUrl(sender.value, 32))
const senderInitial = computed(() => {
  const room = roomStore.activeRoom
  if (!room) return (sender.value || '?').charAt(0).toUpperCase()
  const member = room.getMember(sender.value)
  return (member?.name || sender.value || '?').charAt(0).toUpperCase()
})

// ─── Content rendering (delegated to useEventTileData) ───
const formattedContent = computed(() => toValue(tileData.formattedContent))
const msgType = computed(() => toValue(tileData.msgType))
const isBigEmoji = computed(() => toValue(tileData.isBigEmoji))
const displayContent = computed(() => toValue(tileData.displayContent))

// ─── Send status ──────────────────────────────────────────
// (now derived from tileState.sendStatus above)

// ─── Action bar ──────────────────────────────────────────
const showActionBar = ref(false)
const canReply = computed(() => composerStore.isContentActionable(props.event))
const canEdit = computed(() => composerStore.canEditOwnMessage(props.event))
const canDelete = computed(() => {
  if (!clientStore.client) return false
  const isSent = !props.event.status || props.event.status === EventStatus.SENT
  if (!isSent) return false
  return true
})

function onMouseEnter() { showActionBar.value = true }
function onMouseLeave() { showActionBar.value = false }

function handleReply() {
  composerStore.setReplyTo(props.event)
}
function handleEdit() {
  composerStore.setEditing(props.event)
}
function handleDelete() {
  composerStore.requestRedact(props.event.getId() ?? '')
}

// ─── Edited marker ────────────────────────────────────────
const isEdited = computed(() => composerStore.isEdited(props.event))

// ─── Thread info ──────────────────────────────────────────
const hasThread = computed(() => {
  if (props.event.threadRootId) return false
  const thread = threadStore.getThreadForEvent(props.event)
  return Boolean(thread && (thread.length ?? 0) > 0)
})

const threadReplyCount = computed(() => threadStore.getThreadReplyCount(props.event))
const threadLastReply = computed(() => threadStore.getThreadLastReply(props.event))
const threadLastReplySender = computed(() => threadLastReply.value?.getSender() ?? '')
const threadLastReplyContent = computed(() => {
  if (!threadLastReply.value) return ''
  const c = threadLastReply.value.getContent()
  return composerStore.stripPlainReply(c?.body ?? '').slice(0, 50)
})

function openThread() {
  threadStore.setThreadView(props.event)
}

// ─── Reactions ────────────────────────────────────────────
// eventId now comes from tileState.eventId (defined above)
const hasReactions = computed(() => {
  if (!eventId.value) return false
  return composerStore.getEventReactions(eventId.value).length > 0
})

// threads-list 模式下隐藏 reactions/action bar(对齐上游 showReactions=false)
const effectiveHasReactions = computed(() =>
  props.renderingType === 'threads-list' ? false : hasReactions.value,
)
const effectiveShowActionBar = computed(() =>
  props.renderingType === 'threads-list' ? false : showActionBar.value,
)

function handleCopyLink() {
  navigator.clipboard.writeText(tileData.permalink.value).catch(() => {})
}

function handleCopyText() {
  navigator.clipboard.writeText(displayContent.value).catch(() => {})
}

function handleForward() {
  // TODO: implement forward dialog
}

// ─── Context menu ─────────────────────────────────────────
const contextMenuOpen = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

function onContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('a') || target.closest('img')) return
  e.preventDefault()
  e.stopPropagation()
  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  contextMenuOpen.value = true
}

function closeContextMenu() {
  contextMenuOpen.value = false
}

</script>

<template>
  <div
    class="mx_EventTile"
    :class="tileState.classList"
    :data-layout="layout"
    :data-self="isOwnMessage"
    :data-event-id="tileState.eventId"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @contextmenu="onContextMenu"
  >
    <!-- Group Layout: Avatar positioned absolutely in left gutter -->
    <div
      v-if="layout === 'group' && !isContinuation && !isOwnMessage"
      class="mx_EventTile_avatar"
    >
      <img
        v-if="senderAvatarUrl"
        :src="senderAvatarUrl"
        alt=""
        class="avatar-img"
        @click="rightPanelStore.openMemberInfo(sender)"
      />
      <div
        v-else
        class="avatar-placeholder"
        @click="rightPanelStore.openMemberInfo(sender)"
      >
        {{ senderInitial }}
      </div>
    </div>

    <!-- Group Layout: Sender name (DisambiguatedProfile) -->
    <div
      v-if="layout === 'group' && showSender && !isOwnMessage"
      class="mx_EventTile_sender"
    >
      <MatrixSenderProfile :user-id="sender" />
    </div>

    <!-- Message line / body -->
    <div class="mx_EventTile_line" :class="{ 'mx_EventTile_line--continuation': isContinuation }">
      <!-- Reply chain -->
      <MatrixReplyChain
        v-if="composerStore.getReplyEventId(props.event)"
        :event="event"
        @click="roomStore.selectRoom(roomStore.activeRoomId)"
      />

      <!-- Message content -->
      <MatrixMessageBody
        :display-content="displayContent"
        :formatted-content="formattedContent"
        :msg-type="msgType"
        :is-big-emoji="isBigEmoji"
        :is-edited="isEdited"
        :sender="sender"
      />

      <!-- Group Layout: Timestamp (absolute positioned on left) -->
      <MatrixMessageTimestamp
        v-if="layout === 'group'"
        :event-date="props.event.getDate()"
        :always-show="roomStore.alwaysShowTimestamps"
        :visible="showActionBar"
      />

      <!-- Bubble Layout: Timestamp inline -->
      <div v-if="layout === 'bubble'" class="message-timestamp-bubble" :title="props.event.getDate()?.toLocaleString()">
        {{ props.event.getDate()?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }}
      </div>
    </div>

      <!-- Footer: Reactions + Thread info + Read receipts -->
      <MatrixEventTileFooter
        :event-id="eventId"
        :event="props.event"
        :has-reactions="effectiveHasReactions"
        :show-action-bar="effectiveShowActionBar"
        :has-thread="hasThread"
        :thread-reply-count="threadReplyCount"
        :thread-last-reply-sender="threadLastReplySender"
        :thread-last-reply-content="threadLastReplyContent"
        :is-continuation="props.isContinuation"
        :rendering-type="renderingType"
        @open-thread="openThread"
      />

      <!-- Action bar (hover/focus) -->
      <MatrixMessageActionBar
        :can-reply="canReply"
        :can-edit="canEdit"
        :can-delete="canDelete"
        :visible="showActionBar"
        @reply="handleReply"
        @edit="handleEdit"
        @delete="handleDelete"
        @react="composerStore.sendReaction(eventId, '👍')"
        @copy-link="handleCopyLink"
      />

    <!-- Send status -->
    <div v-if="sendStatus === 'sending'" class="message-status">{{ t('matrixChat.messageSending') }}</div>
    <div v-if="sendStatus === 'failed'" class="message-status message-status--failed">{{ t('matrixChat.messageSendFailed') }}</div>

    <!-- Context menu -->
    <MatrixMessageContextMenu
      v-if="contextMenuOpen"
      :event="event"
      :position="contextMenuPos"
      @close="closeContextMenu"
      @reply="handleReply(); closeContextMenu()"
      @edit="handleEdit(); closeContextMenu()"
      @delete="handleDelete(); closeContextMenu()"
      @copy-text="handleCopyText(); closeContextMenu()"
      @copy-link="handleCopyLink(); closeContextMenu()"
      @react="composerStore.sendReaction(eventId, '👍'); closeContextMenu()"
      @forward="handleForward(); closeContextMenu()"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// ─── Base styles ─────────────────────────────────────────
$left-gutter: 64px;

.mx_EventTile {
  position: relative;
  max-width: 100%;
  flex-shrink: 0;
  padding-top: 18px;

  // ─── Group Layout ───────────────────────────────────────
  &_groupLayout {
    .mx_EventTile_avatar {
      position: absolute;
      top: 14px;
      left: 8px;
      z-index: 9;
      cursor: pointer;
      user-select: none;
    }

    .mx_EventTile_sender {
      line-height: 20px;
      margin-left: $left-gutter;
      max-width: calc(100% - $left-gutter);
    }

    .mx_EventTile_line {
      position: relative;
      padding-top: 1px;
      padding-bottom: 3px;
      padding-left: $left-gutter;
      line-height: 22px;
      border-radius: 8px;
      transition: background-color $transition-fast;

      &--continuation {
        clear: both;
      }
    }

    .mx_EventTile_content {
      margin-right: 34px;
    }

    .mx_EventTile_footer {
      margin: var(--cpd-space-1x, 4px) $left-gutter;
    }

    // Hover background
    &:hover .mx_EventTile_line {
      background-color: var(--mx-event-selected-bg, rgba(var(--accent-primary-rgb), 0.06));
    }

    // Selected state
    &--selected .mx_EventTile_line {
      background-color: var(--mx-event-selected-bg, rgba(var(--accent-primary-rgb), 0.06));
      box-shadow: inset calc(50px + 4px) 0 0 -50px var(--accent-primary);
    }

    // Continuation: no padding-top
    &_continuation {
      padding-top: 0;
    }

    // Compact layout
    .matrix-chat-panel--compact & {
      padding-top: 4px;

      .mx_EventTile_line {
        padding-top: 0;
        padding-bottom: 0;
      }

      .mx_EventTile_avatar {
        top: 2px;
      }
    }
  }

  // ─── Bubble Layout ──────────────────────────────────────
  &_bubbleLayout {
    margin-top: calc(var(--mx-gutter-size, 16px) / 2);
    margin-left: var(--bubble-margin-inline-start, 48px);
    max-width: unset;
    padding-top: 0;

    .mx_EventTile_line {
      position: relative;
      border-radius: 8px;
      padding: 8px 12px;
      max-width: var(--mx-bubble-max-width, 600px);
    }

    .mx_EventTile_content {
      max-width: var(--mx-bubble-max-width, 600px);
    }

    &--own .mx_EventTile_line {
      margin-left: auto;
      background: var(--msg-user-bg);
    }

    &:not(&--own) .mx_EventTile_line {
      background: var(--msg-assistant-bg);
    }

    &_continuation {
      margin-top: 2px;
    }

    &_lastInSection {
      margin-bottom: calc(var(--mx-gutter-size, 16px) / 2);
    }

    .message-timestamp-bubble {
      font-size: 11px;
      color: $text-muted;
      margin-top: 4px;
      text-align: right;
    }
  }

  // ─── Failed state ───────────────────────────────────────
  &--failed {
    opacity: 0.6;
  }
}

// ─── Avatar ──────────────────────────────────────────────
.avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

// ─── Send status ─────────────────────────────────────────
.message-status {
  font-size: 11px;
  color: $text-muted;
  text-align: right;
  margin-left: $left-gutter;

  &--failed {
    color: var(--error);
  }
}

// ─── Mobile ──────────────────────────────────────────────
@media (max-width: $breakpoint-mobile) {
  .mx_EventTile_groupLayout {
    .mx_EventTile_line {
      margin-right: 0;
    }

    .mx_EventTile_content {
      margin-right: 0;
    }
  }

  .mx_MessageActionBar {
    position: static;
    opacity: 1;
    background: transparent;
    box-shadow: none;
    padding: 0;
    margin-top: 4px;
  }
}
</style>
