<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const memberUserId = computed(() => rightPanelStore.rightPanelMemberUserId)
const room = computed(() => roomStore.activeRoom)

const member = computed(() => {
  if (!room.value || !memberUserId.value) return null
  return room.value.getMember(memberUserId.value)
})

const memberName = computed(() => member.value?.name ?? memberUserId.value ?? '')
const avatarUrl = computed(() => roomStore.getUserAvatarUrl(member.value, 128))
const powerLevel = computed(() => member.value?.powerLevel ?? 0)

const presence = computed(() => {
  if (!memberUserId.value) return { status: 'offline' }
  return roomStore.getUserPresence(memberUserId.value)
})

const presenceLabel = computed(() => {
  switch (presence.value.status) {
    case 'online': return t('matrixChat.online')
    case 'unavailable': return t('matrixChat.unavailable')
    default: return t('matrixChat.offline')
  }
})

const presenceClass = computed(() => {
  switch (presence.value.status) {
    case 'online': return 'presence-status--online'
    case 'unavailable': return 'presence-status--unavailable'
    default: return 'presence-status--offline'
  }
})

const roleLabel = computed(() => {
  if (powerLevel.value >= 100) return t('matrixChat.memberAdmin')
  if (powerLevel.value >= 50) return t('matrixChat.memberMod')
  return t('matrixChat.memberDefault')
})

const roleClass = computed(() => {
  if (powerLevel.value >= 100) return 'member-role--admin'
  if (powerLevel.value >= 50) return 'member-role--mod'
  return 'member-role--default'
})

const canKick = computed(() => {
  if (!room.value) return false
  return roomStore.canKickInRoom(room.value.roomId)
})

const isCurrentUser = computed(() => clientStore.userId === memberUserId.value)

async function handleStartDm() {
  if (!memberUserId.value) return
  try {
    await roomStore.startDmWithUser(memberUserId.value)
    rightPanelStore.closeRightPanel()
  } catch {
    // ignore
  }
}

async function handleKick() {
  if (!room.value || !memberUserId.value) return
  try {
    await roomStore.kickUser(room.value.roomId, memberUserId.value)
    rightPanelStore.closeRightPanel()
  } catch {
    // ignore
  }
}

async function handleIgnore() {
  if (!memberUserId.value) return
  try {
    await roomStore.setIgnoreUser(memberUserId.value, true)
  } catch {
    // ignore
  }
}

async function handleUnignore() {
  if (!memberUserId.value) return
  try {
    await roomStore.setIgnoreUser(memberUserId.value, false)
  } catch {
    // ignore
  }
}
</script>

<template>
  <div v-if="member" class="member-info-panel">
    <!-- Header -->
    <div class="member-info-header">
      <div class="member-info-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="member-info-avatar-img" />
        <div v-else class="member-info-avatar-placeholder">
          {{ memberName.charAt(0).toUpperCase() }}
        </div>
        <span :class="['presence-dot-large', presenceClass]" />
      </div>
      <div class="member-info-header-text">
        <h3 class="member-info-name">{{ memberName }}</h3>
        <span class="member-info-userid">{{ memberUserId }}</span>
      </div>
    </div>

    <!-- Status -->
    <div class="member-info-status">
      <div :class="['presence-status', presenceClass]">
        {{ presenceLabel }}
      </div>
      <div :class="['member-role', roleClass]">
        {{ roleLabel }}
      </div>
    </div>

    <!-- Actions -->
    <div class="member-info-actions">
      <button v-if="!isCurrentUser" class="member-info-action-btn" @click="handleStartDm">
        {{ t('matrixChat.startChat') }}
      </button>
      <button v-if="canKick && !isCurrentUser" class="member-info-action-btn member-info-action-btn--danger" @click="handleKick">
        {{ t('matrixChat.kickUser') }}
      </button>
      <button v-if="!isCurrentUser" class="member-info-action-btn member-info-action-btn--muted" @click="handleIgnore">
        {{ t('matrixChat.ignoreUser') }}
      </button>
      <button v-if="!isCurrentUser" class="member-info-action-btn" @click="handleUnignore">
        {{ t('matrixChat.unignoreUser') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.member-info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.member-info-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-info-avatar {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.member-info-avatar-img {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.member-info-avatar-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.presence-dot-large {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 3px solid var(--bg-card);
}

.presence-status--online .presence-dot-large,
.presence-dot-large.presence-status--online { background: var(--success); }
.presence-dot-large.presence-status--unavailable { background: var(--warning); }
.presence-dot-large.presence-status--offline { background: var(--text-muted); }

.member-info-header-text {
  flex: 1;
  min-width: 0;
}

.member-info-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-info-userid {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-info-status {
  display: flex;
  gap: 8px;
}

.presence-status {
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.presence-status--online {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--success);
}

.presence-status--unavailable {
  background: rgba(var(--warning-rgb), 0.1);
  color: var(--warning);
}

.presence-status--offline {
  background: rgba(var(--text-muted-rgb), 0.1);
  color: var(--text-muted);
}

.member-role {
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.member-role--admin {
  background: rgba(var(--accent-info-rgb), 0.1);
  color: var(--accent-info);
}

.member-role--mod {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--success);
}

.member-role--default {
  color: var(--text-muted);
}

.member-info-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.member-info-action-btn {
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: $radius-sm;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
}

.member-info-action-btn--danger {
  color: var(--error);
  border-color: rgba(var(--error-rgb), 0.3);

  &:hover {
    background: rgba(var(--error-rgb), 0.06);
  }
}

.member-info-action-btn--muted {
  color: var(--text-muted);
  border-color: var(--border-light);

  &:hover {
    background: rgba(var(--text-muted-rgb), 0.06);
  }
}
</style>
