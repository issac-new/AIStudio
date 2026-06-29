<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import MatrixReactionPicker from './MatrixReactionPicker.vue'

interface Props {
  /** 紧凑模式(thread 详情 composer 用):减小 padding/字号 */
  compact?: boolean
  /** 传入时,普通模式发送走 thread relation(详情视图用) */
  threadRelation?: {
    rel_type: string
    event_id: string
    is_falling_back?: boolean
    'm.in_reply_to'?: { event_id: string }
  }
  /**
   * Focus the textarea on mount (thread view uses this to mirror element-web's
   * post-ShowThread FocusSendMessageComposer dispatch).
   */
  autofocus?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  compact: false,
  threadRelation: undefined,
  autofocus: false,
})

const roomStore = useMatrixRoomStore()
const composerStore = useMatrixComposerStore()
const threadStore = useMatrixThreadStore()
const { t } = useI18n()

const inputText = ref('')
const sending = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// ─── Composer mode (reply / edit / normal) ───────────────────
const composerMode = computed(() => composerStore.composerMode)
const replyToEvent = computed(() => composerStore.replyToEvent)
const editingEvent = computed(() => composerStore.editingEvent)

const replyPreviewContent = computed(() => {
  if (!replyToEvent.value) return ''
  const c = replyToEvent.value.getContent()
  const body = c?.body ?? ''
  return composerStore.stripPlainReply(body).slice(0, 80)
})

const replyPreviewSender = computed(() => replyToEvent.value?.getSender() ?? '')

const editingOriginalContent = computed(() => {
  if (!editingEvent.value) return ''
  const c = editingEvent.value.getContent()
  return composerStore.stripPlainReply(c?.body ?? '')
})

function cancelComposerMode() {
  composerStore.clearComposerMode()
  inputText.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
}

// Pre-fill textarea when entering edit mode
watch(composerMode, (mode) => {
  if (mode === 'edit' && editingEvent.value) {
    inputText.value = editingOriginalContent.value
    nextTick(() => {
      autoResizeTextarea()
      textareaRef.value?.focus()
    })
  } else if (mode === 'reply') {
    inputText.value = ''
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})

// ─── @mention autocomplete ──────────────────────────────────
const showMentionPopup = ref(false)
const mentionQuery = ref('')
const mentionStartIndex = ref(-1)
const mentionSelectedIndex = ref(0)

const roomMembers = computed(() => {
  void roomStore.roomVersion
  const roomId = roomStore.activeRoomId
  if (!roomId) return []
  const groups = roomStore.getRoomMemberList(roomId)
  return [...groups.admins, ...groups.mods, ...groups.defaults]
})

const filteredMentionMembers = computed(() => {
  const q = mentionQuery.value.toLowerCase()
  if (!q) return roomMembers.value.slice(0, 8)
  return roomMembers.value.filter((m: any) => {
    const name = (m.name ?? '').toLowerCase()
    const uid = (m.userId ?? '').toLowerCase()
    return name.includes(q) || uid.includes(q)
  }).slice(0, 8)
})

function handleInput() {
  autoResizeTextarea()
  detectMention()
}

function detectMention() {
  const text = inputText.value
  const cursorPos = textareaRef.value?.selectionStart ?? text.length
  const beforeCursor = text.slice(0, cursorPos)
  const lastAtIndex = beforeCursor.lastIndexOf('@')
  if (lastAtIndex === -1) {
    showMentionPopup.value = false
    return
  }
  const segment = beforeCursor.slice(lastAtIndex + 1)
  if (segment.includes(' ') || segment.includes('\n')) {
    showMentionPopup.value = false
    return
  }
  if (lastAtIndex > 0 && !/\s/.test(text[lastAtIndex - 1])) {
    showMentionPopup.value = false
    return
  }
  mentionStartIndex.value = lastAtIndex
  mentionQuery.value = segment
  mentionSelectedIndex.value = 0
  showMentionPopup.value = filteredMentionMembers.value.length > 0
}

function selectMention(member: any) {
  const text = inputText.value
  const cursorPos = textareaRef.value?.selectionStart ?? text.length
  const before = text.slice(0, mentionStartIndex.value)
  const after = text.slice(cursorPos)
  const mentionName = member.name || member.userId
  inputText.value = before + `@${mentionName} ` + after
  showMentionPopup.value = false
  nextTick(() => {
    if (textareaRef.value) {
      const newPos = before.length + `@${mentionName} `.length
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newPos, newPos)
    }
  })
}

