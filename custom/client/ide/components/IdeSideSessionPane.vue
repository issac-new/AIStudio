<script setup lang="ts">
// IdeSideSessionPane — 对照分屏（B6 轻量真链：zcode WorkbenchPane 多会话并排的
// /ide 形态）。右半屏只读时间线显示另一会话（fetchSessionMessagesPage 真链，
// 30s 轮询刷新）——边看参考会话边在主屏干活；主屏 ChatPane 不动（chatStore 单会话
// 单写者纪律零破坏）。会话选择=chatStore.sessions（与左栏同源）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { fetchSessionMessagesPage } from '@/api/studio/sessions'

const emit = defineEmits<{ (e: 'close'): void }>()
const chat = useChatStore()

const selectedId = ref<string>('')
const messages = ref<Array<{ id?: string; role?: string; content?: unknown; createdAt?: number }>>([])
const state = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

/** 候选=除主会话外的全部会话（最近优先，与左栏 active 视图同序） */
const candidates = computed(() => {
  const main = chat.activeSessionId
  const list = (chat.sessions ?? []) as Array<{ id: string; title?: string; updatedAt?: number }>
  return list
    .filter((s) => s.id !== main)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 30)
})

let timer: ReturnType<typeof setInterval> | null = null
let seq = 0

async function load(): Promise<void> {
  const sid = selectedId.value
  const mySeq = ++seq
  if (!sid) { messages.value = []; state.value = 'empty'; return }
  state.value = 'loading'
  try {
    const page = await fetchSessionMessagesPage(sid, 0, 120)
    if (seq !== mySeq) return // 旧响应弃用
    messages.value = (page?.messages ?? []) as typeof messages.value
    state.value = messages.value.length ? 'ok' : 'empty'
  } catch {
    if (seq !== mySeq) return
    state.value = 'error'
  }
}

function title(): string {
  const s = candidates.value.find((c) => c.id === selectedId.value)
  return s?.title?.slice(0, 24) || selectedId.value.slice(-8)
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 30_000) // 对照面 30s 静默轮询
})
onUnmounted(() => { if (timer) clearInterval(timer) })
watch(selectedId, () => void load())
watch(() => chat.activeSessionId, () => {
  // 主会话切换后若选中者恰为新主会话则清空（对照对象不能=主对象）
  if (selectedId.value && selectedId.value === chat.activeSessionId) selectedId.value = ''
})
</script>

<template>
  <div class="ide-side-sess" data-testid="ide-side-session">
    <div class="ide-side-sess__head">
      <span class="ide-side-sess__t">⇔ 对照</span>
      <select v-model="selectedId" class="ide-side-sess__sel" data-testid="ide-side-session-select">
        <option value="">（选择对照会话）</option>
        <option v-for="c in candidates" :key="c.id" :value="c.id">{{ (c.title || c.id).slice(0, 28) }}</option>
      </select>
      <button type="button" data-testid="ide-side-session-refresh" title="立即刷新" @click="load">↻</button>
      <button type="button" data-testid="ide-side-session-close" @click="emit('close')">✕</button>
    </div>
    <div class="ide-side-sess__body">
      <div v-if="!selectedId" class="ide-side-sess__hint">选择另一会话作只读对照——主屏不动，边看边干。</div>
      <div v-else-if="state === 'loading'" class="ide-side-sess__hint">载入中…</div>
      <div v-else-if="state === 'error'" class="ide-side-sess__hint" data-testid="ide-side-session-error">会话消息拉取失败</div>
      <div v-else-if="state === 'empty'" class="ide-side-sess__hint">{{ title() }}（空会话）</div>
      <template v-else>
        <div
          v-for="m in messages" :key="m.id ?? String(m.createdAt)" class="ide-side-sess__msg"
          :class="`is-${m.role}`" :data-testid="`ide-side-session-msg-${m.role}`"
        >{{ String(typeof m.content === 'string' ? m.content : '').slice(0, 500) }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-side-sess {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 40;
  display: flex; flex-direction: column; width: 340px;
  border-left: 1px solid var(--border-color, #2a2e38);
  background: var(--bg-secondary, #1b1e24); font-size: 12px;
  box-shadow: -4px 0 16px rgba(0,0,0,0.18);
}
.ide-side-sess__head { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #2a2e38); }
.ide-side-sess__t { font-weight: 600; color: var(--text-secondary, #b0b5be); }
.ide-side-sess__sel { flex: 1; border: 1px solid var(--border-color, #3a3f4b); background: none; color: var(--text-primary, #d7dae0); border-radius: 4px; padding: 2px 4px; font-size: 11px; min-width: 0; }
.ide-side-sess__head button { border: none; background: none; color: var(--text-secondary, #b0b5be); cursor: pointer; }
.ide-side-sess__body { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }
.ide-side-sess__hint { color: var(--text-muted, #9aa0aa); padding: 8px 4px; }
.ide-side-sess__msg {
  margin: 6px 0; padding: 6px 8px; border-radius: 8px; white-space: pre-wrap; word-break: break-word;
  color: var(--text-primary, #d7dae0);
}
.ide-side-sess__msg.is-user { background: rgba(97, 175, 239, 0.08); }
.ide-side-sess__msg.is-assistant { background: rgba(255, 255, 255, 0.03); }
</style>
