<script setup lang="ts">
// IdeBgTasksPanel — 后台任务中心（B1，09-19 全景 #7：cc/kimi/mcode /tasks 统一面板
// 对照的 /ide 形态）。聚合三个真实数据源（全部为此前已接线的面，中心做跨源总览）：
//   ① 后台子代理（chatStore.subagentStreams，跨会话全局视图——不同于 IdeAgentsView
//      的会话内过滤，中心看全部；点击开子代理浮窗）
//   ② 自治队列（/api/zcode-engine/queue/:workspace，A6 已接；只读总览+去排队面板处置）
//   ③ 当前会话工作流运行（/api/zcode-engine/workflow/runs，点击开 workflow 页签）
// 完成通知归 IdeActivityInbox（不重复造）；无条目时各节显示空态文案（不假数据）。
import { computed, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { useNowTick } from '@/custom/ia2/composables/useNowTick'
import { authFetch } from '../utils/auth-fetch'

const emit = defineEmits<{ (e: 'close'): void }>()
const chat = useChatStore()
const ide = useIdeStore()
const nowTick = useNowTick()

// ── ① 后台子代理（全局，跨会话）──
const subagents = computed(() => {
  void nowTick.value // 30s 重算 age
  const list: Array<{ key: string; label: string; status: string; ageSec: number; sessionId: string }> = []
  for (const [key, s] of chat.subagentStreams) {
    list.push({
      key,
      label: (s as { label?: string; subagentId?: string }).label ?? String((s as { subagentId?: string }).subagentId ?? key),
      status: String((s as { status?: string }).status ?? 'unknown'),
      ageSec: Math.max(0, Math.round((Date.now() - ((s as { updatedAt?: number }).updatedAt ?? Date.now())) / 1000)),
      sessionId: String((s as { sessionId?: string }).sessionId ?? ''),
    })
  }
  return list.sort((a, b) => a.ageSec - b.ageSec)
})

// ── ② 自治队列（workspace 级）──
const queueItems = ref<Array<{ itemId: string; text: string; origin: string; state: string }>>([])
const queueError = ref('')
async function loadQueue(): Promise<void> {
  queueError.value = ''
  const ws = ide.workspace
  if (!ws) { queueItems.value = []; return }
  try {
    const res = await authFetch(`/api/zcode-engine/queue/${encodeURIComponent(ws)}`)
    if (!res.ok) { queueError.value = `队列 ${res.status}`; return }
    const body = (await res.json()) as { queue?: Array<{ itemId: string; text: string; origin: string; state: string }> }
    queueItems.value = Array.isArray(body.queue) ? body.queue : []
  } catch { queueError.value = '队列不可达' }
}

// ── ③ 当前会话 workflow 运行 ──
const wfRuns = ref<Array<{ runId: string; name?: string; status?: string }>>([])
const wfError = ref('')
async function loadWorkflowRuns(): Promise<void> {
  wfError.value = ''
  const ws = ide.workspace
  const sid = chat.activeSessionId
  if (!ws || !sid) { wfRuns.value = []; return }
  try {
    const res = await authFetch(`/api/zcode-engine/workflow/runs?workspacePath=${encodeURIComponent(ws)}&sessionId=${encodeURIComponent(sid)}&limit=10`)
    if (!res.ok) { wfError.value = `工作流 ${res.status}`; return }
    const body = (await res.json()) as { ok?: boolean; runs?: Array<{ runId: string; name?: string; status?: string }> }
    wfRuns.value = Array.isArray(body.runs) ? body.runs : []
  } catch { wfError.value = '工作流运行不可达' }
}

onMounted(() => { void loadQueue(); void loadWorkflowRuns() })
watch(() => [ide.workspace, chat.activeSessionId], () => { void loadQueue(); void loadWorkflowRuns() })

function openAgentsFloat(): void {
  if (!ide.floats.agents) ide.toggleFloat('agents')
}
function openWorkflowTab(): void {
  ide.setSidePaneTab('workflow')
  ide.sidePane.open = true
}

const STATUS_TEXT: Record<string, string> = {
  running: '运行中', completed: '已完成', failed: '失败', error: '失败',
  interrupted: '已中断', cancelled: '已取消', pending: '排队中', yielded: '已让位',
}
</script>

<template>
  <div class="ide-bgt" data-testid="ide-bgtasks">
    <div class="ide-bgt__head">
      <span>⏱ 后台任务中心</span>
      <button type="button" data-testid="ide-bgt-refresh" title="刷新队列与工作流" @click="() => { void loadQueue(); void loadWorkflowRuns() }">↻</button>
      <button type="button" data-testid="ide-bgt-close" @click="emit('close')">✕</button>
    </div>

    <section class="ide-bgt__section" data-testid="ide-bgt-subagents">
      <div class="ide-bgt__sectitle">后台子代理 · {{ subagents.length }}</div>
      <div v-if="!subagents.length" class="ide-bgt__empty">无后台子代理</div>
      <button
        v-for="s in subagents" :key="s.key" type="button" class="ide-bgt__row"
        :data-testid="`ide-bgt-sub-${s.key}`" title="打开子代理浮窗" @click="openAgentsFloat"
      >
        <span class="ide-bgt__status" :class="`is-${s.status}`">{{ STATUS_TEXT[s.status] ?? s.status }}</span>
        {{ s.label }}
        <span class="ide-bgt__age">{{ s.ageSec }}s 前活动</span>
      </button>
    </section>

    <section class="ide-bgt__section" data-testid="ide-bgt-queue">
      <div class="ide-bgt__sectitle">自治队列 · {{ queueItems.length }}</div>
      <div v-if="queueError" class="ide-bgt__error" data-testid="ide-bgt-queue-err">{{ queueError }}</div>
      <div v-else-if="!queueItems.length" class="ide-bgt__empty">自治队列为空</div>
      <div v-for="q in queueItems" :key="q.itemId" class="ide-bgt__row is-static" :data-testid="`ide-bgt-queue-${q.itemId}`">
        <span class="ide-bgt__status">{{ STATUS_TEXT[q.state] ?? q.state }}</span>
        {{ q.text }}
        <span class="ide-bgt__age">{{ q.origin }}</span>
      </div>
    </section>

    <section class="ide-bgt__section" data-testid="ide-bgt-workflows">
      <div class="ide-bgt__sectitle">工作流运行（当前会话）· {{ wfRuns.length }}</div>
      <div v-if="wfError" class="ide-bgt__error" data-testid="ide-bgt-wf-err">{{ wfError }}</div>
      <div v-else-if="!wfRuns.length" class="ide-bgt__empty">当前会话无工作流运行</div>
      <button
        v-for="r in wfRuns" :key="r.runId" type="button" class="ide-bgt__row"
        :data-testid="`ide-bgt-wf-${r.runId}`" title="打开工作流页签" @click="openWorkflowTab"
      >
        <span class="ide-bgt__status">{{ STATUS_TEXT[r.status ?? ''] ?? r.status ?? '—' }}</span>
        {{ r.name ?? r.runId }}
      </button>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ide-bgt {
  position: absolute; top: 44px; right: 16px; z-index: 60; width: 340px; max-height: 66vh;
  display: flex; flex-direction: column; overflow-y: auto;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-size: 12px;
}
.ide-bgt__head { display: flex; gap: 6px; align-items: center; padding: 8px 10px; font-weight: 600; border-bottom: 1px solid var(--border-color, #eee); position: sticky; top: 0; background: inherit; }
.ide-bgt__head span { flex: 1; }
.ide-bgt__head button { border: none; background: none; cursor: pointer; }
.ide-bgt__section { padding: 6px 10px; }
.ide-bgt__sectitle { font-weight: 600; font-size: 11px; color: var(--text-color-3, #999); margin-bottom: 4px; }
.ide-bgt__empty { color: var(--text-color-3, #aaa); font-size: 11px; padding: 2px 0 6px; }
.ide-bgt__error { color: var(--error-color, #d03050); font-size: 11px; }
.ide-bgt__row {
  display: flex; gap: 6px; align-items: baseline; width: 100%; text-align: left;
  border: none; background: none; padding: 3px 2px; cursor: pointer; font-size: 12px;
  color: var(--text-color-2, #444); border-radius: 4px;
}
button.ide-bgt__row:hover { background: var(--hover-color, rgba(0,0,0,0.05)); }
.ide-bgt__row.is-static { cursor: default; }
.ide-bgt__status { font-size: 10px; color: var(--text-color-3, #999); flex: 0 0 auto; border: 1px solid var(--border-color, #e0e0e0); border-radius: 8px; padding: 0 6px; }
.ide-bgt__status.is-running { color: var(--primary-color, #18a058); border-color: var(--primary-color, #18a058); }
.ide-bgt__status.is-failed, .ide-bgt__status.is-error { color: var(--error-color, #d03050); border-color: var(--error-color, #d03050); }
.ide-bgt__age { margin-left: auto; font-size: 10px; color: var(--text-color-3, #bbb); }
</style>
