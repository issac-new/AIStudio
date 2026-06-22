<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixInviteDialog from './MatrixInviteDialog.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const showInviteDialog = ref(false)
const linkCopied = ref(false)
const editingTopic = ref(false)
const topicEditText = ref('')
const topicExpanded = ref(true)

const room = computed(() => roomStore.activeRoom)
const roomName = computed(() => room.value?.name ?? '')
const roomAlias = computed(() => roomStore.getRoomAlias(room.value))
const memberCount = computed(() => {
  if (!room.value) return 0
  return room.value.getJoinedMemberCount()
})

const topic = computed(() => roomStore.getRoomTopic(room.value))
const hasTopic = computed(() => !!topic.value)
const displayedTopic = computed(() => {
  if (!topic.value) return ''
  if (topicExpanded.value || topic.value.length <= 200) return topic.value
  return topic.value.slice(0, 200) + '...'
})
const canEditTopic = computed(() => roomStore.canEditTopic())
const isFavorite = computed(() => roomStore.isRoomFavorite())

const avatarUrl = computed(() => roomStore.getRoomAvatarUrl(room.value, 160))
const isEncrypted = computed(() => room.value ? roomStore.isRoomEncrypted(room.value.roomId) : false)
const isPublic = computed(() => roomStore.isRoomPublic(room.value))
const roomId = computed(() => room.value?.roomId ?? '')

// ─── Actions ──────────────────────────────────────────────
function handleInviteMembers() {
  showInviteDialog.value = true
}

function handleOpenMemberList() {
  rightPanelStore.openMemberList()
}

function handleOpenThreadPanel() {
  // 直接走 right-panel store 的 ThreadPanel phase(openThreadPanel 会 push history)
  rightPanelStore.openThreadPanel()
}

function handleShareLink() {
  if (!roomId.value) return
  const link = `https://matrix.to/#/${roomId.value}`
  navigator.clipboard.writeText(link)
  linkCopied.value = true
  setTimeout(() => { linkCopied.value = false }, 2000)
}

async function handleLeaveRoom() {
  if (!roomId.value) return
  try {
    await roomStore.leaveRoom(roomId.value)
    rightPanelStore.closeRightPanel()
  } catch {
    // ignore
  }
}

async function handleToggleFavorite() {
  try {
    await roomStore.toggleRoomFavorite()
  } catch {
    // ignore
  }
}

function handleEditTopic() {
  topicEditText.value = topic.value
  editingTopic.value = true
}

async function handleSaveTopic() {
  if (topicEditText.value === topic.value) {
    editingTopic.value = false
    return
  }
  try {
    await roomStore.setRoomTopic(topicEditText.value)
  } catch {
    // ignore
  }
  editingTopic.value = false
}

function handleCancelEditTopic() {
  editingTopic.value = false
}
</script>

<template>
  <div v-if="room" class="room-summary-card">
    <!-- Header: Centered avatar + name + alias -->
    <div class="summary-header">
      <div class="summary-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="summary-avatar-img" />
        <div v-else class="summary-avatar-placeholder">{{ roomName.charAt(0).toUpperCase() }}</div>
      </div>
      <h3 class="summary-room-name" :title="roomName">{{ roomName }}</h3>
      <span v-if="roomAlias" class="summary-room-alias" :title="roomAlias">{{ roomAlias }}</span>
    </div>

    <!-- Badges -->
    <div class="summary-badges">
      <span v-if="isPublic" class="summary-badge summary-badge--public">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        {{ t('matrixChat.roomPublic') }}
      </span>
      <span v-if="isEncrypted" class="summary-badge summary-badge--encrypted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        {{ t('matrixChat.roomEncryption') }}
      </span>
      <span v-if="!isEncrypted" class="summary-badge summary-badge--unencrypted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 3.5 1.5" /></svg>
        {{ t('matrixChat.unencrypted') }}
      </span>
    </div>

    <!-- Topic section -->
    <div class="summary-topic">
      <template v-if="!editingTopic">
        <div v-if="hasTopic" class="summary-topic-container">
          <p class="summary-topic-text">{{ displayedTopic }}</p>
          <button
            v-if="topic.length > 200"
            class="summary-topic-toggle"
            @click="topicExpanded = !topicExpanded"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="{ transform: topicExpanded ? 'rotate(180deg)' : '' }">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button v-if="canEditTopic" class="summary-topic-edit" @click="handleEditTopic">
            {{ t('matrixChat.edit') }}
          </button>
        </div>
        <button v-else-if="canEditTopic" class="summary-topic-add" @click="handleEditTopic">
          {{ t('matrixChat.addTopic') }}
        </button>
      </template>
      <template v-else>
        <textarea
          v-model="topicEditText"
          class="summary-topic-input"
          rows="3"
          @keydown.enter.meta="handleSaveTopic"
        />
        <div class="summary-topic-actions">
          <button class="topic-save-btn" @click="handleSaveTopic">{{ t('matrixChat.save') }}</button>
          <button class="topic-cancel-btn" @click="handleCancelEditTopic">{{ t('matrixChat.cancel') }}</button>
        </div>
      </template>
    </div>

    <!-- Separator -->
    <div class="summary-separator" />

    <!-- Menu items -->
    <div class="summary-menu">
      <!-- Group 1: Favorite + Invite -->
      <button class="menu-item menu-item--toggle" :class="{ 'menu-item--active': isFavorite }" @click="handleToggleFavorite">
        <svg width="18" height="18" viewBox="0 0 24 24" :fill="isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span class="menu-item-label">{{ t('matrixChat.favorite') }}</span>
        <span v-if="isFavorite" class="menu-item-check">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      </button>
      <button class="menu-item" @click="handleInviteMembers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.inviteUser') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 2: People + Threads -->
      <button class="menu-item" @click="handleOpenMemberList">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.people') }}</span>
        <span class="menu-item-extra">{{ memberCount }}</span>
      </button>
      <button class="menu-item" @click="handleOpenThreadPanel">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.threadsMenu') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 3: Copy Link -->
      <button class="menu-item" @click="handleShareLink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        <span class="menu-item-label">{{ linkCopied ? t('matrixChat.linkCopied') : t('matrixChat.copyLink') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 4: Leave Room (danger) -->
      <button class="menu-item menu-item--danger" @click="handleLeaveRoom">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.leaveRoom') }}</span>
      </button>
    </div>

    <MatrixInviteDialog v-if="showInviteDialog" @close="showInviteDialog = false" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.room-summary-card {
  display: flex;
  flex-direction: column;
  padding: 0;
}

