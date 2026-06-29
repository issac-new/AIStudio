<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixSpinner from './MatrixSpinner.vue'
import MatrixContextMenu from './MatrixContextMenu.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const threadStore = useMatrixThreadStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

// ─── Fetch threads from server on mount ──────────────────
onMounted(() => {
  threadStore.initRoomThreads()
})

const filter = computed(() => rightPanelStore.rightPanelThreadFilter)
const timelineSet = computed(() => roomStore.getThreadsTimelineSet(filter.value))
// 加载态:initRoomThreads 在跑(createThreadsTimelineSets/fetchRoomThreads)期间为 true
const loading = computed(() => threadStore.threadsLoading)

const hasThreads = computed(() => {
  try {
    return threadStore.getRoomThreads().length > 0
  } catch {
    return false
  }
})

const emptyState = computed(() => ({
  title: t('matrixChat.noThreadsTitle'),
  description: t('matrixChat.noThreadsDesc'),
}))

// ─── Filter dropdown(对齐 element-web ThreadPanelHeader) ───
const menuOpen = ref(false)
const menuItems = computed(() => [
  {
    key: 'all',
    label: t('matrixChat.allThreads'),
    description: '',
    selected: filter.value === 'all',
  },
  {
    key: 'my',
    label: t('matrixChat.myThreads'),
    description: '',
    selected: filter.value === 'my',
  },
])
function onSelectFilter(key: string) {
  rightPanelStore.setThreadFilter(key as 'all' | 'my')
  menuOpen.value = false
}

async function markAllThreadsRead() {
  if (!roomStore.activeRoom || !clientStore.client) return
  try {
    // 发 unthreaded read receipt(对齐 element-web clearRoomNotification)
    await clientStore.client.sendReadReceipt(roomStore.activeRoom as any)
  } catch {
    // ignore
  }
}

function closePanel() {
  rightPanelStore.closeRightPanel()
}
</script>

<template>
  <div class="matrix-thread-panel">
    <div class="thread-panel-header">
      <h3 class="thread-panel-title">{{ t('matrixChat.threads') }}</h3>
      <button
        class="thread-panel-icon-btn"
        :title="t('matrixChat.markAllThreadsRead')"
        @click="markAllThreadsRead"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
          <polyline points="14 6 3 17" opacity="0.4" />
        </svg>
      </button>
      <span class="thread-panel-separator" />
      <button class="thread-panel-dropdown" @click="menuOpen = !menuOpen">
        {{ filter === 'all' ? t('matrixChat.allThreads') : t('matrixChat.myThreads') }}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <MatrixContextMenu
        v-if="menuOpen"
        :items="menuItems"
        :top="52"
        :right="44"
        @select="onSelectFilter"
        @close="menuOpen = false"
      />
      <button class="thread-panel-close" @click="closePanel">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="thread-panel-body">
      <!-- 加载中:initRoomThreads 在跑 -->
      <div v-if="loading && !timelineSet" class="thread-panel-loading">
        <MatrixSpinner />
        <span>{{ t('matrixChat.loadingThreads') }}</span>
      </div>
      <!-- 有 timelineSet:渲染列表(空时由 TimelinePanel 的 emptyState 兜底) -->
      <MatrixTimelinePanel
        v-else-if="timelineSet"
        :timeline-set="timelineSet"
        rendering-type="threads-list"
        :show-read-receipts="false"
        :show-reactions="false"
        :hide-threaded-messages="false"
        :always-show-timestamps="true"
        :disable-grouping="true"
        :empty-state="emptyState"
      />
      <!-- 服务器不支持 threads / 无 timelineSet 且加载已结束:显示空态 -->
      <div v-else class="thread-panel-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p class="thread-panel-empty-title">{{ emptyState.title }}</p>
        <p class="thread-panel-empty-desc">{{ emptyState.description }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-thread-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-width: 0;
  border-left: 1px solid $border-color;
  background: $bg-card;
  overflow: hidden;
  position: relative;
}

.thread-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.thread-panel-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  flex-shrink: 0;
}

.thread-panel-icon-btn {
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
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
    color: $text-primary;
  }
}

.thread-panel-separator {
  width: 1px;
  height: 24px;
  background: $border-color;
  flex-shrink: 0;
}

.thread-panel-dropdown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: $text-secondary;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }
}

.thread-panel-close {
  margin-left: auto;
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
  transition: all $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
    color: $text-primary;
  }
}

.thread-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.thread-panel-body :deep(.matrix-timeline-panel) {
  padding: 8px 12px;
}

.thread-panel-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: $text-muted;
  font-size: 13px;
}

.thread-panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 24px;
  text-align: center;
  color: $text-muted;

  svg {
    opacity: 0.4;
  }
}

.thread-panel-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-secondary;
  margin: 0;
}

.thread-panel-empty-desc {
  font-size: 13px;
  color: $text-muted;
  margin: 0;
  line-height: 1.4;
  max-width: 260px;
}
</style>
