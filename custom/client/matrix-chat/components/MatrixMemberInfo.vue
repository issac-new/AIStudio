<script setup lang="ts">
import { computed, ref } from 'vue'
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
  void roomStore.roomVersion
  if (!room.value || !memberUserId.value) return null
  return room.value.getMember(memberUserId.value)
})

const memberName = computed(() => member.value?.name ?? member.value?.rawDisplayName ?? memberUserId.value ?? '')
const avatarUrl = computed(() => {
  void roomStore.roomVersion
  return roomStore.getUserAvatarUrl(member.value, 120)
})
const powerLevel = computed(() => {
  void roomStore.roomVersion
  return member.value?.powerLevel ?? 0
})

// ─── Presense (enhanced with last active) ─────────────────

const presence = computed(() => {
  if (!memberUserId.value) return { status: 'offline', lastActiveAgo: undefined, currentlyActive: false }
  const p = roomStore.getUserPresence(memberUserId.value)
  return p
})

const presenceLabel = computed(() => {
  if (presence.value.currentlyActive) return t('matrixChat.online')
  switch (presence.value.status) {
    case 'online': return t('matrixChat.online')
    case 'unavailable': return t('matrixChat.unavailable')
    default: return t('matrixChat.offline')
  }
})

const presenceClass = computed(() => {
  switch (presence.value.status) {
    case 'online': return 'presence--online'
    case 'unavailable': return 'presence--unavailable'
    default: return 'presence--offline'
  }
})

const lastActiveText = computed(() => {
  const ago = presence.value.lastActiveAgo
  if (!ago) return ''
  const mins = Math.round(ago / 60000)
  if (mins < 1) return t('matrixChat.justNow')
  if (mins < 60) return t('matrixChat.minutesAgo', { n: mins })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('matrixChat.hoursAgo', { n: hours })
  return t('matrixChat.daysAgo', { n: Math.round(hours / 24) })
})

// ─── Role ─────────────────────────────────────────────────

const roleLabel = computed(() => {
  if (powerLevel.value >= 100) return t('matrixChat.memberAdmin')
  if (powerLevel.value >= 50) return t('matrixChat.memberMod')
  return t('matrixChat.memberDefault')
})

const isCurrentUser = computed(() => clientStore.userId === memberUserId.value)

// ─── Power level editing ──────────────────────────────────

const myPowerLevel = computed(() => {
  void roomStore.roomVersion
  if (!room.value || !clientStore.userId) return 0
  return room.value.getMember(clientStore.userId)?.powerLevel ?? 0
})

const canModifyPower = computed(() => {
  void roomStore.roomVersion
  if (isCurrentUser.value) return false
  return myPowerLevel.value >= 100 && myPowerLevel.value > powerLevel.value
})

const editingPower = ref(false)
const selectedPower = ref(0)
const powerSaving = ref(false)

function startEditPower() {
  selectedPower.value = powerLevel.value
  editingPower.value = true
}

async function savePower() {
  if (!room.value || !memberUserId.value) return
  powerSaving.value = true
  try {
    const powerLevelsEvent = room.value.currentState.getStateEvents('m.room.power_levels', '')
    const content = JSON.parse(JSON.stringify(powerLevelsEvent?.getContent() ?? {}))
    if (!content.users) content.users = {}
    content.users[memberUserId.value] = selectedPower.value
    await clientStore.client?.sendStateEvent(room.value.roomId, 'm.room.power_levels', content, '')
    editingPower.value = false
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  } finally {
    powerSaving.value = false
  }
}

function cancelEditPower() {
  editingPower.value = false
}

// ─── Admin tools ──────────────────────────────────────────

const canKick = computed(() => {
  void roomStore.roomVersion
  if (!room.value || isCurrentUser.value) return false
  return myPowerLevel.value > powerLevel.value && myPowerLevel.value >= (room.value.currentState.getStateEvents('m.room.power_levels', '')?.getContent()?.kick ?? 50)
})

const canBan = computed(() => {
  void roomStore.roomVersion
  if (!room.value || isCurrentUser.value) return false
  return myPowerLevel.value > powerLevel.value && myPowerLevel.value >= (room.value.currentState.getStateEvents('m.room.power_levels', '')?.getContent()?.ban ?? 50)
})

const showAdminTools = computed(() => canKick.value || canBan.value)

// ─── Ignore ───────────────────────────────────────────────

const isIgnored = ref(false)

