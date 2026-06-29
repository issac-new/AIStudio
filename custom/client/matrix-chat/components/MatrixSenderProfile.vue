<script setup lang="ts">
import { computed } from 'vue'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { colorFromUserId } from '@/custom/matrix-chat/utils/usernameColor'

interface Props {
  userId: string
  showMxid?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showMxid: false,
})

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()

const displayName = computed(() => {
  void roomStore.roomVersion
  const room = roomStore.activeRoom
  if (!room) return props.userId
  const member = room.getMember(props.userId)
  return member?.name || props.userId
})

const mxid = computed(() => props.userId)

// Per-user greyscale color (element-web username-color behavior, Pure Ink palette)
const senderColor = computed(() => colorFromUserId(props.userId))
</script>

<template>
  <span class="mx_DisambiguatedProfile" :style="{ color: senderColor }" @click="rightPanelStore.openMemberInfo(userId)">
    <span class="mx_DisambiguatedProfile_displayName">{{ displayName }}</span>
    <span v-if="showMxid && displayName !== mxid" class="mx_DisambiguatedProfile_mxid">{{ mxid }}</span>
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_DisambiguatedProfile {
  // element uses cpd-font-body-md-regular (~15px, regular weight)
  font-size: var(--mx-font-15px, 15px);
  font-weight: 400;
  // color comes from inline :style binding (per-user); keep cursor + hover affordance
  cursor: pointer;
  display: inline-block;

  &:hover {
    opacity: 0.7;
  }
}

.mx_DisambiguatedProfile_displayName {
  font-weight: 600;
}

.mx_DisambiguatedProfile_mxid {
  font-weight: 400;
  color: $text-muted;
  margin-left: 4px;
  font-size: 12px;
}
</style>
