<!-- overlay/custom/client/matrix-chat/components/MatrixTopUnreadBar.vue -->
<!-- 跳到未读条（element-web TopUnreadMessagesBar 吸收，2026-10-01 消息面批 #2）。
     语义：时间线滚动离开底部且房间存在未读计数时悬浮在时间线顶部——
     ①「跳到未读」滚动定位到 read marker（没有 marker 则跳最新可定位事件）；
     ②「标记已读」就地发 read receipt 清未读（复用 TimelinePanel 同款 SDK 调用）；
     ③「回到底部」。只在主实例（renderingType='room'）由 MatrixRoomView 挂载。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMsgSurfaceText } from '@/custom/ia2/i18n-msg-surface'

const emit = defineEmits<{ (e: 'jump-bottom'): void }>()

const roomStore = useMatrixRoomStore()
const clientStore = useMatrixClientStore()
const tx = useMsgSurfaceText()

/** 房间未读计数（SDK 权威：total 通知数；本地清零后即时归零） */
const unreadCount = computed(() => {
  const room = roomStore.activeRoom as any
  if (!room) return 0
  try {
    const n = room.getUnreadNotificationCount?.('total') ?? 0
    return typeof n === 'number' ? n : 0
  } catch {
    return 0
  }
})

const marking = ref(false)

/** 跳到 read marker：优先 marker 事件锚点，缺省跳时间线内最早未读可见事件 */
function jumpToUnread() {
  const markerId = roomStore.readMarkerEventId
  if (markerId) {
    roomStore.selectEvent(markerId)
    return
  }
  // 无 marker（从未读过的新房）：跳到底部即最新未读
  emit('jump-bottom')
}

/** 就地标已读：与 TimelinePanel.sendReadReceipt 同款（SDK live 尾事件 + unthreaded） */
async function markAllRead() {
  const client = clientStore.client
  const room = roomStore.activeRoom as any
  if (!client || !room || marking.value) return
  marking.value = true
  try {
    const liveEvents = room.getLiveTimeline?.().getEvents?.() ?? []
    const last = liveEvents[liveEvents.length - 1]
    if (last?.getId?.()) {
      await client.sendReadReceipt(last, undefined, true)
    }
  } catch {
    // 失败也走本地清零（与 TimelinePanel 容错口径一致：避免假未读卡住）
  } finally {
    try {
      room.setUnreadNotificationCount?.('total', 0)
      room.setUnreadNotificationCount?.('highlight', 0)
      roomStore.refreshRoomList()
      roomStore.bumpRoomVersion()
    } catch { /* 忽略 */ }
    marking.value = false
  }
}
</script>

<template>
  <div v-if="unreadCount > 0" class="mtub" data-testid="matrix-top-unread-bar">
    <span class="mtub__count">{{ unreadCount > 99 ? '99+' : unreadCount }} {{ tx.newMessages }}</span>
    <button type="button" class="mtub__btn mtub__btn--pri" data-testid="matrix-top-unread-jump" @click="jumpToUnread">
      ⬆ {{ tx.jumpToUnread }}
    </button>
    <button type="button" class="mtub__btn" :disabled="marking" data-testid="matrix-top-unread-mark" @click="markAllRead">
      ✓ {{ tx.markRead }}
    </button>
    <button type="button" class="mtub__btn" @click="emit('jump-bottom')">⬇ {{ tx.jumpBottom }}</button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mtub {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 15px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  font-size: 12px;
}

.mtub__count {
  color: var(--error);
  font-weight: 600;
  white-space: nowrap;
}

.mtub__btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;

  &:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.mtub__btn--pri {
  color: var(--accent-primary, #3b82f6);
  border-color: var(--accent-primary, #3b82f6);
}
</style>
