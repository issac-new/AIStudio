<script setup lang="ts">
// IdeFindInSession — 会话内查找条（B4，zcode useConversationTimelineFind 对照）。
// 数据源=chatStore.activeSession.messages（当前会话消息流）；导航经
// chatStore.focusMessageId 走 MessageList 既有定位链（SessionSearchModal 同款，
// 定位目标消息并加载上下文）。范围说明：跳转真实生效；行内高亮需上游
// MessageList 补丁，本轮不做（按钮头注如实标注）。
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const emit = defineEmits<{ (e: 'close'): void }>()
const chatStore = useChatStore()

const query = ref('')
const currentIdx = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

interface MsgRow { id?: string; role?: string; content?: unknown }

const matches = computed<string[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const msgs = (chatStore.activeSession?.messages ?? []) as MsgRow[]
  return msgs
    .filter((m) => typeof m.content === 'string' && (m.content as string).toLowerCase().includes(q))
    .map((m) => String(m.id))
    .filter((id) => id && id !== 'undefined')
})

watch(query, () => {
  currentIdx.value = 0
  if (matches.value.length) jump(0)
})

const total = computed(() => matches.value.length)

function jump(idx: number): void {
  const n = matches.value.length
  if (!n) return
  currentIdx.value = ((idx % n) + n) % n
  const id = matches.value[currentIdx.value]
  const store = chatStore as unknown as { focusMessageId?: string | null }
  store.focusMessageId = id
}

function next(): void { jump(currentIdx.value + 1) }
function prev(): void { jump(currentIdx.value - 1) }

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next() }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}

function open(): void {
  void nextTick(() => inputRef.value?.focus())
}
defineExpose({ open })
</script>

<template>
  <div class="ide-find" data-testid="ide-find" @keydown="onKeydown">
    <input
      ref="inputRef"
      v-model="query"
      class="ide-find__input"
      data-testid="ide-find-input"
      placeholder="查找会话内容（消息正文子串）"
    />
    <span class="ide-find__count" data-testid="ide-find-count">{{ total ? `${currentIdx + 1}/${total}` : (query.trim() ? '0/0' : '') }}</span>
    <button type="button" data-testid="ide-find-prev" :disabled="!total" title="上一个（Shift+Enter）" @click="prev">↑</button>
    <button type="button" data-testid="ide-find-next" :disabled="!total" title="下一个（Enter）" @click="next">↓</button>
    <button type="button" data-testid="ide-find-close" title="关闭（Esc）" @click="emit('close')">✕</button>
  </div>
</template>

<style scoped lang="scss">
.ide-find {
  position: absolute; top: 44px; right: 16px; z-index: 60;
  display: flex; gap: 4px; align-items: center;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px; padding: 4px 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  font-size: 11px;
}
.ide-find__input { border: none; outline: none; background: transparent; font-size: 12px; width: 200px; }
.ide-find__count { color: var(--text-color-3, #999); min-width: 34px; text-align: center; }
.ide-find button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 4px; cursor: pointer; padding: 0 6px; font-size: 11px; }
.ide-find button:disabled { opacity: 0.4; cursor: default; }
</style>
