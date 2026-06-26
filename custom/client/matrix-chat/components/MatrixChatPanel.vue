<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useAuthStore } from '@/stores/hermes/auth'
import MatrixRoomList from './MatrixRoomList.vue'
import MatrixMessagePanel from './MatrixMessagePanel.vue'
import MatrixRightPanel from './MatrixRightPanel.vue'
import MatrixRoomHeader from './MatrixRoomHeader.vue'
import MatrixCreateRoomDialog from './MatrixCreateRoomDialog.vue'
import MatrixJoinRoomDialog from './MatrixJoinRoomDialog.vue'
import MatrixRedactDialog from './MatrixRedactDialog.vue'
import PageSidebarNav from '@/components/layout/PageSidebarNav.vue'
import '../styles/matrix-chat.scss'

const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const composerStore = useMatrixComposerStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const productTitle = 'Swarm Studio'
const tabTitle = computed(() => `${t('sidebar.matrixChat')} - ${productTitle}`)

watch(tabTitle, (value) => {
  document.title = value
}, { immediate: true })

const showCreateRoom = ref(false)
const showJoinRoom = ref(false)

// Sidebar state — default visible on desktop, hidden on mobile
const showSidebar = ref(
  typeof window === 'undefined' || !window.matchMedia('(max-width: 768px)').matches,
)
let mobileQuery: MediaQueryList | null = null
const isMobile = ref(false)

function handleMobileChange(e: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = e.matches
  if (e.matches && showSidebar.value) {
    showSidebar.value = false
  }
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
}

function openPageSidebar() {
  showSidebar.value = true
}

function openSettingsPage() {
  router.push({ name: 'hermes.cockpit' })
}

// Sync route params with store
const routeRoomId = computed(() => {
  const value = route.params.roomId
  return typeof value === 'string' && value.trim() ? value : null
})

watch(routeRoomId, (roomId) => {
  if (roomId && roomStore.activeRoomId !== roomId) {
    roomStore.selectRoom(roomId)
  }
}, { immediate: true })

// Auto-select first room when sync is ready and no room selected
watch(
  () => clientStore.syncState,
  (state) => {
    if (state === 'PREPARED' && !roomStore.activeRoomId && roomStore.sortedRooms.length > 0) {
      roomStore.selectRoom(roomStore.sortedRooms[0].roomId)
    }
  },
)

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 768px)')
  handleMobileChange(mobileQuery)
  mobileQuery.addEventListener('change', handleMobileChange)
  window.addEventListener('hermes:open-page-sidebar', openPageSidebar)
  clientStore.refreshCredentials()
  // Only init the client if not already running (persist across navigation)
  if (clientStore.authenticated && !clientStore.client) {
    clientStore.initClient()
  }
})

onUnmounted(() => {
  document.title = productTitle
  mobileQuery?.removeEventListener('change', handleMobileChange)
  window.removeEventListener('hermes:open-page-sidebar', openPageSidebar)
  // Do NOT disconnect the Matrix client on unmount — keep it alive across navigation.
  // Only disconnect when the user explicitly logs out (handled by store.logout()).
})
</script>

<template>
  <div class="matrix-chat-panel">
    <!-- Mobile backdrop -->
    <div class="sidebar-backdrop" :class="{ active: showSidebar }" @click="showSidebar = false" />

    <!-- Room sidebar -->
    <div v-if="showSidebar" class="room-sidebar">
      <div class="sidebar-header">
        <PageSidebarNav
          active="matrix"
          :primary-label="t('matrixChat.createRoom')"
          :hide-mode-switch="false"
          @primary="showCreateRoom = true"
        />
      </div>
      <MatrixRoomList />
      <div class="page-sidebar-bottom">
        <button class="page-sidebar-menu-btn" type="button" @click="showJoinRoom = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
          <span>{{ t('matrixChat.joinRoom') }}</span>
        </button>
        <button class="page-sidebar-menu-btn" type="button" @click="authStore.logout()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{{ t('sidebar.logout') }}</span>
        </button>
      </div>
    </div>

    <!-- Create/Join/Redact dialogs -->
    <MatrixCreateRoomDialog v-if="showCreateRoom" @close="showCreateRoom = false" />
    <MatrixJoinRoomDialog v-if="showJoinRoom" @close="showJoinRoom = false" />
    <MatrixRedactDialog v-if="composerStore.showRedactDialog" />

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- Header with sidebar toggle -->
      <div class="chat-header">
        <button class="icon-btn header-sidebar-toggle" @click="toggleSidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <template v-if="roomStore.activeRoomId && roomStore.activeRoom">
          <MatrixRoomHeader />
        </template>
        <template v-else>
          <span class="header-title-placeholder">{{ t('sidebar.matrixChat') }}</span>
        </template>
      </div>

      <!-- Content area with optional right panel (按 phase 分发:RoomSummary/MemberList/ThreadPanel/ThreadView) -->
      <div class="chat-content-wrapper">
        <div class="chat-main-content">
          <MatrixMessagePanel />
        </div>
        <MatrixRightPanel v-if="rightPanelStore.rightPanelPhase" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.matrix-chat-panel {
  display: flex;
  height: 100%;
  position: relative;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: $breakpoint-mobile) {
  .sidebar-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 110;
    opacity: 0;
    pointer-events: none;
    transition: opacity $transition-fast;

    &.active {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

// ─── Room Sidebar ────────────────────────────────────────

.room-sidebar {
  width: $sidebar-width;
  flex-shrink: 0;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px;
  flex-shrink: 0;
}

.page-sidebar-bottom {
  flex-shrink: 0;
  padding: 10px 12px;
}

.page-sidebar-menu-btn {
  width: 100%;
  min-width: 0;
  height: 36px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition:
    background-color $transition-fast,
    color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 18px;
  }
}

// ─── Chat Main ──────────────────────────────────────────

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 64px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.header-sidebar-toggle {
  flex-shrink: 0;
}

.header-title-placeholder {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-content-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  min-width: 0;
  max-width: 100%;
}

.chat-main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

// ─── Shared ──────────────────────────────────────────────

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  border-radius: $radius-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.08);
    color: $text-primary;
  }
}

// ─── Mobile ──────────────────────────────────────────────

@media (max-width: $breakpoint-mobile) {
  .room-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 120;
    background: $bg-card;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    width: $sidebar-width;
  }

  .chat-header {
    padding: 0 12px 0 12px;
  }

  .header-sidebar-toggle {
    display: none;
  }
}
</style>
