<script setup lang="ts">
// IdeRunLogPanel — 执行日志区（复刻 multica execution-log-section：每 run 一行
// 状态/时长/费用、活跃在上历史折叠；UI 复刻 R5）。数据=workspace_run_changes（run 级）
// →run-log 行投影语义（结论三态/费用列）。
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { ideRunsApi, type RunChangesDigest } from '../api/runs'
import { estimateCostUsd } from '../utils/modelPricing'

const chatStore = useChatStore()
const digests = ref<RunChangesDigest[]>([])
const showHistory = ref(false)

async function load(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  try {
    const rows = await ideRunsApi.changes(sid)
    if (chatStore.activeSessionId !== sid) return
    digests.value = (rows as unknown as Array<{ run_id: string; change_id: string; finished_at?: number; started_at?: number; additions?: number; deletions?: number; files_changed?: number; model?: string; input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number }>)
      .map((s) => ({
        runId: s.run_id || s.change_id, changeId: s.change_id, fileCount: s.files_changed ?? 0,
        additions: s.additions ?? 0, deletions: s.deletions ?? 0, files: [],
        costUsd: s.model ? (estimateCostUsd(s.model, {
          inputTokens: s.input_tokens ?? 0, outputTokens: s.output_tokens ?? 0,
          cacheReadTokens: s.cache_read_tokens ?? 0, cacheWriteTokens: s.cache_write_tokens ?? 0,
        }) ?? null) : null,
        durationMs: ((s.finished_at ?? 0) - (s.started_at ?? 0)) * 1000,
      } as RunChangesDigest & { costUsd: number | null; durationMs: number }))
  } catch {
    digests.value = []
  }
}

onMounted(load)

const active = computed(() => digests.value.slice(0, 1) as Array<RunChangesDigest & { costUsd: number | null; durationMs: number }>)
const history = computed(() => digests.value.slice(1) as Array<RunChangesDigest & { costUsd: number | null; durationMs: number }>)

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}
function fmtCost(c: number | null): string {
  return c === null ? '—' : `$${c.toFixed(3)}`
}
</script>

<template>
  <div v-if="digests.length" class="ide-runlog" data-testid="ide-runlog-panel">
    <div class="ide-runlog__head">▤ 执行日志 <span class="ide-runlog__count">{{ digests.length }}</span></div>
    <div
      v-for="d in active"
      :key="d.runId"
      class="ide-runlog__row is-active"
      :data-testid="`ide-runlog-${d.runId}`"
    >
      <span class="ide-runlog__state">●</span>
      <span class="ide-runlog__id">{{ d.runId.slice(-8) }}</span>
      <span class="ide-runlog__meta">{{ d.fileCount }} 文件 +{{ d.additions }} −{{ d.deletions }}</span>
      <span class="ide-runlog__meta">{{ fmtDur(d.durationMs) }}</span>
      <span class="ide-runlog__cost">{{ fmtCost(d.costUsd) }}</span>
    </div>
    <button
      v-if="history.length"
      type="button"
      class="ide-runlog__toggle"
      data-testid="ide-runlog-toggle"
      @click="showHistory = !showHistory"
    >{{ showHistory ? '▾' : '▸' }} 历史 {{ history.length }}</button>
    <div v-if="showHistory">
      <div v-for="d in history" :key="d.runId" class="ide-runlog__row" :data-testid="`ide-runlog-${d.runId}`">
        <span class="ide-runlog__state is-done">○</span>
        <span class="ide-runlog__id">{{ d.runId.slice(-8) }}</span>
        <span class="ide-runlog__meta">{{ d.fileCount }} 文件 +{{ d.additions }} −{{ d.deletions }}</span>
        <span class="ide-runlog__meta">{{ fmtDur(d.durationMs) }}</span>
        <span class="ide-runlog__cost">{{ fmtCost(d.costUsd) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-runlog { margin: 4px 12px; font-size: 11px; }
.ide-runlog__head { font-weight: 600; color: var(--text-color-3, #999); padding: 2px 0; }
.ide-runlog__count { font-weight: 400; }
.ide-runlog__row {
  display: flex; gap: 8px; align-items: baseline; padding: 2px 4px;
  border-radius: 4px;
}
.ide-runlog__row.is-active { background: var(--hover-color, rgba(0, 0, 0, 0.04)); }
.ide-runlog__state { color: var(--primary-color, #18a058); }
.ide-runlog__state.is-done { color: var(--text-color-3, #bbb); }
.ide-runlog__id { font-family: ui-monospace, monospace; color: var(--text-color-3, #888); }
.ide-runlog__meta { color: var(--text-color-3, #999); }
.ide-runlog__cost { margin-left: auto; }
.ide-runlog__toggle {
  border: none; background: transparent; cursor: pointer; color: var(--text-color-3, #999);
  font-size: 11px; padding: 2px 4px;
}
</style>
