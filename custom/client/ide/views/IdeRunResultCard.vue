<script setup lang="ts">
// IdeRunResultCard — 轮结果卡（R3，codex-product 任务结果卡语义）：
// 时长 + 验证摘要 + 文件 ± 行数 + per-turn 变更清单（dsh per-turn changed-files 语义）。
// 数据面全只读：chatStore.runStartedAt（时长）+ lastCompletedSummary（验证 bullet）
// + workspace_run_changes（文件变更，fetchWorkspaceRunChangesForSession）。
// 渲染条件：非运行中 && 最近一轮已开始过 && 会话有 workspace。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { ideRunsApi, digestRunChanges, type RunChangesDigest } from '../api/runs'
import { formatRelativeTime } from '../utils/time'

const { t } = useI18n()
const ide = useIdeStore()
const chatStore = useChatStore()

// 时长：本轮 runStartedAt → 最近一次轮结束（isRunActive false 翻转时刻不可知，
// 以最后一次会话 updatedAt 近似；running 中不渲染本卡）
const running = computed(() => Boolean(chatStore.isRunActive || chatStore.abortState))
const runStartMap = computed(() => chatStore.runStartedAt as unknown as Map<string, number>)
const runStartedAt = computed(() => {
  const sid = chatStore.activeSessionId
  return (sid && runStartMap.value?.get(sid)) || null
})
const sessionUpdatedAt = computed(() => chatStore.activeSession?.updatedAt ?? 0)
const elapsedSeconds = computed(() => {
  if (!runStartedAt.value || !sessionUpdatedAt.value) return 0
  return Math.max(0, Math.floor((sessionUpdatedAt.value - runStartedAt.value) / 1000))
})
const elapsedText = computed(() => {
  const s = elapsedSeconds.value
  if (s <= 0) return ''
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}${t('ide.min')}${sec}${t('ide.sec')}` : `${sec}${t('ide.sec')}`
})

// 验证 bullet：最后一条 assistant 摘要（lastCompletedSummary 同款口径放宽）
const verifyBullet = computed(() => {
  const session = chatStore.activeSession
  if (!session?.messages?.length) return ''
  const last = [...session.messages].reverse().find((m) => m.role === 'assistant')
  const text = typeof last?.content === 'string' ? last!.content.replace(/\s+/g, ' ').trim() : ''
  return text.slice(0, 60)
})

// per-turn 变更（按 run_id 聚合；新→旧）
const digests = ref<RunChangesDigest[]>([])
const loaded = ref(false)
async function load(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  try {
    const rows = await ideRunsApi.changes(sid)
    digests.value = digestRunChanges(rows)
  } catch {
    digests.value = []
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(
  () => chatStore.isRunActive,
  (active, prev) => {
    if (!active && prev) void load()
  },
)

const visible = computed(
  () =>
    !running.value &&
    loaded.value &&
    Boolean(ide.workspace) &&
    (runStartedAt.value != null || digests.value.length > 0),
)
</script>

<template>
  <div v-if="visible" class="ide-runresult" data-testid="ide-run-result">
    <div class="ide-runresult__head">
      <span class="ide-runresult__kicker">{{ t('ide.runResult.title') }}</span>
      <span v-if="elapsedText" class="ide-runresult__elapsed">⏱ {{ elapsedText }}</span>
      <span v-if="sessionUpdatedAt" class="ide-runresult__time">{{ formatRelativeTime(t, sessionUpdatedAt) }}</span>
    </div>
    <div v-if="verifyBullet" class="ide-runresult__verify" data-testid="ide-run-result-verify">
      {{ verifyBullet }}
    </div>
    <ul v-if="digests.length" class="ide-runresult__runs" data-testid="ide-run-result-runs">
      <li v-for="d in digests.slice(0, 3)" :key="d.runId" class="ide-runresult__run">
        <span class="ide-runresult__files">{{ t('ide.runResult.files', { count: d.fileCount }) }}</span>
        <span class="ide-runresult__delta">
          <span class="is-add">+{{ d.additions }}</span>
          <span class="is-del">−{{ d.deletions }}</span>
        </span>
        <span class="ide-runresult__paths" :title="d.files.map((f) => f.path).join('\n')">
          {{ d.files.slice(0, 2).map((f) => f.path.split('/').pop()).join(' · ') }}<template v-if="d.fileCount > 2">…</template>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.ide-runresult {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: color-mix(in srgb, var(--success-color, #98c379) 8%, transparent);
  color: var(--text-secondary, #b0b5be);
}

.ide-runresult__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ide-runresult__kicker {
  font-weight: 600;
  color: var(--success-color, #98c379);
}

.ide-runresult__elapsed {
  font-variant-numeric: tabular-nums;
}

.ide-runresult__time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
}

.ide-runresult__verify {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-runresult__runs {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.ide-runresult__run {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 2px 0;
  font-size: 11px;
}

.ide-runresult__delta {
  font-variant-numeric: tabular-nums;

  .is-add { color: var(--success-color, #98c379); }
  .is-del { color: #e06c75; margin-left: 4px; }
}

.ide-runresult__paths {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, #9aa0aa);
  font-family: ui-monospace, monospace;
}
</style>
