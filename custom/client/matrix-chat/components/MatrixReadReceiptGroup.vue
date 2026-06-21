<script setup lang="ts">
import { computed } from 'vue'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { colorFromUserId } from '@/custom/matrix-chat/utils/usernameColor'

interface Props {
  eventId: string | null
  /** How many avatars to show before collapsing into +N (element default 5) */
  max?: number
  /** Avatar pixel size */
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  max: 5,
  size: 16,
})

const roomStore = useMatrixRoomStore()

const receipts = computed(() => roomStore.getEventReadReceipts(props.eventId))

const visible = computed(() => receipts.value.slice(0, props.max))
const overflowCount = computed(() =>
  Math.max(0, receipts.value.length - props.max),
)

function avatarUrl(userId: string): string | null {
  return roomStore.getUserAvatarUrl(userId, props.size)
}

function initial(userId: string): string {
  return (userId.replace(/^@/, '').charAt(0) || '?').toUpperCase()
}

function color(userId: string): string {
  return colorFromUserId(userId)
}
</script>

<template>
  <div
    v-if="receipts.length > 0"
    class="mx_ReadReceiptGroup"
    :aria-label="`Read by ${receipts.length}`"
  >
    <span
      v-for="r in visible"
      :key="r.userId"
      class="mx_ReadReceiptGroup_avatar"
      :title="r.userId"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <img
        v-if="avatarUrl(r.userId)"
        :src="avatarUrl(r.userId)!"
        alt=""
        class="mx_ReadReceiptGroup_avatar_img"
      />
      <span
        v-else
        class="mx_ReadReceiptGroup_avatar_placeholder"
        :style="{ backgroundColor: color(r.userId) }"
      >{{ initial(r.userId) }}</span>
    </span>
    <span v-if="overflowCount > 0" class="mx_ReadReceiptGroup_overflow">+{{ overflowCount }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_ReadReceiptGroup {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  // Right-side gutter placement is controlled by the parent (.mx_EventTile_msgOption)
}

.mx_ReadReceiptGroup_avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  margin-left: -4px;
  border: 1.5px solid var(--bg-card);
  flex-shrink: 0;

  &:first-child {
    margin-left: 0;
  }
}

.mx_ReadReceiptGroup_avatar_img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mx_ReadReceiptGroup_avatar_placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
}

.mx_ReadReceiptGroup_overflow {
  font-size: var(--mx-font-11px, 11px);
  color: var(--mx-text-tertiary, #{$text-muted});
  margin-left: 2px;
}
</style>
