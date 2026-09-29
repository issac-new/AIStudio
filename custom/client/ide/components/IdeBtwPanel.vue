<script setup lang="ts">
// IdeBtwPanel — /btw 侧问浮窗（B2，cc/kimi 侧问同源：主回合跑着时旁路提问不打断
// 主任务）。真实链=store/btw.ts（旁路会话+只读轮询+旁注复制）。主会话跑着也可问。
import { onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { fetchSessionMessagesPage } from '@/api/studio/sessions'
import { askBtw, refreshBtw, btwNoteText, btwSessionOf, btwStateView } from '../store/btw'

const emit = defineEmits<{ (e: 'close'): void }>()
const chatStore = useChatStore()
const ide = useIdeStore()

const question = ref('')
const copiedId = ref<string | null>(null)

function deps() {
  return {
    newChat: (opts: Record<string, unknown>) => chatStore.newChat(opts as never),
    switchSession: (id: string) => chatStore.switchSession(id),
    sendMessage: (content: string) => chatStore.sendMessage(content),
    fetchMessages: async (sessionId: string) => {
      const page = await fetchSessionMessagesPage(sessionId, 0, 100)
      return (page?.messages ?? []) as Array<{ role?: string; content?: unknown; createdAt?: number }>
    },
    activeSessionId: () => chatStore.activeSessionId,
    mainTitle: () => String(chatStore.activeSession?.title ?? '未命名'),
  }
}

async function submit(): Promise<void> {
  const ok = await askBtw(deps(), question.value, {
    agent: ideAgentToChatAgent(ide.agentId) as never,
    codingAgentId: ide.agentId,
    codingAgentMode: 'global',
    source: 'coding_agent',
    workspace: ide.workspace,
  })
  if (ok) question.value = ''
}

async function copyNote(exchangeId: string): Promise<void> {
  const x = btwStateView.exchanges.find((e) => e.exchangeId === exchangeId)
  const note = x ? btwNoteText(x) : null
  if (!note) return
  try {
    await navigator.clipboard.writeText(note)
    copiedId.value = exchangeId
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch { /* 剪贴板不可用时不置态 */ }
}

function openBtwSession(): void {
  const mainSid = chatStore.activeSessionId
  if (!mainSid) return
  const sid = btwSessionOf(mainSid)
  if (sid) void chatStore.switchSession(sid)
}

async function refresh(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (sid) await refreshBtw(deps(), sid)
}

onMounted(refresh)
watch(() => chatStore.activeSessionId, refresh)
</script>

<template>
  <div class="ide-btw" data-testid="ide-btw">
    <div class="ide-btw__head">
      <span>⇋ 侧问（不打断主任务）</span>
      <button type="button" data-testid="ide-btw-open" title="打开侧问会话" @click="openBtwSession">↗</button>
      <button type="button" data-testid="ide-btw-refresh" title="刷新回答" @click="refresh">↻</button>
      <button type="button" data-testid="ide-btw-close" @click="emit('close')">✕</button>
    </div>
    <div class="ide-btw__ask">
      <textarea v-model="question" rows="2" data-testid="ide-btw-input" placeholder="小问题旁路问一句（如：这个函数的边界条件？）" />
      <button type="button" data-testid="ide-btw-send" :disabled="btwStateView.asking || !question.trim()" @click="submit">
        {{ btwStateView.asking ? '提问中…' : '侧问' }}
      </button>
    </div>
    <div v-if="btwStateView.error" class="ide-btw__error" data-testid="ide-btw-error">{{ btwStateView.error }}</div>
    <div class="ide-btw__list">
      <div v-if="!btwStateView.exchanges.length" class="ide-btw__empty">暂无侧问。提问后回答在旁路会话生成，↻ 刷新查看。</div>
      <div v-for="x in btwStateView.exchanges" :key="x.exchangeId" class="ide-btw__x" :data-testid="`ide-btw-x-${x.exchangeId}`">
        <div class="ide-btw__q">Q：{{ x.question }}</div>
        <div v-if="x.answer" class="ide-btw__a">A：{{ x.answer.slice(0, 300) }}</div>
        <div v-else class="ide-btw__waiting">等待回答…（↻ 刷新）</div>
        <button
          v-if="x.answer"
          type="button"
          class="ide-btw__copy"
          :data-testid="`ide-btw-copy-${x.exchangeId}`"
          title="复制旁注（粘贴到主会话输入框由你决定何时发，不打断主任务）"
          @click="copyNote(x.exchangeId)"
        >{{ copiedId === x.exchangeId ? '✓ 已复制' : '⧉ 复制旁注' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-btw {
  position: absolute; top: 44px; right: 16px; z-index: 60; width: 320px; max-height: 60vh;
  display: flex; flex-direction: column;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 12px;
}
.ide-btw__head { display: flex; gap: 6px; align-items: center; padding: 8px 10px; font-weight: 600; border-bottom: 1px solid var(--border-color, #eee); }
.ide-btw__head span { flex: 1; }
.ide-btw__head button { border: none; background: none; cursor: pointer; }
.ide-btw__ask { display: flex; gap: 6px; padding: 8px 10px; }
.ide-btw__ask textarea { flex: 1; border: 1px solid var(--border-color, #ddd); border-radius: 6px; padding: 4px 6px; font-size: 12px; resize: vertical; }
.ide-btw__ask button { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: none; border-radius: 6px; padding: 2px 10px; cursor: pointer; align-self: flex-end; }
.ide-btw__error { color: var(--error-color, #d03050); padding: 0 10px 6px; font-size: 11px; }
.ide-btw__list { overflow-y: auto; padding: 0 10px 10px; }
.ide-btw__empty { color: var(--text-color-3, #999); padding: 8px 0; }
.ide-btw__x { border-top: 1px dashed var(--border-color, #eee); padding: 6px 0; }
.ide-btw__q { font-weight: 600; }
.ide-btw__a { color: var(--text-color-2, #555); white-space: pre-wrap; margin-top: 2px; }
.ide-btw__waiting { color: var(--warning-color, #f0a020); margin-top: 2px; }
.ide-btw__copy { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 4px; font-size: 10px; padding: 1px 6px; cursor: pointer; margin-top: 4px; }
</style>
