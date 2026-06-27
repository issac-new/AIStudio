<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomId = computed(() => room.value?.roomId ?? '')

// ─── Editable fields ─────────────────────────────────────

const editingName = ref(false)
const nameDraft = ref('')
const nameSaving = ref(false)

const editingTopic = ref(false)
const topicDraft = ref('')
const topicSaving = ref(false)

const notificationLevel = ref<'all' | 'mentions' | 'none'>('all')
const notificationSaving = ref(false)

const leaveConfirming = ref(false)
const leaveError = ref<string | null>(null)

const avatarUrl = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomAvatarUrl(room.value, 60)
})
const roomName = computed(() => {
  void roomStore.roomVersion
  return room.value?.name ?? ''
})
const roomTopic = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomTopic(room.value) ?? ''
})
const canEditName = computed(() => {
  void roomStore.roomVersion
  return roomStore.canEditTopic()
})
const isEncrypted = computed(() => {
  void roomStore.roomVersion
  return room.value ? roomStore.isRoomEncrypted(room.value.roomId) : false
})
const memberCount = computed(() => {
  void roomStore.roomVersion
  return room.value?.getJoinedMemberCount() ?? 0
})

// Load current notification level
watch(room, () => {
  if (!room.value || !clientStore.client) return
  try {
    const pushRules = clientStore.client.getRoomPushRule?.('global', room.value.roomId)
    if (pushRules?.actions?.includes?.('dont_notify')) {
      notificationLevel.value = 'none'
    } else if (pushRules?.actions?.includes?.('notify')) {
      notificationLevel.value = 'all'
    } else {
      notificationLevel.value = 'mentions'
    }
  } catch {
    // ignore
  }
}, { immediate: true })

function handleBack() {
  rightPanelStore.rightPanelBack()
}

// ─── Name editing ────────────────────────────────────────

function startEditName() {
  nameDraft.value = roomName.value
  editingName.value = true
}

async function saveName() {
  if (!room.value || !nameDraft.value.trim()) return
  nameSaving.value = true
  try {
    await clientStore.client?.setRoomName(room.value.roomId, nameDraft.value.trim())
    editingName.value = false
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  } finally {
    nameSaving.value = false
  }
}

function cancelEditName() {
  editingName.value = false
}

// ─── Topic editing ───────────────────────────────────────

function startEditTopic() {
  topicDraft.value = roomTopic.value
  editingTopic.value = true
}

async function saveTopic() {
  if (!room.value) return
  topicSaving.value = true
  try {
    await clientStore.client?.setRoomTopic(room.value.roomId, topicDraft.value)
    editingTopic.value = false
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  } finally {
    topicSaving.value = false
  }
}

function cancelEditTopic() {
  editingTopic.value = false
}

// ─── Notifications ───────────────────────────────────────

async function setNotifications(level: 'all' | 'mentions' | 'none') {
  if (!clientStore.client || !roomId.value) return
  notificationSaving.value = true
  try {
    const ruleId = `.m.rule.room.${roomId.value}`
    if (level === 'none') {
      // Mute: push rule with dont_notify
      await clientStore.client.setRoomMutePushRule?.('global', ruleId, roomId.value)
    } else if (level === 'all') {
      // Notify all: delete mute rule and set notify
      await clientStore.client.deletePushRule?.('global', ruleId)
      await clientStore.client.setRoomPushRule?.('global', roomId.value, { actions: ['notify'] })
    } else {
      // Mentions only (default): delete any room-specific rules
      await clientStore.client.deletePushRule?.('global', ruleId)
    }
    notificationLevel.value = level
    roomStore.bumpRoomVersion()
  } catch {
    // ignore
  } finally {
    notificationSaving.value = false
  }
}

// ─── Leave room ──────────────────────────────────────────

async function handleLeaveRoom() {
  if (leaveConfirming.value) {
    leaveError.value = null
    try {
      await roomStore.leaveRoom(roomId.value)
      rightPanelStore.closeRightPanel()
    } catch (err: any) {
      leaveError.value = err?.message || t('matrixChat.leaveFailed')
    }
    leaveConfirming.value = false
  } else {
    leaveConfirming.value = true
    setTimeout(() => { leaveConfirming.value = false }, 3000)
  }
}
</script>

