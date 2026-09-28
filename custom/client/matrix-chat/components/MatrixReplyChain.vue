<script setup lang="ts">
import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'

interface Props {
  event: MatrixEvent
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: []
}>()

const roomStore = useMatrixRoomStore()
const composerStore = useMatrixComposerStore()

const replyEvent = computed(() => composerStore.getReplyEvent(props.event))
const replySender = computed(() => replyEvent.value?.getSender() ?? '')
const replyDisplayName = computed(() => {
  void roomStore.roomVersion
  if (!replyEvent.value || !roomStore.activeRoom) return replySender.value
  const member = roomStore.activeRoom.getMember(replySender.value)
  return member?.name || replySender.value
})
const replyContent = computed(() => {
  if (!replyEvent.value) return ''
  const c = replyEvent.value.getContent()
  const body = c?.body ?? ''
  return composerStore.stripPlainReply(body).slice(0, 80)
})
</script>

<template>
  <div v-if="replyEvent" class="mx_ReplyChain" @click="emit('click')">
    <div class="mx_ReplyChain_sender">{{ replyDisplayName }}</div>
    <div class="mx_ReplyChain_content">{{ replyContent }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_ReplyChain {
  margin-bottom: 4px;
  padding: 4px 8px;
  border-left: 2px solid var(--accent-primary);
  background: rgba(var(--accent-primary-rgb), 0.04);
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
  }
}

.mx_ReplyChain_sender {
  font-weight: 600;
  color: var(--accent-primary);
  font-size: 12px;
}

.mx_ReplyChain_content {
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
