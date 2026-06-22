<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RelationType } from 'matrix-js-sdk'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixMessageInput from './MatrixMessageInput.vue'
import MatrixSpinner from './MatrixSpinner.vue'

const rightPanelStore = useMatrixRightPanelStore()
const roomStore = useMatrixRoomStore()
const threadStore = useMatrixThreadStore()
const { t } = useI18n()

const threadId = computed(() => rightPanelStore.rightPanelThreadRootId)
const loading = ref(true)

const thread = computed(() =>
  threadId.value ? roomStore.getThreadById(threadId.value) : null,
)

const threadRelation = computed(() => {
  if (!threadId.value) return undefined
  const lastReplyId =
    (thread.value?.replyToEvent?.getId?.() as string | undefined) ?? threadId.value
  return {
    rel_type: RelationType.Thread,
    event_id: threadId.value,
    is_falling_back: true,
    'm.in_reply_to': { event_id: lastReplyId },
  } as {
    rel_type: string
    event_id: string
    is_falling_back?: boolean
    'm.in_reply_to'?: { event_id: string }
  }
})

function back() {
  rightPanelStore.clearThreadView()
}
function closePanel() {
  rightPanelStore.closeRightPanel()
}

onMounted(async () => {
  // 若 thread 尚未创建,镜像 element-web setupThread:createThread
  if (threadId.value && roomStore.activeRoom && !thread.value) {
    try {
      const liveTimeline = roomStore.activeRoom.getLiveTimeline()
      const events = liveTimeline?.getEvents() ?? []
      const rootEvt = events.find((e: any) => e.getId() === threadId.value)
      if (rootEvt) {
        ;(roomStore.activeRoom as any).createThread?.(
          threadId.value,
          rootEvt,
          [],
          true,
        )
      }
    } catch {
      // ignore
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="matrix-thread-view">
    <div class="thread-view-header">
      <button class="thread-view-back" @click="back">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {{ t('matrixChat.backToThreads') }}
      </button>
      <h4 class="thread-view-title">{{ t('matrixChat.thread') }}</h4>
      <button class="thread-view-close" @click="closePanel">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="thread-view-body">
      <div v-if="loading" class="thread-view-loading"><MatrixSpinner /></div>
      <MatrixTimelinePanel
        v-else-if="thread?.timelineSet"
        :timeline-set="thread.timelineSet"
        rendering-type="thread"
        :thread-id="threadId ?? undefined"
        :show-read-receipts="true"
        :show-reactions="true"
      />
      <div v-else class="thread-view-loading">
        {{ t('matrixChat.loadingThreads') }}
      </div>
    </div>

    <MatrixMessageInput
      v-if="!loading && thread?.timelineSet"
      compact
      autofocus
      :thread-relation="threadRelation"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-thread-view {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-width: 0;
  border-left: 1px solid $border-color;
  background: $bg-card;
  overflow: hidden;
}

.thread-view-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.thread-view-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  color: $text-secondary;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }
}

.thread-view-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.thread-view-close {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
    color: $text-primary;
  }
}

.thread-view-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.thread-view-body :deep(.matrix-timeline-panel) {
  padding: 8px 12px;
}

.thread-view-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
