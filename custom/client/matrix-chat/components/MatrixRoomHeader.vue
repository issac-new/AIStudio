<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import MatrixInviteDialog from './MatrixInviteDialog.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const threadStore = useMatrixThreadStore()
const { t } = useI18n()

const showInviteDialog = ref(false)
/** Inline search input (shown in header when search active, element-web style) */
const showSearchInput = ref(false)
const searchInputValue = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// Watch room search term from RoomSummaryCard search bar → mirror value in header input only.
// Do not execute search here; user confirms with Enter or search button.
watch(
  () => roomStore.roomSearchTerm,
  (term) => {
    if (term && !showSearchInput.value) {
      showSearchInput.value = true
      searchInputValue.value = term
    }
  },
)

function onSearchInput() {
  roomStore.roomSearchTerm = searchInputValue.value
}

function doSearch() {
  const q = searchInputValue.value.trim()
  if (q) {
    roomStore.performRoomSearch(q)
  } else {
    roomStore.cancelRoomSearch()
    showSearchInput.value = false
  }
}

function handleSearch() {
  // First click opens/focuses the input. If input is already open and has text,
  // run search explicitly. This prevents searching while the user is still typing.
  if (!showSearchInput.value) {
    showSearchInput.value = true
    nextTick(() => searchInputRef.value?.focus())
    return
  }

  if (searchInputValue.value.trim()) {
    doSearch()
  } else if (roomStore.isSearching) {
    cancelSearch()
  } else {
    nextTick(() => searchInputRef.value?.focus())
  }
}

function cancelSearch() {
  roomStore.cancelRoomSearch()
  showSearchInput.value = false
  searchInputValue.value = ''
}

function onSearchKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    cancelSearch()
  }
}

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomName = computed(() => {
  void roomStore.roomVersion
  return room.value?.name || ''
})
const memberCount = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return 0
  return room.value.getJoinedMemberCount()
})
const avatarUrl = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomAvatarUrl(room.value, 40)
})
const isEncrypted = computed(() => room.value ? roomStore.isRoomEncrypted(room.value.roomId) : false)
const isPublic = computed(() => {
  void roomStore.roomVersion
  return roomStore.isRoomPublic(room.value)
})
const isRightPanelOpen = computed(() => rightPanelStore.rightPanelPhase !== null)
const isThreadPanelOpen = computed(
  () =>
    rightPanelStore.rightPanelPhase === 'ThreadPanel' ||
    rightPanelStore.rightPanelPhase === 'ThreadView',
)
const isDirectMessage = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return false
  return room.value.getJoinedMemberCount() === 2 && !isPublic.value
})

// FacePile: show first 3 joined members (like Element Web)
const facePileMembers = computed(() => {
  void roomStore.roomVersion
  if (!room.value || isDirectMessage.value) return []
  const members = room.value.getJoinedMembers()
  return members.slice(0, 3)
})

// Format member count (like Element's formatCount)
function formatCount(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1000000) return (count / 1000).toFixed(count % 1000 === 0 ? 0 : 1) + 'K'
  return (count / 1000000).toFixed(count % 1000000 === 0 ? 0 : 1) + 'M'
}

function getMemberAvatar(member: any): string | null {
  return roomStore.getUserAvatarUrl(member, 24)
}

function getMemberInitial(member: any): string {
  return (member.name ?? member.userId ?? '?').charAt(0).toUpperCase()
}

async function _handleLeaveRoom() {
  if (!roomStore.activeRoomId) return
  try {
    await roomStore.leaveRoom(roomStore.activeRoomId)
  } catch {
    // ignore
  }
}
void _handleLeaveRoom

function handleToggleRightPanel() {
  if (rightPanelStore.rightPanelPhase) {
    rightPanelStore.closeRightPanel()
  } else {
    rightPanelStore.openRoomSummary()
  }
}

function handleToggleThreadPanel() {
  threadStore.toggleThreadPanel()
}

function handleOpenInvite() {
  showInviteDialog.value = true
}

function handleOpenMemberList() {
  rightPanelStore.openMemberList()
}

function handleVideoCall() {
  window.alert(t('matrixChat.comingSoon'))
}

function handleVoiceCall() {
  window.alert(t('matrixChat.comingSoon'))
}

const roomTopic = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return ''
  return roomStore.getRoomTopic(room.value)
})
</script>

