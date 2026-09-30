<!-- overlay/custom/client/governance/components/KnowledgeGraphSection.vue -->
<!-- 板级共享知识图谱（丙7+丙8 展示面，2026-09-30 调研落地）：板摘要卡（节点/关系/类型分布）
     + 同步按钮 + 冲突收件箱（保留现值/取新值裁决）。数据全真实：
     /api/governance/knowledge-graph/*；venv 缺席如实降级提示，不编造。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchConflictInbox, fetchKgSummary, resolveConflict, syncKnowledgeGraph,
  type BoardSyncResultDto, type ConflictInboxDto, type KgSummaryDto,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { knowledgeGraph: Record<string, string> }).knowledgeGraph
})

const summary = ref<KgSummaryDto | null>(null)
const inbox = ref<ConflictInboxDto[]>([])
const syncResults = ref<BoardSyncResultDto[] | null>(null)
const error = ref('')
const busy = ref(false)

async function refresh(): Promise<void> {
  error.value = ''
  try {
    const [s, i] = await Promise.all([fetchKgSummary(), fetchConflictInbox()])
    summary.value = s
    inbox.value = i.inbox ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function syncAll(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await syncKnowledgeGraph()
    syncResults.value = res.results ?? []
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function decide(entry: ConflictInboxDto, action: 'keep-existing' | 'take-incoming'): Promise<void> {
  try {
    await resolveConflict(entry.inboxId, action)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

const pendingConflicts = computed(() => inbox.value.filter((e) => !e.resolved))
const kgUnavailable = computed(() => syncResults.value?.some((r) => !r.kgAvailable) ?? false)

onMounted(() => void refresh())
</script>

<template>
  <div class="kg" data-testid="gov-knowledge-graph">
    <div class="kg__bar">
      <h3 class="kg__title">{{ L?.title }}</h3>
      <span v-if="summary" class="kg__chip" data-testid="kg-counts">
        {{ L?.boardLabel }} {{ summary.board }} · {{ summary.nodes }} {{ L?.nodes }} · {{ summary.edges }} {{ L?.edges }}
      </span>
      <button type="button" class="kg__sync" data-testid="kg-sync" :disabled="busy" @click="syncAll()">
        {{ busy ? L?.syncing : L?.syncAll }}
      </button>
    </div>
    <p class="kg__sub">{{ L?.sub }}</p>
    <div v-if="error" class="kg__error">{{ error }}</div>
    <div v-if="kgUnavailable" class="kg__noKg" data-testid="kg-unavailable">{{ L?.noKg }}</div>
    <div v-if="summary && summary.byType && Object.keys(summary.byType).length" class="kg__types" data-testid="kg-types">
      <span v-for="(n, t) in summary.byType" :key="t" class="kg__tag">{{ t }} ×{{ n }}</span>
    </div>
    <div v-if="syncResults" class="kg__synclog" data-testid="kg-sync-log">
      <div v-for="r in syncResults" :key="r.board" class="kg__syncrow">
        {{ r.board }}：扫描 {{ r.scanned }} · 新摄取 {{ r.ingested }} · 关系 {{ r.relations }}
        <template v-if="r.conflicts.length"> · 冲突 {{ r.conflicts.length }}（进收件箱）</template>
      </div>
    </div>

    <div class="kg__panel" data-testid="kg-conflicts">
      <h4 class="kg__panel-title">{{ L?.conflictsTitle }}</h4>
      <div v-if="!pendingConflicts.length" class="kg__empty">{{ L?.conflictsEmpty }}</div>
      <div v-for="c in pendingConflicts" :key="c.inboxId" class="kg__conflict" :data-testid="`kg-conflict-${c.inboxId}`">
        <div class="kg__conflict-main">
          <b>{{ c.entityId }}</b> · {{ c.field }}：<code>{{ JSON.stringify(c.existing) }}</code> → <code>{{ JSON.stringify(c.incoming) }}</code>
          <span class="kg__conflict-board">（{{ c.board }}）</span>
        </div>
        <div class="kg__conflict-actions">
          <button type="button" data-testid="kg-keep" @click="decide(c, 'keep-existing')">{{ L?.keepExisting }}</button>
          <button type="button" data-testid="kg-take" @click="decide(c, 'take-incoming')">{{ L?.takeIncoming }}</button>
        </div>
      </div>
      <div v-if="inbox.length && !pendingConflicts.length" class="kg__resolved">
        {{ L?.resolved }} × {{ inbox.length }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.kg {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kg__bar { display: flex; align-items: center; gap: 8px; }
.kg__title { margin: 0; font-size: 14px; }
.kg__chip { font-size: 12px; opacity: 0.85; }
.kg__sync { margin-left: auto; font-size: 12px; cursor: pointer; }
.kg__sub { margin: 0; font-size: 12px; opacity: 0.7; }
.kg__error { color: var(--danger, #dc2626); font-size: 12px; }
.kg__noKg { font-size: 12px; color: var(--warning-ink, #92400e); background: rgb(254 243 199); border-radius: 6px; padding: 4px 8px; }
.kg__types { display: flex; gap: 6px; flex-wrap: wrap; }
.kg__tag { font-size: 11px; font-family: monospace; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 0 6px; }
.kg__synclog { font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
.kg__panel { border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.kg__panel-title { margin: 0; font-size: 13px; }
.kg__empty { font-size: 12px; opacity: 0.6; }
.kg__conflict { border-left: 3px solid var(--warning, #f59e0b); padding: 4px 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: space-between; }
.kg__conflict-main { font-size: 12px; }
.kg__conflict-main code { font-size: 11px; background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; }
.kg__conflict-board { opacity: 0.6; font-size: 11px; }
.kg__conflict-actions { display: flex; gap: 4px; }
.kg__conflict-actions button { font-size: 11px; cursor: pointer; }
.kg__resolved { font-size: 11px; opacity: 0.6; }
</style>
