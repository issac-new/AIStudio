<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import MatrixReactionPicker from './MatrixReactionPicker.vue'

interface ReactionGroup {
  key: string
  count: number
  senders: string[]
  myReactionEventId: string | null
}

interface Props {
  eventId: string | null
  /** Whether to show the add-reaction button */
  showAddButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAddButton: true,
})

const { t } = useI18n()
const composerStore = useMatrixComposerStore()

// ─── Reactions data ──────────────────────────────────────────
const reactions = computed<ReactionGroup[]>(() => {
  return composerStore.getEventReactions(props.eventId)
})

const hasReactions = computed(() => reactions.value.length > 0)

// ─── Show all / limited ─────────────────────────────────────
const MAX_ITEMS_WHEN_LIMITED = 8
const showAll = ref(false)
const isLimited = computed(() => reactions.value.length > MAX_ITEMS_WHEN_LIMITED)

const displayedReactions = computed(() => {
  if (!isLimited.value || showAll.value) return reactions.value
  return reactions.value.slice(0, MAX_ITEMS_WHEN_LIMITED)
})

// ─── Reaction picker ─────────────────────────────────────────
const pickerOpen = ref(false)
const pickerRef = ref<HTMLElement | null>(null)

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

function closePicker() {
  pickerOpen.value = false
}

async function handleSendReaction(_emoji: string) {
  // The picker toggles the reaction internally (send/redact) before emitting
  // `select`, mirroring element-web ReactionPicker.onChoose. Nothing to do
  // here except keep the handler for API symmetry with the emoji-toolbar use
  // of the same picker component.
}

// ─── Toggle reaction (click pill to add/remove) ──────────────
async function toggleReaction(reaction: ReactionGroup) {
  if (reaction.myReactionEventId) {
    try {
      await composerStore.removeReaction(reaction.myReactionEventId)
    } catch {
      // error handled in store
    }
  } else {
    try {
      await composerStore.sendReaction(props.eventId, reaction.key)
    } catch {
      // error handled in store
    }
  }
}

// ─── Click outside to close picker ───────────────────────────
function handleClickOutside(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    closePicker()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div v-if="hasReactions || showAddButton" class="mx_ReactionsRow">
    <!-- Reaction pills (element-web ReactionsRowButton style) -->
    <button
      v-for="reaction in displayedReactions"
      :key="reaction.key"
      class="mx_ReactionsRowButton"
      :class="{ 'mx_ReactionsRowButton--selected': reaction.myReactionEventId }"
      :title="reaction.senders.join(', ')"
      @click="toggleReaction(reaction)"
    >
      <span class="mx_ReactionsRowButton_emoji">{{ reaction.key }}</span>
      <span class="mx_ReactionsRowButton_count">{{ reaction.count }}</span>
    </button>

    <!-- Show all / show less button -->
    <button
      v-if="isLimited"
      class="mx_ReactionsRow_showAll"
      @click="showAll = !showAll"
    >
      {{ showAll ? t('matrixChat.showLess') : t('matrixChat.showAll', { count: reactions.length - MAX_ITEMS_WHEN_LIMITED }) }}
    </button>

    <!-- Add reaction button with full picker -->
    <div v-if="showAddButton" ref="pickerRef" class="reaction-add-wrapper">
      <button
        class="reaction-add-btn"
        :title="t('matrixChat.addReaction')"
        @click.stop="togglePicker"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>

      <MatrixReactionPicker
        :event-id="eventId"
        :visible="pickerOpen"
        @close="closePicker"
        @select="handleSendReaction"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mx_ReactionsRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

// ─── Reaction pill (element-web ReactionsRowButton) ─────────
.mx_ReactionsRowButton {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px solid $border-color;
  border-radius: 9999px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: all $transition-fast;
  color: $text-secondary;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
    border-color: rgba(var(--accent-primary-rgb), 0.3);
  }
}

.mx_ReactionsRowButton--selected {
  background: rgba(var(--accent-primary-rgb), 0.1);
  border-color: var(--accent-primary, $accent-primary);
  color: var(--accent-primary, $accent-primary);
  font-weight: 500;
}

.mx_ReactionsRowButton_emoji {
  font-size: 15px;
  line-height: 1;
}

.mx_ReactionsRowButton_count {
  font-size: 12px;
  font-weight: 500;
  min-width: 8px;
  text-align: center;
}

.mx_ReactionsRow_showAll {
  font-size: 12px;
  color: var(--accent-primary);
  cursor: pointer;
  padding: 2px 4px;
  border: none;
  background: transparent;

  &:hover {
    text-decoration: underline;
  }
}

// ─── Add reaction button ────────────────────────────────────
.reaction-add-wrapper {
  position: relative;
  display: inline-flex;
}

.reaction-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: 1px dashed $border-color;
  border-radius: 9999px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    border-color: rgba(var(--accent-primary-rgb), 0.4);
    color: var(--accent-primary, $accent-primary);
    background: rgba(var(--accent-primary-rgb), 0.04);
  }
}
</style>
