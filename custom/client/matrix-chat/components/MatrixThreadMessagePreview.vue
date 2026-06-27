<script setup lang="ts">
import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'

interface Props {
  lastReply: MatrixEvent | null
  showDisplayName?: boolean
}
const props = withDefaults(defineProps<Props>(), { showDisplayName: true })
const roomStore = useMatrixRoomStore()
const composer = useMatrixComposerStore()

const sender = computed(() => props.lastReply?.getSender() ?? '')
const senderName = computed(() => {
  void roomStore.roomVersion
  const room = roomStore.activeRoom
  if (!room || !sender.value) return sender.value
  const member = room.getMember(sender.value)
  return member?.name || sender.value
})
const avatarUrl = computed(() => {
  void roomStore.roomVersion
  return props.lastReply ? roomStore.getUserAvatarUrl(props.lastReply.getSender(), 24) : null
})
const initial = computed(() => sender.value.charAt(0).toUpperCase())
const previewContent = computed(() => {
  if (!props.lastReply) return ''
  const c = props.lastReply.getContent()
  return composer.stripPlainReply(c?.body ?? '').slice(0, 80)
})
</script>

<template>
  <span v-if="lastReply" class="mx_ThreadSummary_preview">
    <span v-if="avatarUrl" class="mx_ThreadSummary_preview-avatar">
      <img :src="avatarUrl!" alt="" />
    </span>
    <span
      v-else-if="showDisplayName"
      class="mx_ThreadSummary_preview-avatar mx_ThreadSummary_preview-avatar--placeholder"
    >{{ initial }}</span>
    <span
      v-if="showDisplayName && senderName"
      class="mx_ThreadSummary_preview-sender"
    >{{ senderName }}</span>
    <span class="mx_ThreadSummary_preview-content">{{ previewContent }}</span>
  </span>
</template>

<style scoped lang="scss">
.mx_ThreadSummary_preview {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  flex: 1;
  min-width: 0;
}
.mx_ThreadSummary_preview-avatar {
  flex-shrink: 0;
  margin-right: 8px;
  img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }
}
.mx_ThreadSummary_preview-avatar--placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}
.mx_ThreadSummary_preview-sender {
  font-weight: 600;
  margin-right: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}
.mx_ThreadSummary_preview-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