async function toggleIgnore() {
  if (!memberUserId.value) return
  try {
    if (isIgnored.value) {
      await roomStore.setIgnoreUser(memberUserId.value, false)
      isIgnored.value = false
    } else {
      await roomStore.setIgnoreUser(memberUserId.value, true)
      isIgnored.value = true
    }
  } catch {
    // ignore
  }
}

// ─── Encryption / verification ────────────────────────────

const isEncrypted = computed(() => room.value ? roomStore.isRoomEncrypted(room.value.roomId) : false)

const e2eStatus = computed(() => {
  if (!memberUserId.value || !isEncrypted.value) return 'normal'
  return roomStore.getE2EStatus(room.value?.roomId ?? '')
})

// ─── Actions ──────────────────────────────────────────────

async function handleStartChat() {
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
    rightPanelStore.rightPanelBack()
  } catch {
    // ignore
  }
}

async function handleBan() {
  if (!room.value || !memberUserId.value) return
  try {
    await clientStore.client?.ban(room.value.roomId, memberUserId.value)
    roomStore.bumpRoomVersion()
    rightPanelStore.rightPanelBack()
  } catch {
    // ignore
  }
}

// ─── Copy MXID ────────────────────────────────────────────

async function copyMxid() {
  if (!memberUserId.value) return
  try {
    await navigator.clipboard.writeText(memberUserId.value)
  } catch {
    // ignore
  }
}
</script>

<template>
  <div v-if="member" class="member-info-panel">
    <!-- Avatar + Name + MXID (like element-web UserInfoHeaderView) -->
    <div class="mi-avatar-section">
      <div class="mi-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="mi-avatar-img" />
        <div v-else class="mi-avatar-placeholder">
          {{ memberName.charAt(0).toUpperCase() }}
        </div>
        <!-- Presence dot overlay -->
        <span :class="['mi-presence-dot', presenceClass]" />
      </div>
      <h2 class="mi-name">{{ memberName }}</h2>

      <!-- Presence label -->
      <div :class="['mi-presence-label', presenceClass]">
        <span class="mi-presence-icon" />
        {{ presenceLabel }}
        <span v-if="lastActiveText && !presence.currentlyActive" class="mi-last-active"> · {{ lastActiveText }}</span>
      </div>

      <!-- Copyable MXID -->
      <button class="mi-mxid" @click="copyMxid" :title="t('matrixChat.copyText')">
        {{ memberUserId }}
      </button>
    </div>

    <!-- Role badge + E2E status -->
    <div class="mi-badges">
      <span class="mi-role-badge" :class="powerLevel >= 100 ? 'mi-role--admin' : powerLevel >= 50 ? 'mi-role--mod' : 'mi-role--default'">
        {{ roleLabel }}
      </span>

      <!-- E2E verification shield (like element-web UserInfoHeaderVerificationView) -->
      <span v-if="isEncrypted && e2eStatus === 'normal'" class="mi-e2e-shield mi-e2e--trusted" :title="t('matrixChat.e2eVerified')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" /></svg>
        {{ t('matrixChat.trusted') }}
      </span>
      <span v-else-if="isEncrypted && e2eStatus === 'warning'" class="mi-e2e-shield mi-e2e--warning" :title="t('matrixChat.notTrusted')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 7h2v6h-2V8zm0 8h2v2h-2v-2z" /></svg>
        {{ t('matrixChat.notTrusted') }}
      </span>
    </div>

    <!-- Power level editor (like element-web UserInfoPowerLevels) -->
    <div v-if="!isCurrentUser && canModifyPower" class="mi-section">
      <div class="mi-section-header">
        <span class="mi-section-title">{{ t('matrixChat.powerLevel') }}</span>
        <button v-if="!editingPower" class="mi-section-edit-btn" @click="startEditPower">{{ t('matrixChat.edit') }}</button>
      </div>
      <template v-if="editingPower">
        <div class="mi-power-edit">
          <select v-model="selectedPower" class="mi-power-select">
            <option :value="100">{{ t('matrixChat.memberAdmin') }} (100)</option>
            <option :value="50">{{ t('matrixChat.memberMod') }} (50)</option>
            <option :value="0">{{ t('matrixChat.memberDefault') }} (0)</option>
          </select>
          <button class="mi-save-btn" :disabled="powerSaving" @click="savePower">{{ powerSaving ? t('matrixChat.saving') : t('matrixChat.save') }}</button>
          <button class="mi-cancel-btn" @click="cancelEditPower">{{ t('matrixChat.cancel') }}</button>
        </div>
      </template>
      <p v-else class="mi-power-value">{{ roleLabel }} · {{ t('matrixChat.powerLevelValue', { level: powerLevel }) }}</p>
    </div>

    <div class="mi-separator" />

    <!-- Basic options (like element-web UserInfoBasicOptionsView) -->
    <div v-if="!isCurrentUser" class="mi-section">
      <button class="mi-option-btn" @click="handleStartChat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        {{ t('matrixChat.startChat') }}
      </button>
    </div>

    <!-- Admin tools (like element-web UserInfoAdminToolsContainer) -->
    <div v-if="showAdminTools" class="mi-section">
      <div class="mi-section-header">
        <span class="mi-section-title">{{ t('matrixChat.adminTools') }}</span>
      </div>
      <button v-if="canKick" class="mi-option-btn mi-option-btn--danger" @click="handleKick">
        {{ t('matrixChat.kickUser') }}
      </button>
      <button v-if="canBan" class="mi-option-btn mi-option-btn--danger" @click="handleBan">
        {{ t('matrixChat.banUser') }}
      </button>
    </div>

    <div class="mi-separator" />

    <!-- Ignore toggle (like element-web IgnoreToggleButton) -->
    <div v-if="!isCurrentUser" class="mi-section">
      <button class="mi-option-btn mi-option-btn--muted" @click="toggleIgnore">
        {{ isIgnored ? t('matrixChat.unignoreUser') : t('matrixChat.ignoreUser') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.member-info-panel {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 10px;
}

// ─── Avatar section ──────────────────────────────────────

.mi-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}

.mi-avatar {
  position: relative;
  width: 80px;
  height: 80px;
}

.mi-avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.mi-avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
}

