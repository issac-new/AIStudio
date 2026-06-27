<script setup lang="ts">
// 状态事件系统通知组件(对齐 element-web TextualEvent / mx_EventTile_info)。
// 渲染 m.room.create / m.room.member(join/leave/invite/ban/kick)为灰色居中文案。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { formatStateEvent } from '@/custom/matrix-chat/utils/formatStateEvent'

const props = defineProps<{
  event: MatrixEvent
}>()

const { t } = useI18n()
const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()

// member name 查找:优先用 room member 的 displayname,否则用 user_id
function getDisplayName(userId: string): string {
  const room = roomStore.activeRoom as any
  const member = room?.getMember?.(userId)
  return member?.name || member?.rawDisplayName || userId
}

const text = computed(() => {
  void roomStore.threadTimelineVersion // 响应式依赖(member 变更时重算)
  void roomStore.roomVersion // room 元数据变更时重算
  return formatStateEvent(props.event, t, getDisplayName)
})
</script>

<template>
  <div v-if="text" class="mx_StateEvent">
    {{ text }}
  </div>
</template>

<style scoped lang="scss">
.mx_StateEvent {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 24px;
  margin: 2px 0;
  word-break: break-word;
}
</style>
