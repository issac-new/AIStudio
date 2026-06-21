<script setup lang="ts">
import { useI18n } from 'vue-i18n'

interface Props {
  canReply: boolean
  canEdit: boolean
  canDelete: boolean
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  reply: []
  edit: []
  delete: []
  react: []
  copyLink: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="visible && canReply"
    class="mx_MessageActionBar"
    :class="{ 'mx_MessageActionBar--visible': visible }"
  >
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
    <button
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.addReaction')"
      @click="emit('react')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    </button>
    <button
      class="mx_MessageActionBar_button"
      :title="t('matrixChat.copyLink')"
      @click="emit('copyLink')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </button>
    <button
      v-if="canDelete"
      class="mx_MessageActionBar_button mx_MessageActionBar_button--danger"
      :title="t('matrixChat.actionDelete')"
      @click="emit('delete')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  </div>
</template>
