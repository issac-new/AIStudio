<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

interface InviteTarget {
  userId: string
  displayName: string | null
  avatarUrl: string | null
}

const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const emit = defineEmits<{ close: [] }>()

// ─── State ──────────────────────────────────────────────
const searchQuery = ref('')
const selectedTargets = ref<InviteTarget[]>([])
const serverResults = ref<InviteTarget[]>([])
const isSearching = ref(false)
const isInviting = ref(false)
const inviteError = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const roomId = computed(() => roomStore.activeRoomId)
const roomName = computed(() => {
  void roomStore.roomVersion
  const room = roomStore.activeRoom
  return room?.name || t('matrixChat.noRoomSelected')
})

// ─── Existing room members ─────────────────────────────
const existingMemberIds = computed(() => {
  void roomStore.roomVersion
  const groups = roomStore.getRoomMemberList(roomId.value ?? '')
  const all = [...groups.admins, ...groups.mods, ...groups.defaults, ...groups.invited]
  return new Set(all.map((m: any) => m.userId))
})

// ─── Suggestions: room members who are not in the room yet (from contacts) ───
const suggestions = computed(() => {
  void roomStore.roomVersion
  const groups = roomStore.getRoomMemberList(roomId.value ?? '')
  // Show all known users except those already in this room
  const allKnown = [...groups.admins, ...groups.mods, ...groups.defaults]
  return allKnown
    .filter((m: any) => !existingMemberIds.value.has(m.userId))
    .slice(0, 8)
})

// ─── Combined filtered results ──────────────────────────
const combinedResults = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  // Start with server results (from user directory search)
  const base = serverResults.value.filter(u => !existingMemberIds.value.has(u.userId))

  // If no search query, also add suggestions (room members from other rooms)
  if (!q) {
    const suggestionUsers = suggestions.value.map((m: any) => ({
      userId: m.userId,
      displayName: m.name || null,
      avatarUrl: m.getMxcAvatarUrl?.() || null,
    }))
    // Merge, avoiding duplicates
    const seen = new Set(base.map(u => u.userId))
    for (const s of suggestionUsers) {
      if (!seen.has(s.userId) && !selectedTargets.value.some(t => t.userId === s.userId)) {
        base.push(s)
        seen.add(s.userId)
      }
    }
  } else {
    // Filter both server results and suggestions by query
    const suggestionUsers = suggestions.value
      .filter((m: any) => {
        const name = (m.name ?? '').toLowerCase()
        const uid = (m.userId ?? '').toLowerCase()
        return name.includes(q) || uid.includes(q)
      })
      .map((m: any) => ({
        userId: m.userId,
        displayName: m.name || null,
        avatarUrl: m.getMxcAvatarUrl?.() || null,
      }))
    const seen = new Set(base.map(u => u.userId))
    for (const s of suggestionUsers) {
      if (!seen.has(s.userId) && !selectedTargets.value.some(t => t.userId === s.userId)) {
        base.push(s)
        seen.add(s.userId)
      }
    }
  }

  // Remove already selected targets
  return base.filter(u => !selectedTargets.value.some(t => t.userId === u.userId))
})

// ─── Debounced search ──────────────────────────────────
function handleInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  const query = searchQuery.value.trim()
  if (!query) {
    serverResults.value = []
    return
  }
  debounceTimer = setTimeout(() => doSearch(query), 200)
}

async function doSearch(query: string) {
  isSearching.value = true
  try {
    serverResults.value = await roomStore.searchUserDirectory(query)
  } catch {
    serverResults.value = []
  } finally {
    isSearching.value = false
  }
}

// ─── Select / remove targets ────────────────────────────
function toggleTarget(user: InviteTarget) {
  const idx = selectedTargets.value.findIndex(t => t.userId === user.userId)
  if (idx >= 0) {
    selectedTargets.value.splice(idx, 1)
  } else {
    selectedTargets.value.push(user)
    searchQuery.value = ''
    serverResults.value = []
  }
}

function removeTarget(user: InviteTarget) {
  selectedTargets.value = selectedTargets.value.filter(t => t.userId !== user.userId)
}

// ─── Invite all selected targets ────────────────────────
const canInvite = computed(() => selectedTargets.value.length > 0 || (searchQuery.value.trim().includes('@') && searchQuery.value.trim().length > 1))

