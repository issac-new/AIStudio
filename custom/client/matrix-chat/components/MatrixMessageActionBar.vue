<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Hover action bar for an event tile.
 *
 * Mirrors element-web ActionBarView + EventTileActionBarViewModel.resolveActions:
 * the resolved actions are rendered in the same canonical order as upstream —
 *   React → Reply → ReplyInThread → Edit → [Cancel] → Options(overflow)
 * with reply-in-thread shown only when the event can start/continue a thread.
 *
 * Buttons emit semantic events; the parent (MatrixMessageItem) wires them to
 * the composer / thread / context-menu stores, the same way element-web's
 * ActionBarAdapter delegates to its view model.
 */
interface Props {
  visible: boolean
  /** Reply: actionable + canSendMessages (element-web showReply). */
  canReply: boolean
  /** React: actionable + canReact (element-web showReact). */
  canReact: boolean
  /** Reply in thread: shown when actionable + not in thread timeline + allowed message type. */
  canReplyInThread: boolean
  /** Reply-in-thread is rendered but disabled (existing non-thread relation). */
  replyInThreadDisabled?: boolean
  /** Edit: canEditOwnMessage (element-web showEdit). */
  canEdit: boolean
  /** Cancel a failed/local event (element-web showCancel). */
  canCancel?: boolean
  /** Overflow options menu is always shown last (element-web always pushes Options). */
  canShowOptions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  replyInThreadDisabled: false,
  canCancel: false,
  canShowOptions: true,
})
const emit = defineEmits<{
  reply: []
  edit: []
  cancel: []
  react: [anchor: HTMLElement]
  replyInThread: []
  options: [anchor: HTMLElement]
  copyLink: []
  delete: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="visible && (canReply || canReact || canReplyInThread || canEdit || canCancel || canShowOptions)"
    class="mx_MessageActionBar"
    :class="{ 'mx_MessageActionBar--visible': visible }"
  >
    <!-- React (element-web order: React first) -->
    <button
      v-if="canReact"
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.addReaction')"
      @click="(e) => emit('react', e.currentTarget as HTMLElement)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    </button>

    <!-- Reply -->
    <button
      v-if="canReply"
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.actionReply')"
      @click="emit('reply')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    </button>

    <!-- Reply in thread (ThreadsIcon: speech bubble with branch) -->
    <button
      v-if="canReplyInThread"
      class="mx_MessageActionBar_button"
      :class="{ 'mx_MessageActionBar_button--disabled': replyInThreadDisabled }"
      :disabled="replyInThreadDisabled"
      :title="replyInThreadDisabled ? t('matrixChat.threadStartDisabled') : t('matrixChat.replyInThread')"
      @click="emit('replyInThread')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        <path d="M8 10h5" />
        <path d="M8 14h3" />
      </svg>
    </button>

    <!-- Edit -->
    <button
      v-if="canEdit"
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.actionEdit')"
      @click="emit('edit')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>

    <!-- Cancel failed send -->
    <button
      v-if="canCancel"
      class="mx_MessageActionBar_button mx_MessageActionBar_button--danger"
      :title="t('matrixChat.actionDelete')"
      @click="emit('cancel')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>

    <!-- Options (overflow → full context menu). Always last, mirroring element-web. -->
    <button
      v-if="canShowOptions"
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.options')"
      @click="(e) => emit('options', e.currentTarget as HTMLElement)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="5" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="12" cy="19" r="1.5" />
      </svg>
    </button>

    <!-- Legacy copy-link affordance (kept for non-overflow callers) -->
    <button
      v-if="!canShowOptions"
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.copyLink')"
      @click="emit('copyLink')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </button>
  </div>
</template>
