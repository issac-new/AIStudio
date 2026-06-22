<script setup lang="ts">
import { computed } from 'vue'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import MatrixThreadMessagePreview from './MatrixThreadMessagePreview.vue'

interface Props {
  thread: any
  mxEvent: import('matrix-js-sdk').MatrixEvent
  narrow?: boolean
}
const props = withDefaults(defineProps<Props>(), { narrow: false })
const emit = defineEmits<{ openThread: [rootEventId: string] }>()

const threadStore = useMatrixThreadStore()

const replyCount = computed(() => props.thread?.length ?? 0)
const replyCountLabel = computed(() => {
  if (replyCount.value === 0) return ''
  // 不依赖 i18n(Task 10 再补 key),先用字面量,narrow 时只显示数字
  return props.narrow ? String(replyCount.value) : `${replyCount.value}`
})
const lastReply = computed<import('matrix-js-sdk').MatrixEvent | null>(
  () => props.thread?.replyToEvent ?? null,
)
// 通知指示器读 SDK 的 threadsAggregateNotificationType(非响应式)。
// 依赖 roomStore.threadTimelineVersion,确保 SDK thread 状态变更后重算。
const roomStore = useMatrixRoomStore()
const notificationIndicator = computed(() => {
  void roomStore.threadTimelineVersion
  return threadStore.getThreadNotificationIndicator()
})

function handleClick() {
  const id = props.mxEvent.getId()
  if (id) emit('openThread', id)
}
</script>

<template>
  <button
    type="button"
    class="mx_ThreadSummary"
    :class="{
      narrow,
      'is-highlight': notificationIndicator === 'highlight',
      'is-unread': notificationIndicator === 'unread',
    }"
    @click="handleClick"
  >
    <span class="mx_ThreadSummary_threadIcon">
      <!-- ThreadsSolidIcon (内联 SVG,沿用 overlay 现有风格) -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
      <span
        v-if="notificationIndicator !== 'none'"
        class="mx_ThreadSummary_indicator"
        :class="notificationIndicator"
      />
    </span>
    <span class="mx_ThreadSummary_repliesAmount">{{ replyCountLabel }}</span>
    <MatrixThreadMessagePreview :last-reply="lastReply" :show-display-name="!narrow" />
    <span class="mx_ThreadSummary_chevron" aria-hidden="true">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  </button>
</template>

<style scoped lang="scss">
.mx_ThreadSummary {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: 8px;
  min-width: 267px;
  max-width: 600px;
  width: fit-content;
  height: 40px;
  padding: 0 16px 0 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-secondary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  appearance: none;
  box-sizing: border-box;
  overflow: hidden;
  transition: border-color 0.1s ease-in-out;

  &:hover,
  &:focus {
    border-color: var(--accent-primary);
  }
  &:hover .mx_ThreadSummary_chevron,
  &:focus .mx_ThreadSummary_chevron {
    opacity: 1;
    transform: translateX(0);
  }
  &.narrow {
    min-width: 0;
    max-width: 100%;
    width: auto;
  }
}

.mx_ThreadSummary_threadIcon {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  color: var(--text-secondary);
}
.mx_ThreadSummary_indicator {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--bg-card);
  &.highlight {
    background: #ff4b4b;
  }
  &.unread {
    background: #ffc107;
  }
}

.mx_ThreadSummary_repliesAmount {
  font-weight: 600;
  color: var(--text-secondary);
  padding: 0 12px 0 8px;
  white-space: nowrap;
}

.mx_ThreadSummary_chevron {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
  background: linear-gradient(270deg, var(--bg-card) 50%, transparent 100%);
  color: var(--text-secondary);
  opacity: 0;
  transform: translateX(60px);
  transition:
    opacity 0.1s ease-in-out,
    transform 0.1s ease-in-out;
  pointer-events: none;
}
</style>