function handleMentionKeydown(e: KeyboardEvent) {
  if (!showMentionPopup.value) return false
  const members = filteredMentionMembers.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    mentionSelectedIndex.value = (mentionSelectedIndex.value + 1) % members.length
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    mentionSelectedIndex.value = (mentionSelectedIndex.value - 1 + members.length) % members.length
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (members[mentionSelectedIndex.value]) {
      selectMention(members[mentionSelectedIndex.value])
    }
    return true
  }
  if (e.key === 'Escape') {
    showMentionPopup.value = false
    return true
  }
  return false
}

// ─── Format toolbar ────────────────────────────────────────
function insertFormat(before: string, after: string = before) {
  const el = textareaRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const text = inputText.value
  const selected = text.slice(start, end)
  const replacement = before + selected + after
  inputText.value = text.slice(0, start) + replacement + text.slice(end)
  nextTick(() => {
    el.focus()
    const newPos = start + before.length + selected.length
    el.setSelectionRange(newPos, newPos)
    autoResizeTextarea()
  })
}

function insertBold() { insertFormat('**') }
function insertItalic() { insertFormat('*') }
function insertCode() { insertFormat('`') }
function insertCodeBlock() { insertFormat('```\n', '\n```') }

// ─── Emoji picker ──────────────────────────────────────────
const emojiPickerOpen = ref(false)

function toggleEmojiPicker() {
  emojiPickerOpen.value = !emojiPickerOpen.value
}

function insertEmoji(emoji: string) {
  const el = textareaRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const text = inputText.value
  inputText.value = text.slice(0, start) + emoji + text.slice(end)
  nextTick(() => {
    el.focus()
    const newPos = start + emoji.length
    el.setSelectionRange(newPos, newPos)
    autoResizeTextarea()
  })
  emojiPickerOpen.value = false
}

