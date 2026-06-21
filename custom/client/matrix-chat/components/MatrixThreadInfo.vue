<script setup lang="ts">
import { useI18n } from 'vue-i18n'

interface Props {
  threadReplyCount: number
  threadLastReplySender: string
  threadLastReplyContent: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mx_ThreadInfo" @click="emit('click')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <span class="mx_ThreadInfo_count">{{ threadReplyCount }} {{ t('matrixChat.threadReplies', { count: threadReplyCount }) }}</span>
    <span v-if="threadLastReplySender" class="mx_ThreadInfo_lastReply">{{ threadLastReplySender }}: {{ threadLastReplyContent }}</span>
  </div>
</template>