.mi-presence-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid var(--bg-card);

  &.presence--online { background: var(--success, #22c55e); }
  &.presence--unavailable { background: var(--warning, #f59e0b); }
  &.presence--offline { background: var(--text-muted, #94a3b8); }
}

.mi-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-align: center;
}

.mi-presence-label {
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;

  &.presence--online { background: rgba(var(--success-rgb), 0.08); color: var(--success); }
  &.presence--unavailable { background: rgba(var(--warning-rgb), 0.08); color: var(--warning); }
  &.presence--offline { background: rgba(var(--text-muted-rgb), 0.06); color: var(--text-muted); }
}

.mi-presence-icon {
  width: 6px; height: 6px; border-radius: 50%;
  .presence--online & { background: var(--success); }
  .presence--unavailable & { background: var(--warning); }
  .presence--offline & { background: var(--text-muted); }
}

.mi-last-active { opacity: 0.7; font-weight: 400; }

.mi-mxid {
  font-size: 12px;
  font-family: monospace;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); color: var(--accent-primary); }
}

// ─── Badges ──────────────────────────────────────────────

.mi-badges {
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.mi-role-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;

  &.mi-role--admin { background: rgba(var(--accent-info-rgb), 0.1); color: var(--accent-info); }
  &.mi-role--mod { background: rgba(var(--success-rgb), 0.1); color: var(--success); }
  &.mi-role--default { color: var(--text-muted); }
}

.mi-e2e-shield {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;

  &.mi-e2e--trusted { background: rgba(var(--success-rgb), 0.1); color: var(--success); }
  &.mi-e2e--warning { background: rgba(var(--error-rgb), 0.1); color: var(--error, #ef4444); }
}

// ─── Sections ────────────────────────────────────────────

.mi-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mi-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mi-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mi-section-edit-btn {
  font-size: 11px;
  color: var(--accent-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.mi-power-value {
  font-size: 13px;
  color: var(--text-primary);
  margin: 0;
}

// ─── Power editor ────────────────────────────────────────

.mi-power-edit {
  display: flex;
  gap: 6px;
  align-items: center;
}

.mi-power-select {
  flex: 1;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-input);
  outline: none;

  &:focus { border-color: var(--accent-primary); }
}

.mi-save-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: var(--accent-primary);
  color: #fff;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.mi-cancel-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;

  &:hover { background: rgba(var(--text-muted-rgb), 0.06); }
}

.mi-separator {
  height: 1px;
  background: var(--border-color);
}

// ─── Option buttons ──────────────────────────────────────

.mi-option-btn {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }

  &--danger {
    color: var(--error, #ef4444);
    border-color: rgba(var(--error-rgb), 0.3);
    &:hover { background: rgba(var(--error-rgb), 0.06); }
  }

  &--muted {
    color: var(--text-muted);
    &:hover { background: rgba(var(--text-muted-rgb), 0.06); color: var(--text-primary); }
  }
}
</style>
