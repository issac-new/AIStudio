<script setup lang="ts">
// IdeQueuePanel — 排队面板（复刻 multica/codex queue 排队任务管理+claude-code 发送
// 队列灰显形态；UI 复刻 R7）。数据=chatStore 消息队列/运行态（运行中时排队态可见）。
// A6 扩展（2026-09-29）：① 行级「立即转向」= steer 真通道（chatStore.insertQueuedMessage
// → socket insert_queued_run，队列插入中断当前 turn；仅 id 在服务端权威队列内的行
// 显示按钮，不做假按钮）；② GOAL-05 自治队列区（/api/zcode-engine/queue/* 此前零
// 消费者）：让位 yield/恢复 drain/刷新，origin×state 真实投影。
// A1 扩展（2026-09-29，opencode v2 会话契约 steer/queue 双模式吸收）：
// ③ 投递模式切换（排队=空闲边界投递 / 注入=安全边界插入打断当前 turn），
//    ide store 持久化；注入模式 + 运行中，新入队消息自动转向（旧队列项不动）。
// ④ 投递状态时间线：排队 → 注入相位（queueInsertionStates：已请求/等待工具批次/
//    停止当前 turn）→ 已投递（id 出现在 transcript 且 queued 标志消失）。
//    用户手动移除的项永不出现于 transcript，不会被误标已投递。
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { authFetch } from '../utils/auth-fetch'

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

// ── A1 ③ 投递模式 ──
type DeliveryMode = 'queue' | 'steer'
const mode = computed<DeliveryMode>(() => (ide.chatDeliveryMode === 'steer' ? 'steer' : 'queue'))

function switchMode(next: DeliveryMode): void {
  ide.setChatDeliveryMode?.(next)
}

// ── A1 ④ 注入相位（服务端 queue_insertion 相位投影）──
const PHASE_LABELS: Record<string, string> = {
  requesting: '已请求插入',
  waiting_for_tool_batch: '等待工具批次',
  stopping_current_turn: '停止当前 turn',
}
const insertion = computed<{ queueId: string; phase: string } | null>(() => {
  const sid = chatStore.activeSessionId ?? ''
  const states = (chatStore as unknown as { queueInsertionStates?: Map<string, { queueId?: string; phase?: string }> }).queueInsertionStates
  const st = states?.get(sid)
  if (!st?.queueId || !st.phase) return null
  return { queueId: st.queueId, phase: st.phase }
})

// ── A1 ④ 已投递跟踪：id 曾在队列（快照），现从队列消失且出现在 transcript
// 且 queued 标志消失 → 已投递。用户手动移除的项永不出现于 transcript，不会误标。──
const seenQueued = ref<Map<string, { text: string; at: number }>>(new Map())
const delivered = ref<Map<string, { text: string; at: number }>>(new Map())

watch(queue, (rows) => {
  const now = Date.now()
  const currentIds = new Set(rows.map((r) => r.id))
  const transcript = (chatStore.activeSession?.messages ?? []) as Array<{ id?: string; queued?: boolean }>
  let seenChanged = false
  let deliveredChanged = false

  for (const r of rows) {
    if (!seenQueued.value.has(r.id)) {
      seenQueued.value = new Map(seenQueued.value).set(r.id, { text: r.text, at: now })
      seenChanged = true
    }
    // 曾标已投递但 id 回到队列（服务端权威队列重建）→ 撤销误标
    if (delivered.value.has(r.id)) {
      delivered.value = new Map(delivered.value)
      delivered.value.delete(r.id)
      deliveredChanged = true
    }
  }

  for (const [id, meta] of seenQueued.value) {
    if (currentIds.has(id) || delivered.value.has(id)) continue
    const hit = transcript.some((m) => String(m.id ?? '') === id && !m.queued)
    if (hit) {
      delivered.value = new Map(delivered.value).set(id, { text: meta.text, at: now })
      deliveredChanged = true
    }
  }

  // 10 分钟清理：已投递时间线与入队快照都有界
  if (seenChanged || deliveredChanged || seenQueued.value.size + delivered.value.size > 64) {
    const nextSeen = new Map(seenQueued.value)
    const nextDelivered = new Map(delivered.value)
    for (const [id, v] of nextSeen) if (now - v.at > 10 * 60 * 1000) nextSeen.delete(id)
    for (const [id, v] of nextDelivered) if (now - v.at > 10 * 60 * 1000) nextDelivered.delete(id)
    seenQueued.value = nextSeen
    delivered.value = nextDelivered
  }
}, { immediate: true })

const deliveredRows = computed(() =>
  [...delivered.value.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 5))

/** 立即转向（steer）：队列插入中断当前 turn 注入该消息。 */
function steer(id: string): void {
  const sid = chatStore.activeSessionId
  if (!sid || !id) return
  const fn = (chatStore as unknown as { insertQueuedMessage?: (s: string, m: string) => void }).insertQueuedMessage
  fn?.call(chatStore, sid, id)
}

// ── A1 ③ 自动转向：注入模式 + 运行中，模式切换之后新入队的消息自动 steer ──
// 切换到注入时把已在队列的 id 记为已处理（它们是排队语义下入队的，不追打）。
const steeredIds = new Set<string>()

