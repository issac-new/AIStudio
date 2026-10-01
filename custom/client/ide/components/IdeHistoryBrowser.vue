<!-- overlay/custom/client/ide/components/IdeHistoryBrowser.vue -->
<!-- 会话 History 浏览器（2026-10-01 IDE 会话吸收批 #10：minimax-code /history
     交互的 Web 化）。
     语义：搜索历史提示（user 消息行）→ 每条三动作——
       Jump 定位（focusMessageId 走 MessageList 既有定位链，与 IdeFindInSession 同源）；
       Copy 复制（纯前端）；
       Edit 重发（剪贴板+聚焦输入框——诚实降级：上游 ChatInput 的 initialText 仅
       mount/切会话时消费，动态注入需 patch 收编轮升级，此处如实标注）；
     运行中只读锁（minimax 语义：isStreaming 时动作禁用并提示）。
     真分叉（Fork from here / Rewind 双 scope）依赖 hermes 会话分叉命令通道与
     文件快照回滚接线，记档剩余（分析文档 §五 #10 剩余行）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { authFetch } from '../utils/auth-fetch'
import { useMsgSurfaceText } from '@/custom/ia2/i18n-msg-surface'

const emit = defineEmits<{ (e: 'close'): void }>()

const chatStore = useChatStore()
const ide = useIdeStore()
const tx = useMsgSurfaceText()

interface MsgRow {
  id?: string
  role?: string
  content?: unknown
  createdAt?: number | string
}

/** user 消息历史（时间正序——"做过什么"的骨架） */
const userMsgs = computed(() => {
  const msgs = (chatStore.activeSession?.messages ?? []) as MsgRow[]
  return msgs.filter(m => m.role === 'user' && typeof m.content === 'string' && (m.content as string).trim())
})

const query = ref('')

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return userMsgs.value
  return userMsgs.value.filter(m => String(m.content).toLowerCase().includes(q))
})

const isStreaming = computed(() => Boolean(chatStore.activeSession && (chatStore as unknown as { isStreaming?: boolean }).isStreaming))

function fmtTs(ts: number | string | undefined): string {
  if (!ts) return ''
  const ms = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function jump(id: string | undefined): void {
  if (!id) return
  const store = chatStore as unknown as { focusMessageId?: string | null }
  store.focusMessageId = id
}

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text) } catch { /* 剪贴板权限拒绝=静默 */ }
}

/** Edit 重发：复制进剪贴板 + 聚焦输入框（诚实降级，见组件头注） */
async function editRefill(text: string): Promise<void> {
  await copyText(text)
  ide.setChatFocus()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
</script>

<template>
  <div class="ihb" data-testid="ide-history-browser" @keydown="onKeydown">
    <div class="ihb__head">
      <span class="ihb__title">🕘 {{ tx.historyTitle }}</span>
      <span class="ihb__count">{{ rows.length }}</span>
      <span v-if="isStreaming" class="ihb__lock" :title="tx.historyLockedHint">🔒 {{ tx.historyLocked }}</span>
      <span class="ihb__spacer" />
      <button type="button" class="ihb__close" data-testid="ide-history-close" @click="emit('close')">×</button>
    </div>
    <input
      v-model="query" type="text" class="ihb__query"
      :placeholder="tx.historySearchHint" data-testid="ide-history-query"
    >
    <div v-if="!rows.length" class="ihb__empty">{{ tx.historyEmpty }}</div>
    <div v-else class="ihb__list">
      <div
        v-for="(m, i) in rows" :key="m.id ?? i" class="ihb__row"
        :data-testid="`ide-history-row-${i}`"
      >
        <button type="button" class="ihb__main" :disabled="isStreaming" @click="jump(m.id)">
          <span class="ihb__ts">{{ fmtTs(m.createdAt) }}</span>
          <span class="ihb__text">{{ String(m.content) }}</span>
        </button>
        <span class="ihb__acts">
          <button type="button" class="ihb__act" :disabled="isStreaming" :title="tx.historyJump" @click="jump(m.id)">↗</button>
          <button type="button" class="ihb__act" :title="tx.historyCopy" @click="copyText(String(m.content))">⧉</button>
          <button type="button" class="ihb__act" :disabled="isStreaming" :title="tx.historyEdit" @click="editRefill(String(m.content))">✎</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ihb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  max-height: 40%;
}

.ihb__head { display: flex; align-items: center; gap: 6px; }
.ihb__title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.ihb__count {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; text-align: center;
  background: var(--bg-card); color: var(--text-muted); font-size: 10px; line-height: 16px;
}
.ihb__lock { font-size: 10px; color: var(--text-muted); }
.ihb__spacer { flex: 1; }
.ihb__close {
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 0 4px;
  &:hover { color: var(--text-primary); }
}

.ihb__query {
  height: 26px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-primary); font-size: 11px; outline: none;
  &:focus { border-color: var(--primary, #3b82f6); }
}

.ihb__empty { padding: 16px 0; text-align: center; color: var(--text-muted); font-size: 11px; }

.ihb__list { overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }

.ihb__row { display: flex; align-items: center; gap: 4px; }

.ihb__main {
  flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; padding: 4px 6px;
  border: none; background: transparent; cursor: pointer; font-family: inherit; text-align: left;
  &:hover:not(:disabled) { background: var(--bg-card); border-radius: 4px; }
  &:disabled { opacity: 0.5; cursor: default; }
}

.ihb__ts { flex-shrink: 0; font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

.ihb__text {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: var(--text-primary);
}

.ihb__acts { display: inline-flex; gap: 2px; flex-shrink: 0; }
.ihb__act {
  width: 20px; height: 20px; border: none; border-radius: 3px; background: transparent;
  color: var(--text-muted); font-size: 11px; cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-card); }
  &:disabled { opacity: 0.4; cursor: default; }
}
</style>
