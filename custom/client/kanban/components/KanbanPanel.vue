<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageSidebarNav from '@/components/layout/PageSidebarNav.vue'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'

const { t } = useI18n()
const router = useRouter()

// Mobile sidebar visibility — mirrors ChatPanel behaviour so the hamburger
// button (which dispatches `hermes:open-page-sidebar`) works here too.
const showSidebar = ref(true)

function syncSidebarWithViewport() {
  const mobileQuery = window.matchMedia('(max-width: 768px)')
  showSidebar.value = !mobileQuery.matches
}

function openPageSidebar() {
  showSidebar.value = true
}

onMounted(() => {
  syncSidebarWithViewport()
  window.addEventListener('hermes:open-page-sidebar', openPageSidebar)
})

onUnmounted(() => {
  window.removeEventListener('hermes:open-page-sidebar', openPageSidebar)
})

function openSettingsPage() {
  void router.push({ name: 'hermes.settings' })
}
</script>

<template>
  <div class="kanban-panel">
    <div
      class="sidebar-backdrop"
      :class="{ active: showSidebar }"
      @click="showSidebar = false"
    />
    <aside
      class="kanban-sidebar"
      :class="{ collapsed: !showSidebar }"
    >
      <div v-if="showSidebar" class="page-sidebar-top">
        <PageSidebarNav
          active="swarm-kanban"
          :primary-label="t('chat.newChat')"
          @primary="router.push({ name: 'hermes.chat' })"
        />
      </div>

      <div v-if="showSidebar" class="kanban-sidebar-spacer" />

      <div v-if="showSidebar" class="page-sidebar-bottom">
        <button class="page-sidebar-menu-btn" type="button" @click="openSettingsPage">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{{ t('sidebar.settings') }}</span>
        </button>
      </div>
    </aside>

    <div class="kanban-main">
      <SwarmKanbanView />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.kanban-panel {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.kanban-sidebar {
  width: $sidebar-width;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition:
    width $transition-normal,
    opacity $transition-normal;
  overflow: hidden;

  &.collapsed {
    width: 0;
    border-right: none;
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: $breakpoint-mobile) {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 120;
    background: $bg-card;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    width: $sidebar-width;

    &.collapsed {
      transform: translateX(-100%);
      opacity: 0;
    }
  }
}

.kanban-sidebar-spacer {
  flex: 1;
  min-height: 0;
}

.page-sidebar-top {
  flex-shrink: 0;
  padding: 12px;
  border-bottom: 1px solid $border-color;
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

.kanban-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: $breakpoint-mobile) {
  .sidebar-backdrop {
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
</style>