watch(mode, () => {
  const sid = chatStore.activeSessionId ?? ''
  const serverQueue = (chatStore as unknown as { queuedUserMessages?: Map<string, Array<{ id?: string }>> }).queuedUserMessages
  for (const m of serverQueue?.get(sid) ?? []) {
    const id = String(m.id ?? '')
    if (id) steeredIds.add(id)
  }
})

watch(() => {
  const sid = chatStore.activeSessionId ?? ''
  const serverQueue = (chatStore as unknown as { queuedUserMessages?: Map<string, Array<{ id?: string }>> }).queuedUserMessages
  return (serverQueue?.get(sid) ?? []).map((m) => String(m.id ?? ''))
}, (ids) => {
  if (mode.value !== 'steer' || !isRunning.value) return
  for (const id of ids) {
    if (!id || steeredIds.has(id)) continue
    steeredIds.add(id)
    steer(id)
  }
})

// ── GOAL-05 自治队列（dispatch-queue）──
interface AutonomyItem { itemId: string; origin: string; text: string; state: string; source?: string }
const autonomyQueue = ref<AutonomyItem[]>([])
const autonomyNote = ref('')
const autonomyBusy = ref(false)

async function fetchAutonomyQueue(): Promise<void> {
  const ws = ide.workspace
  if (!ws) { autonomyQueue.value = []; return }
  try {
    const res = await authFetch(`/api/zcode-engine/queue/${encodeURIComponent(ws)}`)
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
    const res = await authFetch(`/api/zcode-engine/queue/${kind}`, {
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

function formatTime(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="ide-queue" data-testid="ide-queue-panel">
    <div class="ide-queue__mode" data-testid="ide-delivery-mode">
      <span class="ide-queue__mode-label">投递</span>
      <button
        type="button"
        class="ide-queue__mode-btn"
        :class="{ 'is-active': mode === 'queue' }"
        data-testid="ide-delivery-mode-queue"
        title="排队：会话空闲边界按序投递"
        @click="switchMode('queue')"
      >⏳ 排队</button>
      <button
        type="button"
        class="ide-queue__mode-btn"
        :class="{ 'is-active': mode === 'steer' }"
        data-testid="ide-delivery-mode-steer"
        title="注入：运行中发送即中断当前 turn，在安全步边界插入"
        @click="switchMode('steer')"
      >⤴ 注入</button>
      <span v-if="mode === 'steer' && isRunning" class="ide-queue__mode-hint">新消息将立即转向</span>
    </div>
    <div v-if="queue.length">
      <div class="ide-queue__head">⇉ 排队 {{ queue.length }}<span v-if="isRunning" class="ide-queue__running"> · 运行中让位</span></div>
      <div v-for="item in queue" :key="item.id" class="ide-queue__row" :data-testid="`ide-queue-${item.id}`">
        <span class="ide-queue__dot" />{{ item.text }}
        <span
          v-if="insertion && insertion.queueId === item.id"
          class="ide-queue__phase"
          :data-testid="`ide-queue-phase-${item.id}`"
        >{{ PHASE_LABELS[insertion.phase] ?? insertion.phase }}</span>
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
    <div v-if="deliveredRows.length" class="ide-queue__delivered">
      <div class="ide-queue__head">✓ 已投递 {{ deliveredRows.length }}</div>
      <div v-for="[id, d] in deliveredRows" :key="id" class="ide-queue__row is-delivered" :data-testid="`ide-queue-delivered-${id}`">
        <span class="ide-queue__dot is-delivered" />{{ d.text }}<span class="ide-queue__meta">{{ formatTime(d.at) }}</span>
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
.ide-queue__mode { display: flex; gap: 4px; align-items: center; padding: 2px 0; }
.ide-queue__mode-label { color: var(--text-color-3, #999); }
.ide-queue__mode-btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 10px; padding: 0 6px; cursor: pointer; color: var(--text-color-3, #999);
}
.ide-queue__mode-btn.is-active {
  border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); font-weight: 600;
}
.ide-queue__mode-hint { color: var(--primary-color, #18a058); font-size: 10px; margin-left: 2px; }
.ide-queue__head { font-weight: 600; color: var(--text-color-3, #999); display: flex; gap: 8px; align-items: center; }
.ide-queue__running { color: var(--primary-color, #18a058); }
.ide-queue__row {
  display: flex; gap: 6px; align-items: baseline; padding: 2px 4px;
  color: var(--text-color-3, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ide-queue__dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-color-3, #bbb); flex: 0 0 5px; }
.ide-queue__dot.is-auto { background: var(--warning-color, #f0a020); }
.ide-queue__dot.is-delivered { background: var(--primary-color, #18a058); }
.ide-queue__steer, .ide-queue__action {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 10px; padding: 0 6px; cursor: pointer; color: var(--text-color-3, #999); flex: 0 0 auto;
}
.ide-queue__steer:hover, .ide-queue__action:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-queue__autonomy { margin-top: 8px; border-top: 1px dashed var(--border-color, #ddd); padding-top: 6px; }
.ide-queue__delivered { margin-top: 4px; }
.ide-queue__delivered .ide-queue__row { color: var(--text-color-3, #aaa); }
.ide-queue__phase {
  border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058);
  border-radius: 4px; font-size: 10px; padding: 0 4px; flex: 0 0 auto;
}
.ide-queue__meta { color: var(--text-color-3, #bbb); font-size: 10px; margin-left: 4px; }
.ide-queue__note { color: var(--text-color-3, #999); padding: 2px 4px; }
</style>
