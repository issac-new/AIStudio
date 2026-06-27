<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
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

interface WidgetInfo {
  id: string
  name: string
  type: string
  url: string
  eventId?: string
  avatarUrl?: string
}

const widgets = ref<WidgetInfo[]>([])
const isLoading = ref(false)

function loadWidgets() {
  if (!room.value || !clientStore.client) return
  isLoading.value = true
  try {
    const result: WidgetInfo[] = []

    // Get widgets from room state events (im.vector.modular.widgets)
    const widgetStateEvents = room.value.currentState?.getStateEvents('im.vector.modular.widgets')
    if (widgetStateEvents) {
      // If single event, wrap in array
      const events = Array.isArray(widgetStateEvents) ? widgetStateEvents : [widgetStateEvents]
      for (const ev of events) {
        const content = ev.getContent()
        if (content?.url && content?.type) {
          result.push({
            id: ev.getStateKey() || ev.getId() || '',
            name: content.name || content.type,
            type: content.type,
            url: content.url,
            eventId: ev.getId(),
            avatarUrl: content.avatar_url || null,
          })
        }
      }
    }

    // Also check account data widgets
    const userWidgets = clientStore.client.getAccountData('m.widgets')
    if (userWidgets) {
      const content = userWidgets.getContent()
      if (content && typeof content === 'object') {
        for (const [id, data] of Object.entries(content)) {
          if (data && (data as any).url && (data as any).type) {
            const w = data as any
            result.push({
              id,
              name: w.name || w.type || id,
              type: w.type,
              url: w.url,
              eventId: undefined,
              avatarUrl: w.avatar_url || null,
            })
          }
        }
      }
    }

    widgets.value = result
  } catch {
    // ignore
  } finally {
    isLoading.value = false
  }
}

watch(room, () => { if (room.value) loadWidgets() }, { immediate: true })
onMounted(() => { if (room.value) loadWidgets() })

function handleBack() {
  rightPanelStore.rightPanelBack()
}

function getWidgetIcon(type: string): string {
  const t = type?.toLowerCase() ?? ''
  if (t.includes('jitsi') || t.includes('video') || t.includes('call')) return '📹'
  if (t.includes('etherpad') || t.includes('doc') || t.includes('whiteboard')) return '📝'
  if (t.includes('poll') || t.includes('survey')) return '📊'
  if (t.includes('calendar') || t.includes('schedule')) return '📅'
  if (t.includes('sticker')) return '😄'
  if (t.includes('custom')) return '⚙️'
  return '🔌'
}
</script>

<template>
  <div class="extensions-card">
    <div class="ex-header">
      <button class="ex-back-btn" @click="handleBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3 class="ex-title">{{ t('matrixChat.extensionsMenu') }}</h3>
    </div>

    <div class="ex-content">
      <div v-if="isLoading" class="ex-loading">
        <span class="ex-spinner" />
        {{ t('matrixChat.loading') }}
      </div>

      <div v-else-if="widgets.length === 0" class="ex-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
        <p class="ex-empty-title">{{ t('matrixChat.noExtensions') }}</p>
        <p class="ex-empty-desc">{{ t('matrixChat.noExtensionsHint') }}</p>
      </div>

      <div v-else class="ex-list">
        <div
          v-for="widget in widgets"
          :key="widget.id"
          class="ex-item"
        >
          <div class="ex-item-icon">
            <img
              v-if="widget.avatarUrl"
              :src="clientStore.client?.mxcUrlToHttp?.(widget.avatarUrl, 24, 24, 'crop') ?? widget.avatarUrl"
              alt=""
              class="ex-item-icon-img"
            />
            <span v-else class="ex-item-icon-emoji">{{ getWidgetIcon(widget.type) }}</span>
          </div>
          <div class="ex-item-body">
            <span class="ex-item-name">{{ widget.name }}</span>
            <span class="ex-item-type">{{ widget.type }}</span>
          </div>
          <a
            v-if="widget.url"
            :href="widget.url"
            target="_blank"
            rel="noopener"
            class="ex-item-open"
            :title="t('matrixChat.openWidget')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.extensions-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ex-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  min-height: 44px;
}

.ex-back-btn {
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

.ex-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.ex-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.ex-loading, .ex-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: $text-muted;
  font-size: 13px;
  text-align: center;
}

.ex-empty-title { font-weight: 600; color: $text-secondary; margin: 0; }
.ex-empty-desc { font-size: 12px; margin: 0; }

.ex-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  display: inline-block;
  animation: ex-spin 0.6s linear infinite;
}

@keyframes ex-spin { to { transform: rotate(360deg); } }

.ex-list { display: flex; flex-direction: column; }

.ex-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--text-muted-rgb), 0.08);
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.03); }
}

.ex-item-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: $radius-sm;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-secondary;
}

.ex-item-icon-img {
  width: 32px;
  height: 32px;
  object-fit: cover;
}

.ex-item-icon-emoji { font-size: 18px; }

.ex-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ex-item-name {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ex-item-type {
  font-size: 11px;
  color: $text-muted;
}

.ex-item-open {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  color: $text-muted;
  flex-shrink: 0;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); color: $accent-primary; }
}
</style>