<template>
  <div v-if="room" class="room-settings-panel">
    <!-- Header -->
    <div class="rs-header">
      <button class="rs-back-btn" @click="handleBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3 class="rs-title">{{ t('matrixChat.roomSettings') }}</h3>
    </div>

    <!-- Content -->
    <div class="rs-content">
      <!-- Avatar -->
      <div class="rs-avatar-section">
        <div class="rs-avatar">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="rs-avatar-img" />
          <div v-else class="rs-avatar-placeholder">{{ roomName.charAt(0).toUpperCase() }}</div>
        </div>
        <button class="rs-avatar-change-btn">{{ t('matrixChat.changeAvatar') }}</button>
      </div>

      <!-- Room Name -->
      <div class="rs-field">
        <label class="rs-label">{{ t('matrixChat.roomName') }}</label>
        <template v-if="editingName">
          <div class="rs-edit-row">
            <input v-model="nameDraft" type="text" class="rs-input" maxlength="255" />
            <button class="rs-save-btn" :disabled="nameSaving || !nameDraft.trim()" @click="saveName">
              {{ nameSaving ? t('matrixChat.saving') : t('matrixChat.save') }}
            </button>
            <button class="rs-cancel-btn" @click="cancelEditName">{{ t('matrixChat.cancel') }}</button>
          </div>
        </template>
        <template v-else>
          <div class="rs-value-row">
            <span class="rs-value">{{ roomName }}</span>
            <button v-if="canEditName" class="rs-edit-btn" @click="startEditName">{{ t('matrixChat.edit') }}</button>
          </div>
        </template>
      </div>

      <!-- Room Topic -->
      <div class="rs-field">
        <label class="rs-label">{{ t('matrixChat.roomTopic') }}</label>
        <template v-if="editingTopic">
          <div class="rs-edit-row rs-edit-row--col">
            <textarea v-model="topicDraft" class="rs-input rs-textarea" rows="3" maxlength="1000" />
            <div class="rs-edit-actions">
              <button class="rs-save-btn" :disabled="topicSaving" @click="saveTopic">
                {{ topicSaving ? t('matrixChat.saving') : t('matrixChat.save') }}
              </button>
              <button class="rs-cancel-btn" @click="cancelEditTopic">{{ t('matrixChat.cancel') }}</button>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="rs-value-row">
            <span class="rs-value" :class="{ 'rs-value--empty': !roomTopic }">{{ roomTopic || t('matrixChat.noTopic') }}</span>
            <button v-if="canEditName" class="rs-edit-btn" @click="startEditTopic">{{ t('matrixChat.edit') }}</button>
          </div>
        </template>
      </div>

      <div class="rs-separator" />

      <!-- Notifications -->
      <div class="rs-field">
        <label class="rs-label">{{ t('matrixChat.notifications') }}</label>
        <div class="rs-notif-options">
          <label class="rs-notif-option" :class="{ 'rs-notif-option--active': notificationLevel === 'all' }">
            <input
              type="radio"
              name="notifications"
              :checked="notificationLevel === 'all'"
              :disabled="notificationSaving"
              @change="setNotifications('all')"
            />
            <span>{{ t('matrixChat.notifyAllMessages') }}</span>
          </label>
          <label class="rs-notif-option" :class="{ 'rs-notif-option--active': notificationLevel === 'mentions' }">
            <input
              type="radio"
              name="notifications"
              :checked="notificationLevel === 'mentions'"
              :disabled="notificationSaving"
              @change="setNotifications('mentions')"
            />
            <span>{{ t('matrixChat.notifyMentions') }}</span>
          </label>
          <label class="rs-notif-option" :class="{ 'rs-notif-option--active': notificationLevel === 'none' }">
            <input
              type="radio"
              name="notifications"
              :checked="notificationLevel === 'none'"
              :disabled="notificationSaving"
              @change="setNotifications('none')"
            />
            <span>{{ t('matrixChat.notifyNone') }}</span>
          </label>
        </div>
      </div>

      <div class="rs-separator" />

      <!-- Room Info -->
      <div class="rs-field">
        <label class="rs-label">{{ t('matrixChat.roomInfo') }}</label>
        <div class="rs-info-grid">
          <div class="rs-info-item">
            <span class="rs-info-label">{{ t('matrixChat.roomId') }}</span>
            <code class="rs-info-value">{{ roomId }}</code>
          </div>
          <div class="rs-info-item">
            <span class="rs-info-label">{{ t('matrixChat.members') }}</span>
            <span class="rs-info-value">{{ memberCount }}</span>
          </div>
          <div class="rs-info-item">
            <span class="rs-info-label">{{ t('matrixChat.encryption') }}</span>
            <span class="rs-info-value">{{ isEncrypted ? t('matrixChat.enabled') : t('matrixChat.disabled') }}</span>
          </div>
        </div>
      </div>

      <div class="rs-separator" />

      <!-- Danger zone -->
      <div class="rs-danger-zone">
        <button
          class="rs-leave-btn"
          :class="{ 'rs-leave-btn--confirming': leaveConfirming }"
          @click="handleLeaveRoom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {{ leaveConfirming ? t('matrixChat.confirmLeave') : t('matrixChat.leaveRoom') }}
        </button>
        <p v-if="leaveError" class="rs-leave-error">{{ leaveError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.room-settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  min-height: 44px;
}

.rs-back-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); color: $text-primary; }
}