async function handleInviteAll() {
  if (!roomId.value) return

  // If the search query looks like a Matrix ID and no targets are selected, add it as a target
  const query = searchQuery.value.trim()
  if (query.startsWith('@') && query.includes(':') && !selectedTargets.value.some(t => t.userId === query)) {
    selectedTargets.value.push({ userId: query, displayName: null, avatarUrl: null })
  }

  isInviting.value = true
  inviteError.value = null

  const failed: string[] = []
  for (const target of selectedTargets.value) {
    try {
      await roomStore.inviteUser(roomId.value!, target.userId)
    } catch {
      failed.push(target.userId)
    }
  }

  if (failed.length > 0) {
    inviteError.value = t('matrixChat.inviteFailed') + ': ' + failed.join(', ')
  }

  // Remove successfully invited targets
  selectedTargets.value = selectedTargets.value.filter(t => failed.includes(t.userId))

  isInviting.value = false

  // If all invites succeeded, close the dialog
  if (failed.length === 0) {
    emit('close')
  }
}

// ─── Avatar helpers ─────────────────────────────────────
function getUserAvatar(user: InviteTarget): string | null {
  if (!user.avatarUrl) return null
  return roomStore.getUserAvatarUrl(
    { userId: user.userId, avatarUrl: user.avatarUrl, getMxcAvatarUrl: () => user.avatarUrl },
    36,
  )
}

function getInitial(name: string | null, userId: string): string {
  return (name || userId).charAt(0).toUpperCase()
}

// ─── Cleanup ────────────────────────────────────────────
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="invite-dialog-backdrop" @click.self="emit('close')">
    <div class="invite-dialog">
      <!-- Header -->
      <div class="invite-dialog-header">
        <h3 class="invite-dialog-title">{{ t('matrixChat.inviteToRoom', { roomName }) }}</h3>
        <button class="invite-dialog-close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <!-- Body -->
      <div class="invite-dialog-body">
        <!-- Help text -->
        <p class="invite-dialog-help">{{ t('matrixChat.searchUsersHint') }}</p>

        <!-- Address bar: selected pills + search input + invite button -->
        <div class="invite-address-bar">
          <!-- Selected user pills -->
          <div v-for="target in selectedTargets" :key="target.userId" class="invite-pill">
            <div class="invite-pill-avatar">
              <img v-if="getUserAvatar(target)" :src="getUserAvatar(target)!" alt="" class="pill-avatar-img" />
              <div v-else class="pill-avatar-placeholder">{{ getInitial(target.displayName, target.userId) }}</div>
            </div>
            <span class="invite-pill-name">{{ target.displayName || target.userId }}</span>
            <button class="invite-pill-remove" :disabled="isInviting" @click="removeTarget(target)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <!-- Search input -->
          <input
            v-model="searchQuery"
            class="invite-search-input"
            :placeholder="selectedTargets.length > 0 ? '' : t('matrixChat.searchUsers')"
            :disabled="isInviting"
            autofocus
            @input="handleInput"
          />
          <!-- Invite/Go button -->
          <button
            class="invite-go-btn"
            :disabled="!canInvite || isInviting"
            @click="handleInviteAll"
          >
            {{ isInviting ? t('common.loading') : t('matrixChat.inviteUser') }}
          </button>
        </div>

        <!-- Error -->
        <div v-if="inviteError" class="invite-error">{{ inviteError }}</div>

        <!-- Searching indicator -->
        <div v-if="isSearching" class="invite-loading">
          <div class="invite-spinner" />
          {{ t('common.loading') }}
        </div>

        <!-- User sections -->
        <div v-else-if="!isInviting" class="invite-user-sections">
          <!-- Suggestions section (shown when no search query) -->
          <div v-if="!searchQuery.trim() && combinedResults.length > 0" class="invite-section">
            <h4 class="invite-section-title">{{ t('matrixChat.suggestions') }}</h4>
            <div
              v-for="user in combinedResults.slice(0, 5)"
              :key="user.userId"
              class="invite-user-row"
              :class="{ 'invite-user-row--selected': selectedTargets.some(t => t.userId === user.userId) }"
              @click="toggleTarget(user)"
            >
              <div class="invite-user-avatar">
                <img v-if="getUserAvatar(user)" :src="getUserAvatar(user)!" alt="" class="user-avatar-img" />
                <div v-else class="user-avatar-placeholder">{{ getInitial(user.displayName, user.userId) }}</div>
              </div>
              <div class="invite-user-info">
                <span class="invite-user-name">{{ user.displayName || user.userId }}</span>
                <span class="invite-user-id">{{ user.userId }}</span>
              </div>
              <div class="invite-user-check">
                <svg v-if="selectedTargets.some(t => t.userId === user.userId)" width="18" height="18" viewBox="0 0 24 24" fill="var(--accent-primary)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </div>
            </div>
          </div>

          <!-- Search results section -->
          <div v-if="searchQuery.trim() && combinedResults.length > 0" class="invite-section">
            <h4 class="invite-section-title">{{ t('matrixChat.searchUsers') }}</h4>
            <div
              v-for="user in combinedResults"
              :key="user.userId"
              class="invite-user-row"
              :class="{ 'invite-user-row--selected': selectedTargets.some(t => t.userId === user.userId) }"
              @click="toggleTarget(user)"
            >
              <div class="invite-user-avatar">
                <img v-if="getUserAvatar(user)" :src="getUserAvatar(user)!" alt="" class="user-avatar-img" />
                <div v-else class="user-avatar-placeholder">{{ getInitial(user.displayName, user.userId) }}</div>
              </div>
              <div class="invite-user-info">
                <span class="invite-user-name">{{ user.displayName || user.userId }}</span>
                <span class="invite-user-id">{{ user.userId }}</span>
              </div>
              <div class="invite-user-check">
                <svg v-if="selectedTargets.some(t => t.userId === user.userId)" width="18" height="18" viewBox="0 0 24 24" fill="var(--accent-primary)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </div>
            </div>
          </div>

          <!-- No results -->
          <div v-if="searchQuery.trim() && combinedResults.length === 0 && !isSearching" class="invite-empty">
            {{ t('matrixChat.noUsersFound') }}
          </div>
        </div>

        <!-- Invite in progress -->
        <div v-if="isInviting" class="invite-loading">
          <div class="invite-spinner" />
          {{ t('matrixChat.inviteSending') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.invite-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.invite-dialog {
  background: $bg-card;
  border-radius: $radius-lg;
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.invite-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;
}

.invite-dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-dialog-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--text-muted-rgb), 0.08); color: $text-primary; }
}

