<script setup lang="ts">
// HERMES_CUSTOM[MatrixChat] BEGIN: footer now renders ThreadSummary card
// (对齐 element-web EventTileThreadInfo / ThreadSummaryView)
import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'
import MatrixReactionsRow from './MatrixReactionsRow.vue'
import MatrixReadReceiptGroup from './MatrixReadReceiptGroup.vue'
import MatrixThreadSummary from './MatrixThreadSummary.vue'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'

interface Props {
  eventId: string | null
  hasReactions: boolean
  showActionBar: boolean
  hasThread: boolean
  threadReplyCount: number
  threadLastReplySender: string
  threadLastReplyContent: string
  isContinuation: boolean
  /** 当前事件(用于查找 thread;threads-list/room 模式均用) */
  event: MatrixEvent
  renderingType?: 'room' | 'thread' | 'threads-list'
}
const props = withDefaults(defineProps<Props>(), { renderingType: 'room' })
const emit = defineEmits<{
  openThread: [rootEventId: string]
}>()

const threadStore = useMatrixThreadStore()
// 从 event 查 SDK Thread 对象(供 ThreadSummary 卡片渲染头像/预览/通知圆点)
const thread = computed(() => threadStore.getThreadForEvent(props.event))
const hasThreadCard = computed(
  () => Boolean(thread.value) && (thread.value?.length ?? 0) > 0,
)
</script>

<template>
  <div class="mx_EventTile_footer">
    <MatrixReactionsRow
      v-if="hasReactions || showActionBar"
      :event-id="eventId"
      :show-add-button="showActionBar"
    />

    <MatrixThreadSummary
      v-if="hasThreadCard"
      :thread="thread!"
      :mx-event="event"
      @open-thread="(id: string) => emit('openThread', id)"
    />

    <MatrixReadReceiptGroup
      v-if="eventId && !isContinuation && renderingType !== 'threads-list'"
      :event-id="eventId"
      :max="5"
      :size="16"
      class="mx_EventTile_msgOption"
    />
  </div>
</template>
