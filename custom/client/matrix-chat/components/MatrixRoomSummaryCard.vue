<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixInviteDialog from './MatrixInviteDialog.vue'
import MatrixShareDialog from './MatrixShareDialog.vue'
import MatrixReportDialog from './MatrixReportDialog.vue'
import MatrixExportDialog from './MatrixExportDialog.vue'
import MatrixLeaveRoomDialog from './MatrixLeaveRoomDialog.vue'
import MatrixClearMessagesDialog from './MatrixClearMessagesDialog.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const showInviteDialog = ref(false)
const showShareDialog = ref(false)
const showReportDialog = ref(false)
const showExportDialog = ref(false)
const showAvatarViewer = ref(false)
const showLeaveDialog = ref(false)
const showClearMessagesDialog = ref(false)
const topicExpanded = ref(true)
const searchInputRef = ref<HTMLInputElement | null>(null)

// ─── Room data ──────────────────────────────────────────────

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const roomName = computed(() => {
  void roomStore.roomVersion
  return room.value?.name ?? ''
})
const roomAlias = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomAlias(room.value)
})
const roomId = computed(() => room.value?.roomId ?? '')

const memberCount = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return 0
  return room.value.getJoinedMemberCount()
})

const topic = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomTopic(room.value)
})
const hasTopic = computed(() => !!topic.value)
// HERMES_CUSTOM[SecXssTopic] BEGIN: 房间 topic 是任意 Matrix 用户可控内容，
// 必须先 HTML 转义再做 URL 自动链接，否则 <img onerror=...> 等将经 v-html 执行（存储型 XSS）。
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
const displayedTopic = computed(() => {
  void roomStore.roomVersion
  if (!topic.value) return ''
  // 先转义，确保原始 < > & " ' 不被解释为 HTML
  let text = escapeHtml(topic.value)
  // 截断在转义后进行（避免切断实体）
  if (!topicExpanded.value && topic.value.length > 200) {
    text = text.slice(0, 200) + '...'
  }
  // 再对转义后的文本做 URL 自动链接；URL 本身已被转义（& → &amp;），可直接入 href
  text = text.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  // Auto-link matrix.to links
  text = text.replace(
    /(matrix:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  return text
})
// HERMES_CUSTOM[SecXssTopic] END

const topicNeedsExpand = computed(() => {
  return (topic.value?.length ?? 0) > 200
})

const canEditTopic = computed(() => {
  void roomStore.roomVersion
  return roomStore.canEditTopic()
})
const isFavorite = computed(() => {
  void roomStore.roomVersion
  return roomStore.isRoomFavorite()
})
const avatarUrl = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomAvatarUrl(room.value, 80)
})
const avatarLargeUrl = computed(() => {
  void roomStore.roomVersion
  return roomStore.getRoomAvatarUrl(room.value, 320)
})

// ─── Badge state (aligned with element-web) ────────────────

const isEncrypted = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return false
  return roomStore.isRoomEncrypted(room.value.roomId)
})

const isPublic = computed(() => {
  void roomStore.roomVersion
  return roomStore.isRoomPublic(room.value)
})

const isDm = computed(() => {
  void roomStore.roomVersion
  return roomStore.isDirectMessage(room.value)
})

const e2eStatus = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return 'normal'
  return roomStore.getE2EStatus(room.value.roomId)
})

const historyVisibility = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return ''
  return roomStore.getHistoryVisibility(room.value)
})

const isVideoRoom = computed(() => {
  void roomStore.roomVersion
  return roomStore.isVideoRoom(room.value)
})

const canInvite = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return false
  return roomStore.canInviteToRoom(room.value)
})

const pinnedCount = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return 0
  return roomStore.getPinnedEventCount(room.value)
})

// ─── Search state (element-web: RoomSummaryCard search bar) ──

const searchTerm = computed({
  get: () => roomStore.roomSearchTerm,
  set: (val) => {
    roomStore.roomSearchTerm = val
    // Trigger inline search with debounce (element-web uses 300ms)
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      if (val.trim()) {
        roomStore.performRoomSearch(val)
      }
    }, 300)
  },
})
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  // searchTerm setter handles debounced search
}

function onSearchKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    roomStore.cancelRoomSearch()
  }
}

// ─── History visibility label ─────────────────────────────