.rs-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.rs-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rs-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
}

.rs-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
}

.rs-avatar-img {
  width: 60px;
  height: 60px;
  object-fit: cover;
}

.rs-avatar-placeholder {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.rs-avatar-change-btn {
  font-size: 12px;
  color: $accent-primary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: all $transition-fast;

  &:hover { text-decoration: underline; opacity: 0.8; }
}

// ─── Fields ─────────────────────────────────────────────

.rs-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rs-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.rs-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rs-value {
  font-size: 13px;
  color: $text-primary;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--empty { color: $text-muted; font-style: italic; }
}

.rs-edit-btn {
  font-size: 12px;
  color: $accent-primary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: $radius-sm;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.rs-edit-row {
  display: flex;
  gap: 6px;
  align-items: center;

  &--col { flex-direction: column; align-items: stretch; }
}

.rs-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.rs-input {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  font-family: inherit;

  &:focus { border-color: $accent-primary; }
}

.rs-textarea {
  height: auto;
  padding: 8px;
  resize: vertical;
  min-height: 56px;
}

.rs-save-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: none;
  border-radius: $radius-sm;
  background: $accent-primary;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.rs-cancel-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: none;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--text-muted-rgb), 0.06); }
}

// ─── Separator ─────────────────────────────────────────

.rs-separator {
  height: 1px;
  background: $border-color;
  margin: 2px 0;
}

// ─── Notifications ─────────────────────────────────────

.rs-notif-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rs-notif-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: $radius-sm;
  cursor: pointer;
  font-size: 13px;
  color: $text-primary;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }

  &--active {
    background: rgba(var(--accent-primary-rgb), 0.06);
    font-weight: 500;
  }

  input[type="radio"] {
    accent-color: $accent-primary;
  }
}

// ─── Room Info ─────────────────────────────────────────

.rs-info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rs-info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rs-info-label {
  font-size: 12px;
  color: $text-muted;
}

.rs-info-value {
  font-size: 12px;
  color: $text-primary;
  font-family: monospace;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// ─── Danger zone ───────────────────────────────────────

.rs-danger-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rs-leave-btn {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--error, #ef4444);
  border-radius: $radius-sm;
  background: none;
  color: var(--error, #ef4444);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--error-rgb), 0.06);
  }

  &--confirming {
    background: var(--error, #ef4444);
    color: #fff;
    font-weight: 700;

    svg { color: #fff; }
  }
}

.rs-leave-error {
  font-size: 12px;
  color: var(--error, #ef4444);
  margin: 0;
  text-align: center;
}
</style>