// ─── File upload ───────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleFileUpload() {
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  sending.value = true
  composerStore.sendFile(file).finally(() => {
    sending.value = false
    target.value = ''
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (handleMentionKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function autoResizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

// Autofocus on mount when requested (thread view → element-web FocusSendMessageComposer).
onMounted(() => {
  if (props.autofocus) {
    nextTick(() => textareaRef.value?.focus())
  }
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || !roomStore.activeRoomId) return
  sending.value = true
  try {
    if (composerMode.value === 'reply' && replyToEvent.value) {
      await composerStore.sendReply(text, replyToEvent.value as any)
    } else if (composerMode.value === 'edit' && editingEvent.value) {
      await composerStore.sendEdit(text, editingEvent.value as any)
    } else if (props.threadRelation) {
      // thread 详情 composer:走 thread relation send
      await threadStore.sendThreadMessage(
        text,
        props.threadRelation.event_id,
        props.threadRelation['m.in_reply_to']?.event_id,
      )
    } else {
      await composerStore.sendMessage(text)
    }
    inputText.value = ''
    if (textareaRef.value) textareaRef.value.style.height = 'auto'
  } catch {
    // error is handled in store
  } finally {
    sending.value = false
  }
}

watch(() => roomStore.activeRoomId, () => {
  showMentionPopup.value = false
  composerStore.clearComposerMode()
  inputText.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
})

function getMemberAvatar(member: any): string | null {
  return roomStore.getUserAvatarUrl(member, 28)
}

function getMemberInitial(member: any): string {
  return (member.name ?? member.userId ?? '?').charAt(0).toUpperCase()
}
</script>

<template>
  <div v-if="roomStore.activeRoomId" class="matrix-message-input" :class="{ 'matrix-message-input--compact': compact }">
    <!-- Mention autocomplete popup -->
    <div v-if="showMentionPopup && filteredMentionMembers.length > 0" class="mention-popup">
      <div
        v-for="(member, idx) in filteredMentionMembers"
        :key="member.userId"
        class="mention-item"
        :class="{ 'mention-item--selected': idx === mentionSelectedIndex }"
        @click="selectMention(member)"
        @mouseenter="mentionSelectedIndex = idx"
      >
        <div class="mention-avatar">
          <img v-if="getMemberAvatar(member)" :src="getMemberAvatar(member)!" alt="" class="mention-avatar-img" />
          <div v-else class="mention-avatar-placeholder">{{ getMemberInitial(member) }}</div>
        </div>
        <div class="mention-info">
          <span class="mention-name">{{ member.name ?? member.userId }}</span>
          <span class="mention-userid">{{ member.userId }}</span>
        </div>
      </div>
    </div>

    <!-- Reply preview bar -->
    <div v-if="composerMode === 'reply' && replyToEvent" class="composer-preview-bar">
      <div class="composer-preview-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </div>
      <div class="composer-preview-content">
        <span class="composer-preview-sender">{{ replyPreviewSender }}</span>
        <span class="composer-preview-text">{{ replyPreviewContent }}</span>
      </div>
      <button class="composer-preview-cancel" @click="cancelComposerMode">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Edit preview bar -->
    <div v-if="composerMode === 'edit' && editingEvent" class="composer-preview-bar composer-preview-bar--edit">
      <div class="composer-preview-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>
      <div class="composer-preview-content">
        <span class="composer-preview-label">{{ t('matrixChat.editingMessage') }}</span>
      </div>
      <button class="composer-preview-cancel" @click="cancelComposerMode">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Format toolbar -->
    <div class="format-toolbar">
      <button class="format-btn" :title="t('matrixChat.bold')" @click="insertBold">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></svg>
      </button>
      <button class="format-btn" :title="t('matrixChat.italic')" @click="insertItalic">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
      </button>
      <button class="format-btn" :title="t('matrixChat.code')" @click="insertCode">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
      </button>
      <button class="format-btn" :title="t('matrixChat.codeBlock')" @click="insertCodeBlock">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
      </button>
      <div class="format-toolbar-divider" />
      <div class="emoji-picker-wrapper">
        <button class="format-btn" :title="t('matrixChat.emoji')" @click.stop="toggleEmojiPicker">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
        </button>
        <MatrixReactionPicker
          event-id="emoji"
          :visible="emojiPickerOpen"
          @close="emojiPickerOpen = false"
          @select="(emoji: string) => insertEmoji(emoji)"
        />
      </div>
      <div class="format-toolbar-divider" />
      <button class="format-btn" :title="t('matrixChat.uploadFile')" @click="handleFileUpload">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
      </button>
      <input
        ref="fileInputRef"
        type="file"
        style="display: none"
        @change="onFileSelected"
      />
    </div>

    <div class="input-row">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="msg-input"
        :placeholder="composerMode === 'edit' ? t('matrixChat.editMessagePlaceholder') : (composerMode === 'reply' ? t('matrixChat.replyMessagePlaceholder') : t('matrixChat.sendMessage'))"
        :disabled="sending"
        rows="1"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <button
        class="send-btn"
        type="button"
        :disabled="!inputText.trim() || sending"
        @click="handleSend"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-message-input {
  padding: 12px 16px;
  border-top: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
}

// ─── Compact mode (thread detail composer) ───────────────
.matrix-message-input--compact {
  padding: 8px 12px;
  gap: 6px;
}

// ─── Composer preview bar (reply / edit) ──────────────────
.composer-preview-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(var(--accent-primary-rgb), 0.04);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.15);
  border-radius: $radius-sm;
}

.composer-preview-bar--edit {
  background: rgba(var(--accent-primary-rgb), 0.06);
  border-color: rgba(var(--accent-primary-rgb), 0.25);
}

.composer-preview-icon {
  color: var(--accent-primary);
  flex-shrink: 0;
}

.composer-preview-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.composer-preview-sender {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-primary);
}

.composer-preview-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-preview-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-primary);
}

.composer-preview-cancel {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color $transition-fast;

  &:hover { color: var(--text-primary); }
}

// ─── Format toolbar ────────────────────────────────────────
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
}

.format-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: $radius-sm;
  color: $text-muted;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    color: var(--accent-primary);
    background: rgba(var(--accent-primary-rgb), 0.08);
  }
}

.format-toolbar-divider {
  width: 1px;
  height: 20px;
  background: $border-color;
  margin: 0 4px;
}

.emoji-picker-wrapper {
  position: relative;
  display: inline-flex;
}

// ─── Mention popup ───────────────────────────────────────
.mention-popup {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 60px;
  max-height: 240px;
  overflow-y: auto;
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 10;
  margin-bottom: 4px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover,
  &.mention-item--selected {
    background: rgba(var(--accent-primary-rgb), 0.06);
  }
}

.mention-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.mention-avatar-img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.mention-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.mention-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mention-name {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-userid {
  font-size: 11px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input-row {
  display: flex;
  gap: 8px;
}

.msg-input {
  flex: 1;
  min-height: 36px;
  max-height: 120px;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.4;

  &::placeholder { color: $text-muted; }
  &:focus { border-color: $accent-primary; }
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: $accent-primary;
  color: $text-on-accent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
</style>