const historyVisibilityLabel = computed(() => {
  switch (historyVisibility.value) {
    case 'world_readable': return t('matrixChat.historyWorldReadable')
    case 'shared': return t('matrixChat.historyShared')
    case 'invited': return t('matrixChat.historyInvited')
    case 'joined': return t('matrixChat.historyJoined')
    default: return ''
  }
})

const showHistoryVisibility = computed(() => {
  return !!historyVisibility.value
})

// ─── Actions ──────────────────────────────────────────────

function handleInviteMembers() {
  showInviteDialog.value = true
}

function handleOpenMemberList() {
  rightPanelStore.openMemberList()
}

function handleOpenThreadPanel() {
  rightPanelStore.openThreadPanel()
}

function handleOpenPinnedMessages() {
  rightPanelStore.openPinnedMessages()
}

function handleOpenFilePanel() {
  rightPanelStore.openFilePanel()
}

function handleOpenExtensions() {
  rightPanelStore.openExtensions()
}

function handleOpenRoomSettings() {
  rightPanelStore.openRoomSettings()
}

function handleShareLink() {
  showShareDialog.value = true
}

function handleReportRoom() {
  showReportDialog.value = true
}

function handleExportChat() {
  showExportDialog.value = true
}

function handleOpenPollHistory() {
  rightPanelStore.openPollHistory()
}

async function handleLeaveRoom(_force = false) {
  showLeaveDialog.value = true
}

async function handleToggleFavorite() {
  try {
    await roomStore.toggleRoomFavorite()
  } catch {
    // ignore
  }
}

function handleEditTopic() {
  // Element-web: edit opens room settings. We open RoomSettings phase in right panel.
  rightPanelStore.openRoomSettings()
}

function handleTopicLinkClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement
  if (target?.tagName === 'A') {
    // External link in topic — let browser handle it
    return
  }
}
</script>

