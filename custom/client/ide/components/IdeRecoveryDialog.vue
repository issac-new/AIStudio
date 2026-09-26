<script setup lang="ts">
// IdeRecoveryDialog — checkpoint/rewind 四恢复选项对话框（复刻 claude-code 双击 Esc
// 恢复菜单 + zcode FileRewindDialog 行选点形态；UI 复刻 R1）。
// 数据链：GET /api/zcode-engine/rows（行锚）→ 选点 → POST /api/zcode-engine/checkpoint/recover
// （mode 四档：code-and-conversation/code-only/conversation-only/summarize-from-here）。
// 交互：行列表倒序点选恢复点 → 四档卡片选 → 确认发请求；错误如实弹。
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { fetchEngineRows, type EngineRow } from '../utils/zcode-fork'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const chatStore = useChatStore()
const ide = useIdeStore()
const rows = ref<EngineRow[]>([])
const selectedRow = ref<EngineRow | null>(null)
const busy = ref(false)

const MODES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'code-and-conversation', label: '代码 + 对话', hint: '回滚该轮文件并截断会话（双恢复）' },
  { key: 'conversation-only', label: '仅对话', hint: '只切会话分支，工作区不动' },
  { key: 'code-only', label: '仅代码', hint: '只撤该轮文件，聊天历史保留' },
  { key: 'summarize-from-here', label: '摘要从此处开始', hint: '切分支后把后续压缩为交接摘要' },
]

/** 可选恢复点：用户/助手消息行（倒序，最新在上）。 */
const selectable = computed(() =>
  rows.value.filter((r) => r.kind === 'userInput' || r.kind === 'assistantText').slice(-30).reverse(),
)

async function loadRows(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid || !ide.workspace) return
  try {
    rows.value = await fetchEngineRows(ide.workspace, sid)
    selectedRow.value = selectable.value[0] ?? null
  } catch {
    rows.value = []
  }
}

onMounted(() => { if (props.open) void loadRows() })

async function recover(mode: string): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid || !ide.workspace || !selectedRow.value || busy.value) return
  busy.value = true
  try {
    const res = await fetch('/api/zcode-engine/checkpoint/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode, workspacePath: ide.workspace, sessionId: sid,
        rowId: selectedRow.value.rowId, entityId: selectedRow.value.entityId,
        originalQueryText: selectedRow.value.text || undefined,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string }
    if (!res.ok || !body.ok) throw new Error(body.detail || `recover ${res.status}`)
    emit('close')
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="ide-recovery" data-testid="ide-recovery-dialog" role="dialog">
    <div class="ide-recovery__mask" @click="emit('close')" />
    <div class="ide-recovery__panel">
      <header class="ide-recovery__head">
        <span>⏎ 恢复到历史点</span>
        <button type="button" class="ide-recovery__close" data-testid="ide-recovery-close" @click="emit('close')">✕</button>
      </header>
      <p v-if="!selectable.length" class="ide-recovery__empty">无可恢复的行（需会话已有消息）</p>
      <ul v-else class="ide-recovery__rows" data-testid="ide-recovery-rows">
        <li
          v-for="row in selectable"
          :key="row.rowId"
          class="ide-recovery__row"
          :class="{ 'is-selected': selectedRow?.rowId === row.rowId }"
          :data-testid="`ide-recovery-row-${row.rowId}`"
          @click="selectedRow = row"
        >
          <span class="ide-recovery__kind">{{ row.kind === 'userInput' ? '问' : '答' }}</span>
          <span class="ide-recovery__text">{{ row.text }}</span>
        </li>
      </ul>
      <div class="ide-recovery__modes" data-testid="ide-recovery-modes">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          class="ide-recovery__mode"
          :data-testid="`ide-recovery-mode-${m.key}`"
          :disabled="!selectedRow || busy"
          :title="m.hint"
          @click="recover(m.key)"
        >{{ m.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-recovery { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; }
.ide-recovery__mask { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); }
.ide-recovery__panel {
  position: relative; width: 480px; max-height: 60vh; display: flex; flex-direction: column;
  background: var(--card-color, #fff); border-radius: 10px; padding: 12px 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.ide-recovery__head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.ide-recovery__close { border: none; background: transparent; cursor: pointer; color: var(--text-color-3, #999); }
.ide-recovery__empty { color: var(--text-color-3, #999); padding: 16px 0; }
.ide-recovery__rows { overflow-y: auto; margin: 8px 0; padding: 0; list-style: none; }
.ide-recovery__row {
  display: flex; gap: 6px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
  align-items: baseline;
}
.ide-recovery__row:hover { background: var(--hover-color, rgba(0, 0, 0, 0.05)); }
.ide-recovery__row.is-selected { background: var(--hover-color, rgba(0, 0, 0, 0.08)); outline: 1px solid var(--primary-color, #18a058); }
.ide-recovery__kind { flex: 0 0 16px; color: var(--text-color-3, #999); font-size: 10px; }
.ide-recovery__text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ide-recovery__modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.ide-recovery__mode {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 6px;
  padding: 8px 10px; cursor: pointer; font-size: 12px; text-align: left;
}
.ide-recovery__mode:hover:not(:disabled) { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-recovery__mode:disabled { opacity: 0.5; cursor: default; }
</style>
