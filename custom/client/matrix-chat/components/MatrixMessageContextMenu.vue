<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EventStatus } from 'matrix-js-sdk'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

interface Props {
  event: MatrixEvent
  position: { x: number; y: number }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  reply: []
  edit: []
  delete: []
  copyText: []
  copyLink: []
  react: []
  forward: []
  replyInThread: []
}>()

const { t } = useI18n()
const composerStore = useMatrixComposerStore()
const clientStore = useMatrixClientStore()

const canReply = computed(() => composerStore.isContentActionable(props.event))
const canEdit = computed(() => composerStore.canEditOwnMessage(props.event))
const canDelete = computed(() => {
  if (!clientStore.client) return false
  const isSent = !props.event.status || props.event.status === EventStatus.SENT
  if (!isSent) return false
  return true
})

const menuStyle = computed(() => ({
  left: props.position.x + 'px',
  top: props.position.y + 'px',
}))
</script>

<template>
  <div class="context-menu-overlay" @click="emit('close')">
    <div class="mx_MessageContextMenu" :style="menuStyle" @click.stop>
      <button v-if="canReply" class="mx_MessageContextMenu_item" @click="emit('reply')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
        <span>{{ t('matrixChat.actionReply') }}</span>
      </button>
      <button v-if="canReply" class="mx_MessageContextMenu_item" @click="emit('replyInThread')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
          <path d="M8 10h5" />
          <path d="M8 14h3" />
        </svg>
        <span>{{ t('matrixChat.replyInThread') }}</span>
      </button>
      <button v-if="canEdit" class="mx_MessageContextMenu_item" @click="emit('edit')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>{{ t('matrixChat.actionEdit') }}</span>
      </button>
      <button class="mx_MessageContextMenu_item" @click="emit('react')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <span>{{ t('matrixChat.addReaction') }}</span>
      </button>
      <button class="mx_MessageContextMenu_item" @click="emit('forward')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
        <span>{{ t('matrixChat.forward') }}</span>
      </button>
      <button class="mx_MessageContextMenu_item" @click="emit('copyText')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>{{ t('matrixChat.copyText') }}</span>
      </button>
      <button class="mx_MessageContextMenu_item" @click="emit('copyLink')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span>{{ t('matrixChat.copyLink') }}</span>
      </button>
      <button v-if="canDelete" class="mx_MessageContextMenu_item mx_MessageContextMenu_item--danger" @click="emit('delete')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span>{{ t('matrixChat.actionDelete') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.mx_MessageContextMenu {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  min-width: 180px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mx_MessageContextMenu_item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: $text-primary;
  font-size: 13px;
  cursor: pointer;
  border-radius: $radius-sm;
  text-align: left;
  transition: background-color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
  }

  &--danger {
    color: var(--error);

    &:hover {
      background: rgba(var(--error-rgb), 0.06);
    }
  }

  svg {
    flex-shrink: 0;
  }
}
</style>