<template>
  <div v-if="room" class="room-summary-card">
    <!-- Search bar (like element-web RoomSummaryCard header) -->
    <div class="summary-search">
      <form class="summary-search-form" @submit.prevent="">
        <input
          ref="searchInputRef"
          v-model="searchTerm"
          type="text"
          class="summary-search-input"
          :placeholder="t('matrixChat.search')"
          @input="onSearchInput"
          @keydown="onSearchKeydown"
        />
      </form>
    </div>

    <!-- Header: Centered avatar + name + alias -->
    <header class="summary-header">
      <div class="summary-avatar" :class="{ 'summary-avatar--clickable': avatarLargeUrl }" @click="avatarLargeUrl && (showAvatarViewer = true)">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="summary-avatar-img" />
        <div v-else class="summary-avatar-placeholder">{{ roomName.charAt(0).toUpperCase() }}</div>
      </div>
      <h1 class="summary-room-name" :title="roomName">{{ roomName }}</h1>
      <div v-if="roomAlias" class="summary-room-alias" :title="roomAlias">{{ roomAlias }}</div>
    </header>

    <!-- Badges (aligned with element-web: public, encrypted, unencrypted, not-trusted, history-visibility) -->
    <div class="summary-badges">
      <!-- Public room (not shown for DMs, matching element-web) -->
      <span v-if="!isDm && isPublic" class="summary-badge summary-badge--public">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        {{ t('matrixChat.roomPublic') }}
      </span>

      <!-- Encrypted (with green lock, matching element-web) -->
      <span v-if="isEncrypted && e2eStatus !== 'warning'" class="summary-badge summary-badge--encrypted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        {{ t('matrixChat.roomEncryption') }}
      </span>

      <!-- Unencrypted (with lock-off icon) -->
      <span v-if="!isEncrypted" class="summary-badge summary-badge--unencrypted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 3.5 1.5" /></svg>
        {{ t('matrixChat.unencrypted') }}
      </span>

      <!-- E2E Not Trusted (red badge, matching element-web) -->
      <span v-if="e2eStatus === 'warning'" class="summary-badge summary-badge--not-trusted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 20h20L12 2z" /><line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2" /><circle cx="12" cy="17" r="1" fill="white" /></svg>
        {{ t('matrixChat.notTrusted') }}
      </span>

      <!-- History Visibility (matching element-web HistoryVisibilityBadge) -->
      <span v-if="showHistoryVisibility" class="summary-badge summary-badge--history">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        {{ historyVisibilityLabel }}
      </span>
    </div>

    <!-- Topic section (always expand/collapse, like element-web) -->
    <div class="summary-topic">
      <template v-if="hasTopic">
        <div class="summary-topic-container">
          <p
            class="summary-topic-text"
            :class="{ 'summary-topic-text--collapsed': !topicExpanded }"
            @click="handleTopicLinkClick"
            v-html="displayedTopic"
          />
          <button class="summary-topic-chevron" @click="topicExpanded = !topicExpanded">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              :style="{ transform: topicExpanded ? 'rotate(180deg)' : '' }">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <button v-if="canEditTopic && topicExpanded" class="summary-topic-edit" @click="handleEditTopic">
          {{ t('matrixChat.edit') }}
        </button>
      </template>
      <button v-else-if="canEditTopic" class="summary-topic-add" @click="handleEditTopic">
        {{ t('matrixChat.addTopic') }}
      </button>
    </div>

    <!-- Separator -->
    <div class="summary-separator" />

    <!-- Menu items (order matches element-web RoomSummaryCardView) -->
    <div class="summary-menu" role="menubar" aria-orientation="vertical">

      <!-- Group 1: Favorite + Invite -->
      <button
        class="menu-item menu-item--toggle"
        :class="{ 'menu-item--active': isFavorite }"
        role="menuitem"
        @click="handleToggleFavorite"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" :fill="isFavorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span class="menu-item-label">{{ t('matrixChat.favorite') }}</span>
        <span v-if="isFavorite" class="menu-item-check">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      </button>

      <button
        class="menu-item"
        role="menuitem"
        :disabled="!canInvite"
        @click="handleInviteMembers"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.inviteUser') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 2: People + Threads + Pinned Messages + Files + Extensions -->
      <button class="menu-item" role="menuitem" @click="handleOpenMemberList">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.people') }}</span>
      </button>

      <button class="menu-item" role="menuitem" @click="handleOpenThreadPanel">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.threadsMenu') }}</span>
      </button>

      <!-- Pinned Messages (with count, matching element-web) — not shown for video rooms -->
      <button v-if="!isVideoRoom" class="menu-item" role="menuitem" @click="handleOpenPinnedMessages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="17.66 7.34 12 2.34 6.34 7.34" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.pinnedMessages') }}</span>
        <span v-if="pinnedCount > 0" class="menu-item-extra">{{ pinnedCount }}</span>
      </button>

      <!-- Files — not shown for video rooms -->
      <button v-if="!isVideoRoom" class="menu-item" role="menuitem" @click="handleOpenFilePanel">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.filesMenu') }}</span>
      </button>

      <!-- Extensions — not shown for video rooms -->
      <button v-if="!isVideoRoom" class="menu-item" role="menuitem" @click="handleOpenExtensions">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.extensionsMenu') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 3: Copy Link + Polls + Export Chat -->
      <button class="menu-item" role="menuitem" @click="handleShareLink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.copyLink') }}</span>
      </button>

      <!-- Poll History — not shown for video rooms -->
      <button v-if="!isVideoRoom" class="menu-item" role="menuitem" @click="handleOpenPollHistory">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H3v7h7V3z" /><path d="M21 3h-7v7h7V3z" /><path d="M21 14h-7v7h7v-7z" /><path d="M10 14H3v7h7v-7z" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.pollsMenu') }}</span>
      </button>

      <!-- Export Chat — not shown for video rooms -->
      <button v-if="!isVideoRoom" class="menu-item" role="menuitem" @click="handleExportChat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.exportChatMenu') }}</span>
      </button>

      <!-- Room Settings -->
      <button class="menu-item" role="menuitem" @click="handleOpenRoomSettings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.roomSettings') }}</span>
      </button>

      <!-- Clear All Messages -->
      <button class="menu-item menu-item--critical" role="menuitem" @click="showClearMessagesDialog = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
        <span class="menu-item-label">{{ t('matrixChat.clearAllMessages') }}</span>
      </button>

      <div class="summary-separator" />

      <!-- Group 4: Report + Leave Room (danger actions, matching element-web bottom options) -->
      <div class="summary-bottom-options">
        <button class="menu-item menu-item--critical" role="menuitem" @click="handleReportRoom">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span class="menu-item-label">{{ t('matrixChat.reportRoom') }}</span>
        </button>

        <button
          class="menu-item menu-item--critical"
          role="menuitem"
          @click="handleLeaveRoom"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          <span class="menu-item-label">{{ t('matrixChat.leaveRoom') }}</span>
        </button>
      </div>
    </div>

    <!-- Dialogs -->
    <MatrixInviteDialog v-if="showInviteDialog" @close="showInviteDialog = false" />
    <MatrixShareDialog v-if="showShareDialog" @close="showShareDialog = false" />
    <MatrixReportDialog v-if="showReportDialog" @close="(leave?: boolean) => { showReportDialog = false; if (leave) handleLeaveRoom(true) }" />
    <MatrixExportDialog v-if="showExportDialog" @close="showExportDialog = false" />
    <MatrixLeaveRoomDialog v-if="showLeaveDialog" @close="showLeaveDialog = false" />
    <MatrixClearMessagesDialog v-if="showClearMessagesDialog" @close="showClearMessagesDialog = false" />

    <!-- Avatar viewer (full-size, like element-web viewAvatarOnClick) -->
    <div v-if="showAvatarViewer" class="avatar-viewer-overlay" @click="showAvatarViewer = false">
      <img v-if="avatarLargeUrl" :src="avatarLargeUrl" :alt="roomName" class="avatar-viewer-img" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.room-summary-card {
  display: flex;
  flex-direction: column;
  padding: 0;
}

