<script setup lang="ts">
// HERMES_CUSTOM[MatrixChat] BEGIN: i18n available for future footer labels
// import { useI18n } from 'vue-i18n'
// const { t } = useI18n()
// HERMES_CUSTOM[MatrixChat] END
import MatrixReactionsRow from './MatrixReactionsRow.vue'
import MatrixReadReceiptGroup from './MatrixReadReceiptGroup.vue'
import MatrixThreadInfo from './MatrixThreadInfo.vue'

interface Props {
  eventId: string | null
  hasReactions: boolean
  showActionBar: boolean
  hasThread: boolean
  threadReplyCount: number
  threadLastReplySender: string
  threadLastReplyContent: string
  isContinuation: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  openThread: []
}>()
</script>

<template>
  <div class="mx_EventTile_footer">
    <MatrixReactionsRow
      v-if="hasReactions || showActionBar"
      :event-id="eventId"
      :show-add-button="showActionBar"
    />

    <MatrixThreadInfo
      v-if="hasThread"
      :thread-reply-count="threadReplyCount"
      :thread-last-reply-sender="threadLastReplySender"
      :thread-last-reply-content="threadLastReplyContent"
      @click="emit('openThread')"
    />

    <MatrixReadReceiptGroup
      v-if="eventId && !isContinuation"
      :event-id="eventId"
      :max="5"
      :size="16"
      class="mx_EventTile_msgOption"
    />
  </div>
</template>