<template>
  <div v-if="room" class="matrix-room-header">
    <!-- Room avatar + name (clickable — opens right panel RoomSummary) -->
    <button class="room-header-info-btn" @click="handleToggleRightPanel">
      <div class="room-header-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="room-avatar-img" />
        <div v-else class="room-avatar-placeholder">{{ roomName.charAt(0).toUpperCase() }}</div>
      </div>
      <div class="room-header-text">
        <h3 class="room-header-name">
          <span class="room-header-name-text">{{ roomName }}</span>
          <!-- Inline badges like Element -->
          <span v-if="isPublic" class="room-header-inline-icon" title="Public room">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </span>
          <span v-if="isEncrypted" class="room-header-inline-icon" title="Encrypted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </span>
        </h3>
        <p v-if="roomTopic" class="room-header-topic">{{ roomTopic }}</p>
      </div>
    </button>

    <!-- Right side buttons (Element Web style) -->
    <div class="room-header-buttons">
      <!-- Inline search bar (shown when search active, element-web style) -->
      <div v-if="showSearchInput" class="header-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          ref="searchInputRef"
          v-model="searchInputValue"
          type="text"
          class="header-search-input"
          :placeholder="t('matrixChat.search') + '...'"
          @input="onSearchInput"
          @keydown.enter.prevent="doSearch"
          @keydown="onSearchKeydown"
        />
        <button v-if="searchInputValue" class="header-search-clear" @click="cancelSearch" :title="t('matrixChat.cancel')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <!-- Search button -->
      <button class="header-action-btn" :class="{ 'header-action-btn--active': roomStore.isSearching }" @click="handleSearch" :title="t('matrixChat.search')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      </button>

      <!-- Voice call button -->
      <button class="header-action-btn" @click="handleVoiceCall" :title="t('matrixChat.voiceCall')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
      </button>

      <!-- Video call button -->
      <button class="header-action-btn" @click="handleVideoCall" :title="t('matrixChat.videoCall')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
      </button>

      <!-- Invite button (+ icon) -->
      <button class="header-action-btn" :disabled="isDirectMessage" @click="handleOpenInvite" :title="t('matrixChat.inviteUser')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      <!-- FacePile: member avatars + count (Element style, only for non-DM rooms) -->
      <button v-if="!isDirectMessage && facePileMembers.length > 0" class="header-facepile-btn" @click="handleOpenMemberList" :title="t('matrixChat.roomMembers')">
        <div class="facepile-stack">
          <span
            v-for="(member, idx) in facePileMembers"
            :key="member.userId"
            class="facepile-item"
            :style="{ zIndex: facePileMembers.length - idx }"
          >
            <img v-if="getMemberAvatar(member)" :src="getMemberAvatar(member)!" alt="" class="facepile-avatar-img" />
            <div v-else class="facepile-avatar-placeholder">{{ getMemberInitial(member) }}</div>
          </span>
        </div>
        <span class="facepile-count">{{ formatCount(memberCount) }}</span>
      </button>

      <!-- Threads button (with notification indicator) -->
      <button class="header-action-btn" :class="{ 'header-action-btn--active': isThreadPanelOpen }" @click="handleToggleThreadPanel" :title="t('matrixChat.threads')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span v-if="threadStore.hasThreadNotifications && !isThreadPanelOpen" class="thread-notification-dot" />
      </button>

      <!-- Room Info button (i icon) -->
      <button class="header-action-btn" :class="{ 'header-action-btn--active': isRightPanelOpen }" @click="handleToggleRightPanel" :title="t('matrixChat.roomInfo')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
      </button>
    </div>

    <!-- Invite dialog -->
    <MatrixInviteDialog v-if="showInviteDialog" @close="showInviteDialog = false" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-room-header {
  display: flex;
  align-items: center;
  gap: var(--cpd-space-3x, 12px);
  flex: 1;
  min-width: 0;
}

.room-header-info-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  border-radius: $radius-sm;
  transition: background-color $transition-fast;
  text-align: left;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
}

.room-header-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.room-avatar-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.room-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.room-header-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.room-header-name {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.room-header-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-header-topic {
  font-size: 12px;
  color: $text-muted;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-header-inline-icon {
  flex-shrink: 0;
  color: var(--cpd-color-icon-info-primary, $accent-info);
  display: flex;
  align-items: center;
}

// ─── Right side buttons (Element style) ─────────────────

.room-header-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-action-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all $transition-fast;
  position: relative;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
    color: $accent-primary;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.header-action-btn--active {
  background: rgba(var(--accent-primary-rgb), 0.08);
  color: $accent-primary;
}

// ─── Inline search bar ──────────────────────────────────

.header-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  transition: border-color $transition-fast;

  &:focus-within { border-color: $accent-primary; }

  svg { color: $text-muted; flex-shrink: 0; }
}

.header-search-input {
  width: 160px;
  border: none;
  background: none;
  outline: none;
  font-size: 13px;
  color: $text-primary;

  &::placeholder { color: $text-muted; }
}

.header-search-clear {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover { background: rgba(var(--text-muted-rgb), 0.1); color: $text-primary; }
}

// ─── Thread notification dot ──────────────────────────────
.thread-notification-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary, #3b82f6);
  border: 2px solid var(--bg-card, #fff);
}

// ─── FacePile (Element style) ───────────────────────────

.header-facepile-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: $radius-sm;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
}

.facepile-stack {
  display: flex;
  align-items: center;
}

.facepile-item {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--cpd-color-bg-subtle-primary, $bg-card);
  margin-left: -8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $bg-secondary;
  transition: transform $transition-fast;

  &:first-child {
    margin-left: 0;
  }

  &:hover {
    transform: translateY(-1px);
  }
}

.facepile-avatar-img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.facepile-avatar-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}

.facepile-count {
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
}
</style>