// ─── Header ──────────────────────────────────────────────
.summary-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 16px;
  gap: 8px;
}

.summary-avatar {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.summary-avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.summary-avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
}

.summary-room-name {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.summary-room-alias {
  font-size: 13px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

// ─── Badges ──────────────────────────────────────────────
.summary-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 0 16px 12px;
}

.summary-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  svg { flex-shrink: 0; }
}

.summary-badge--encrypted {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--success, #22c55e);
}

.summary-badge--public {
  background: rgba(var(--accent-info-rgb), 0.1);
  color: var(--accent-info, #3b82f6);
}

.summary-badge--unencrypted {
  background: rgba(var(--text-muted-rgb), 0.08);
  color: $text-muted;
}

// ─── Topic ───────────────────────────────────────────────
.summary-topic {
  padding: 0 16px 12px;
}

.summary-topic-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-topic-text {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
  word-break: break-word;
  margin: 0;
}

.summary-topic-toggle {
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  align-self: center;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover { color: $accent-primary; background: rgba(var(--accent-primary-rgb), 0.06); }
}

.summary-topic-edit {
  font-size: 12px;
  color: $accent-primary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;

  &:hover { text-decoration: underline; }
}

.summary-topic-add {
  font-size: 13px;
  color: $accent-primary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  &:hover { text-decoration: underline; }
}

.summary-topic-input {
  width: 100%;
  min-height: 60px;
  padding: 8px 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-primary;
  background: $bg-input;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.5;

  &:focus { border-color: $accent-primary; }
}

.summary-topic-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.topic-save-btn,
.topic-cancel-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: $radius-sm;
  cursor: pointer;
  border: 1px solid $border-color;
  transition: all $transition-fast;
}

.topic-save-btn {
  background: $accent-primary;
  color: $text-on-accent;
  border-color: $accent-primary;

  &:hover { opacity: 0.9; }
}

.topic-cancel-btn {
  background: none;
  color: $text-secondary;

  &:hover { background: rgba(var(--text-muted-rgb), 0.06); }
}

// ─── Separator ──────────────────────────────────────────
.summary-separator {
  height: 1px;
  background: $border-color;
  margin: 0;
  flex-shrink: 0;
}

// ─── Menu ────────────────────────────────────────────────
.summary-menu {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 16px;
  border: none;
  background: none;
  color: $text-primary;
  font-size: 13px;
  cursor: pointer;
  transition: background-color $transition-fast;
  width: 100%;
  text-align: left;

  svg { flex-shrink: 0; color: $text-secondary; }
  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.menu-item--toggle {
  &.menu-item--active {
    svg { color: var(--accent-warning, #f59e0b); }
  }
}

.menu-item--active {
  svg { color: var(--accent-warning, #f59e0b); }
}

.menu-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-item-extra {
  font-size: 12px;
  color: $text-muted;
  font-weight: 500;
}

.menu-item-check {
  color: $accent-primary;
  display: flex;
  align-items: center;
}

.menu-item--danger {
  color: var(--error, #ef4444);

  svg { color: var(--error, #ef4444); }
  &:hover { background: rgba(var(--error-rgb), 0.06); }
}
</style>
