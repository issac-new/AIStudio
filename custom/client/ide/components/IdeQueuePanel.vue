<script setup lang="ts">
// IdeQueuePanel — 排队面板（复刻 multica/codex queue 排队任务管理+claude-code 发送
// 队列灰显形态；UI 复刻 R7）。数据=chatStore 消息队列/运行态（运行中时排队态可见）。
// A6 扩展（2026-09-29）：① 行级「立即转向」= steer 真通道（chatStore.insertQueuedMessage
// → socket insert_queued_run，队列插入中断当前 turn；仅 id 在服务端权威队列内的行
// 显示按钮，不做假按钮）；② GOAL-05 自治队列区（/api/zcode-engine/queue/* 此前零
// 消费者）：让位 yield/恢复 drain/刷新，origin×state 真实投影。
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'

const chatStore = useChatStore()
const ide = useIdeStore()

interface QueuedItem { id: string; text: string; state: 'queued' | 'sent'; steerable: boolean }

/** 服务端权威队列（queuedUserMessages）∪ 消息流 queued 标志（R7 兼容面）；
 *  steerable = id 在权威队列内（insertQueuedMessage 的接受判据，不在则不显示按钮）。 */
const queue = computed<QueuedItem[]>(() => {
  const sid = chatStore.activeSessionId ?? ''
  const authoritative = new Map<string, string>()
  const serverQueue = (chatStore as unknown as { queuedUserMessages?: Map<string, Array<{ id?: string; content?: unknown }>> }).queuedUserMessages
  for (const m of serverQueue?.get(sid) ?? []) {
    authoritative.set(String(m.id ?? ''), String(typeof m.content === 'string' ? m.content : '').slice(0, 80))
  }
  const msgs = (chatStore.activeSession?.messages ?? []) as Array<{ id?: string; queued?: boolean; content?: unknown }>
  const rows: QueuedItem[] = []
  const seen = new Set<string>()
  for (const [id, text] of authoritative) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    rows.push({ id, text, state: 'queued', steerable: true })
  }
  msgs.filter((m) => m.queued).forEach((m, i) => {
    const id = String(m.id ?? `q${i}`)
    if (seen.has(id)) return
    seen.add(id)
    rows.push({ id, text: String(typeof m.content === 'string' ? m.content : '').slice(0, 80), state: 'queued', steerable: false })
  })
  return rows
})

const isRunning = computed(() => Boolean((chatStore as unknown as { isLoading?: boolean }).isLoading))

/** 立即转向（steer）：队列插入中断当前 turn 注入该消息。 */
function steer(id: string): void {
  const sid = chatStore.activeSessionId
  if (!sid || !id) return
  const fn = (chatStore as unknown as { insertQueuedMessage?: (s: string, m: string) => void }).insertQueuedMessage
  fn?.call(chatStore, sid, id)
}

// ── GOAL-05 自治队列（dispatch-queue）──
interface AutonomyItem { itemId: string; origin: string; text: string; state: string; source?: string }
const autonomyQueue = ref<AutonomyItem[]>([])
const autonomyNote = ref('')
const autonomyBusy = ref(false)

async function fetchAutonomyQueue(): Promise<void> {
  const ws = ide.workspace
  if (!ws) { autonomyQueue.value = []; return }
  try {
    const res = await fetch(`/api/zcode-engine/queue/${encodeURIComponent(ws)}`)
    if (!res.ok) return
    const body = (await res.json()) as { ok?: boolean; queue?: AutonomyItem[] }
    autonomyQueue.value = Array.isArray(body.queue) ? body.queue : []
  } catch { /* 队列不可达保持旧数据 */ }
}

async function autonomyAction(kind: 'yield' | 'drain'): Promise<void> {
  const ws = ide.workspace
  if (!ws || autonomyBusy.value) return
  autonomyBusy.value = true
  autonomyNote.value = ''
  try {
    const res = await fetch(`/api/zcode-engine/queue/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath: ws }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; yielded?: number; restored?: number; detail?: string }
    if (!res.ok || body.ok === false) {
      autonomyNote.value = body.detail || `${kind} ${res.status}`
    } else {
      autonomyNote.value = kind === 'yield' ? `已让位 ${body.yielded ?? 0} 项` : `已恢复 ${body.restored ?? 0} 项`
    }
  } catch (err) {
    autonomyNote.value = err instanceof Error ? err.message : String(err)
  } finally {
    autonomyBusy.value = false
    void fetchAutonomyQueue()
  }
}

onMounted(() => { void fetchAutonomyQueue() })
watch(() => ide.workspace, () => { void fetchAutonomyQueue() })
</script>

<template>
  <div v-if="queue.length || autonomyQueue.length" class="ide-queue" data-testid="ide-queue-panel">
    <div v-if="queue.length">
      <div class="ide-queue__head">⇉ 排队 {{ queue.length }}<span v-if="isRunning" class="ide-queue__running"> · 运行中让位</span></div>
      <div v-for="item in queue" :key="item.id" class="ide-queue__row" :data-testid="`ide-queue-${item.id}`">
        <span class="ide-queue__dot" />{{ item.text }}
        <button
          v-if="item.steerable && isRunning"
          type="button"
          class="ide-queue__steer"
          :data-testid="`ide-queue-steer-${item.id}`"
          title="立即转向：中断当前 turn 插入此条"
          @click="steer(item.id)"
        >⤴ 转向</button>
      </div>
    </div>
    <div v-if="autonomyQueue.length" class="ide-queue__autonomy" data-testid="ide-queue-autonomy">
      <div class="ide-queue__head">
        ⚙ 自治队列 {{ autonomyQueue.length }}
        <button type="button" class="ide-queue__action" data-testid="ide-queue-yield" :disabled="autonomyBusy" @click="autonomyAction('yield')">让位</button>
        <button type="button" class="ide-queue__action" data-testid="ide-queue-drain" :disabled="autonomyBusy" @click="autonomyAction('drain')">恢复</button>
      </div>
      <div v-for="a in autonomyQueue" :key="a.itemId" class="ide-queue__row" :data-testid="`ide-queue-auto-${a.itemId}`">
        <span class="ide-queue__dot is-auto" />{{ a.text }}<span class="ide-queue__meta">{{ a.origin }}·{{ a.state }}</span>
      </div>
      <div v-if="autonomyNote" class="ide-queue__note" data-testid="ide-queue-note">{{ autonomyNote }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-queue { margin: 4px 12px; font-size: 11px; }
.ide-queue__head { font-weight: 600; color: var(--text-color-3, #999); display: flex; gap: 8px; align-items: center; }
.ide-queue__running { color: var(--primary-color, #18a058); }
.ide-queue__row {
  display: flex; gap: 6px; align-items: baseline; padding: 2px 4px;
  color: var(--text-color-3, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ide-queue__dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-color-3, #bbb); flex: 0 0 5px; }
.ide-queue__dot.is-auto { background: var(--warning-color, #f0a020); }
.ide-queue__steer, .ide-queue__action {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 10px; padding: 0 6px; cursor: pointer; color: var(--text-color-3, #999); flex: 0 0 auto;
}
.ide-queue__steer:hover, .ide-queue__action:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-queue__autonomy { margin-top: 8px; border-top: 1px dashed var(--border-color, #ddd); padding-top: 6px; }
.ide-queue__meta { color: var(--text-color-3, #bbb); font-size: 10px; margin-left: 4px; }
.ide-queue__note { color: var(--text-color-3, #999); padding: 2px 4px; }
</style>