.invite-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.invite-dialog-help {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  line-height: 1.5;
}

// ─── Address bar (pills + input + button) ────────────────
.invite-address-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
  min-height: 40px;
}

.invite-search-input {
  flex: 1;
  min-width: 120px;
  height: 28px;
  padding: 0 4px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: $text-primary;
  outline: none;

  &::placeholder { color: $text-muted; }
}

.invite-go-btn {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: $radius-sm;
  background: $accent-primary;
  color: $text-on-accent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity $transition-fast;
  flex-shrink: 0;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

// ─── Selected user pills ────────────────────────────────
.invite-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 2px;
  background: rgba(var(--accent-primary-rgb), 0.08);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  border-radius: 16px;
  flex-shrink: 0;
}

.invite-pill-avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.pill-avatar-img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.pill-avatar-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.invite-pill-name {
  font-size: 13px;
  color: $text-primary;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-pill-remove {
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: color $transition-fast;

  &:hover { color: $error; }
  &:disabled { cursor: not-allowed; opacity: 0.4; }
}

// ─── Error ──────────────────────────────────────────────
.invite-error {
  padding: 8px 12px;
  background: rgba(var(--error-rgb), 0.06);
  color: $error;
  border-radius: $radius-sm;
  font-size: 13px;
}

// ─── Loading ────────────────────────────────────────────
.invite-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: $text-muted;
  font-size: 14px;
}

.invite-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// ─── User sections ──────────────────────────────────────
.invite-user-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.invite-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.invite-section-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  margin: 0 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.invite-user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
  &.invite-user-row--selected { background: rgba(var(--accent-primary-rgb), 0.08); }
}

.invite-user-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.user-avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.invite-user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.invite-user-name {
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-user-id {
  font-size: 12px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-user-check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.invite-empty {
  padding: 24px;
  text-align: center;
  color: $text-muted;
  font-size: 14px;
}
</style>