// ─── Search ──────────────────────────────────────────────

.summary-search {
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.summary-search-form {
  margin: 0;
}

.summary-search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: $accent-primary;
  }

  &::placeholder {
    color: $text-muted;
  }
}

// ─── Header ──────────────────────────────────────────────

.summary-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 12px;
  gap: 8px;
}

.summary-avatar {
  width: 80px;
  height: 80px;
  flex-shrink: 0;

  &--clickable {
    cursor: pointer;
    transition: opacity $transition-fast;

    &:hover { opacity: 0.85; }
  }
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
  background: rgba(var(--success-rgb, 34 197 94), 0.1);
  color: var(--success, #22c55e);
}

.summary-badge--public {
  background: rgba(var(--accent-info-rgb, 59 130 246), 0.1);
  color: var(--accent-info, #3b82f6);
}

.summary-badge--unencrypted {
  background: rgba(var(--accent-info-rgb, 59 130 246), 0.1);
  color: var(--accent-info, #3b82f6);
}

.summary-badge--not-trusted {
  background: rgba(var(--error-rgb, 239 68 68), 0.1);
  color: var(--error, #ef4444);
}

.summary-badge--history {
  background: rgba(var(--text-muted-rgb, 148 163 184), 0.08);
  color: $text-secondary;
}

// ─── Topic ───────────────────────────────────────────────

.summary-topic {
  padding: 0 16px 12px;
}

.summary-topic-container {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.summary-topic-text {
  flex: 1;
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
  word-break: break-word;
  margin: 0;

  &--collapsed {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  :deep(a) {
    color: $accent-primary;
    text-decoration: none;

    &:hover { text-decoration: underline; }
  }
}

.summary-topic-chevron {
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: $radius-sm;
  transition: all $transition-fast;
  margin-top: 2px;

  &:hover { color: $accent-primary; background: rgba(var(--accent-primary-rgb), 0.06); }
}

.summary-topic-edit {
  font-size: 12px;
  color: $accent-primary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: 4px;
  text-align: left;

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

  &:hover:not(:disabled) {
    background: rgba(var(--accent-primary-rgb), 0.06);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
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

.menu-item--critical {
  color: var(--error, #ef4444);

  svg { color: var(--error, #ef4444); }

  &:hover:not(:disabled) {
    background: rgba(var(--error-rgb), 0.06);
  }
}

.menu-item--confirming {
  font-weight: 700;
  background: rgba(var(--error-rgb), 0.08);
}

.summary-bottom-options {
  display: flex;
  flex-direction: column;
}

// ─── Avatar viewer ──────────────────────────────────────

.avatar-viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  cursor: zoom-out;
}

.avatar-viewer-img {
  max-width: 80vw;
  max-height: 80vh;
  border-radius: 50%;
  object-fit: cover;
}
</style>
