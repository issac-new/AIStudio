<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const { t } = useI18n()
const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()

const emit = defineEmits<{
  close: []
  select: [eventId: string]
}>()

const visible = defineModel<boolean>('visible', { required: true })

const searchQuery = ref('')
const searching = ref(false)
const results = ref<any[]>([])
const searchInputRef = ref<HTMLInputElement | null>(null)

// When opened, pre-fill from store search term
watch(visible, (v) => {
  if (v) {
    if (roomStore.roomSearchTerm) {
      searchQuery.value = roomStore.roomSearchTerm
      nextTick(() => {
        searchInputRef.value?.focus()
        searchInputRef.value?.select()
        doSearch()
      })
    } else {
      nextTick(() => searchInputRef.value?.focus())
    }
  } else {
    // Clear store search term when dialog closes
    roomStore.roomSearchTerm = ''
  }
})

async function doSearch() {
  const q = searchQuery.value.trim()
  if (!q || !clientStore.client || !roomStore.activeRoomId) return

  searching.value = true
  try {
    const resp = await clientStore.client.searchRoomEvents({
      search_term: q,
      keys: ['content.body'],
    })
    const roomResults = resp?.search_categories?.room_events?.results ?? []
    results.value = roomResults
      .filter((r: any) => r.result?.room_id === roomStore.activeRoomId)
      .slice(0, 30)
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

function selectResult(eventId: string) {
  emit('select', eventId)
  emit('close')
}

function getSenderDisplayName(event: any): string {
  return event.sender ?? 'Unknown'
}

function getContentPreview(event: any): string {
  const body = event?.content?.body
  if (typeof body === 'string') return body.slice(0, 120)
  return ''
}

function getFormattedTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="visible" class="matrix-dialog-overlay" @click.self="emit('close')">
    <div class="matrix-dialog search-dialog">
      <div class="matrix-dialog__header">
        <h3>{{ t('matrixChat.search') }}</h3>
        <button class="matrix-dialog__close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="search-dialog__input">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="matrix-input"
          :placeholder="t('matrixChat.search') + '...'"
          @keydown.enter="doSearch"
        />
        <button class="search-dialog__btn" :disabled="searching || !searchQuery.trim()" @click="doSearch">
          <svg v-if="!searching" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <span v-else>{{ t('matrixChat.loading') }}</span>
        </button>
      </div>

      <div class="search-dialog__results">
        <div
          v-for="(item, idx) in results"
          :key="idx"
          class="search-dialog__result-item"
          @click="selectResult(item.result?.event_id)"
        >
          <div class="search-dialog__result-header">
            <span class="search-dialog__result-sender">{{ getSenderDisplayName(item.result) }}</span>
            <span class="search-dialog__result-time">{{ getFormattedTime(item.result?.origin_server_ts) }}</span>
          </div>
          <p class="search-dialog__result-content">{{ getContentPreview(item.result) }}</p>
        </div>
        <p v-if="!searching && searchQuery && results.length === 0" class="search-dialog__empty">
          {{ t('matrixChat.noResults') }}
        </p>
        <p v-if="!searchQuery" class="search-dialog__empty">
          {{ t('matrixChat.searchHint') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.matrix-dialog {
  background: $bg-card;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.matrix-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;

  h3 { margin: 0; font-size: 16px; font-weight: 600; color: $text-primary; }
}

.matrix-dialog__close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover { background: $bg-secondary; color: $text-primary; }
}

.search-dialog__input {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid $border-color;
}

.matrix-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: $accent-primary; }
}

.search-dialog__btn {
  width: 36px;
  height: 36px;
  border: 1px solid $border-color;
  border-radius: 6px;
  background: $bg-card;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) { background: $bg-secondary; color: $accent-primary; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.search-dialog__results {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.search-dialog__result-item {
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.search-dialog__result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.search-dialog__result-sender {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.search-dialog__result-time {
  font-size: 11px;
  color: $text-muted;
}

.search-dialog__result-content {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-dialog__empty {
  padding: 32px 20px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
