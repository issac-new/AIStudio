<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const typingUsers = computed(() => roomStore.typingUsers)

const typingText = computed(() => {
  void roomStore.roomVersion // 成员头像/名称变更时刷新
  const users = typingUsers.value
  if (users.length === 0) return ''
  if (users.length === 1) {
    return t('matrixChat.typingOne', { user: users[0] })
  }
  if (users.length === 2) {
    return t('matrixChat.typingTwo', { user1: users[0], user2: users[1] })
  }
  return t('matrixChat.typingMany', { count: users.length })
})

const hasTypingUsers = computed(() => typingUsers.value.length > 0)

function getUserAvatar(userId: string): string | null {
  return roomStore.getUserAvatarUrl(userId, 16)
}
</script>

<template>
  <div v-if="hasTypingUsers" class="mx_TypingNotification">
    <div class="mx_TypingNotification_avatars">
      <img
        v-for="user in typingUsers.slice(0, 3)"
        :key="user"
        :src="getUserAvatar(user) || undefined"
        alt=""
        class="mx_TypingNotification_avatar"
      />
    </div>
    <span class="mx_TypingNotification_text">{{ typingText }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_TypingNotification {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  font-size: 12px;
  color: $text-muted;
  min-height: 24px;
}

.mx_TypingNotification_avatars {
  display: flex;
  align-items: center;
}

.mx_TypingNotification_avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  margin-left: -4px;
  background: $bg-secondary;

  &:first-child {
    margin-left: 0;
  }
}

.mx_TypingNotification_text {
  font-style: italic;
}
</style>
