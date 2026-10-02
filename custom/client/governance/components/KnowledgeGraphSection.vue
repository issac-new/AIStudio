<!-- overlay/custom/client/governance/components/KnowledgeGraphSection.vue -->
<!-- 板级共享知识图谱（丙7+丙8 展示面，2026-09-30 调研落地）：板摘要卡（节点/关系/类型分布）
     + 同步按钮 + 冲突收件箱（保留现值/取新值裁决）。数据全真实：
     /api/governance/knowledge-graph/*；venv 缺席如实降级提示，不编造。
     KG 演化治理扩展（2026-10-02）：同步报告显示 governed/dedup 统计；收件箱区分
     field-conflict / merge-review（带相似度）；版本与回滚区；自动同步状态行（arm/disarm/tick）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchConflictInbox, fetchKgSummary, resolveConflict, syncKnowledgeGraph,
  fetchKgVersions, rollbackKg, kgEvolutionStatus, tickKg, armKg, disarmKg,
  type BoardSyncResultDto, type ConflictInboxDto, type KgSummaryDto, type KgVersionDto, type KgEvolutionStatusDto,
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

// ---- KG 演化治理（2026-10-02） ----
const evoStatus = ref<KgEvolutionStatusDto | null>(null)
const versions = ref<KgVersionDto[]>([])
const selectedTs = ref<number | null>(null)
const confirmRollback = ref(false)
const evoBusy = ref(false)

async function refresh(): Promise<void> {
  error.value = ''
  try {
    const [s, i, st] = await Promise.all([fetchKgSummary(), fetchConflictInbox(), kgEvolutionStatus().catch(() => null)])
    summary.value = s
    inbox.value = i.inbox ?? []
    evoStatus.value = st
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
    await refreshVersions()
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

// ---- 版本与回滚（A4） ----

async function refreshVersions(): Promise<void> {
  try {
    const board = summary.value?.board ?? 'main'
    const res = await fetchKgVersions(board)
    versions.value = res.versions ?? []
    if (selectedTs.value !== null && !versions.value.some((v) => v.ts === selectedTs.value)) selectedTs.value = null
  } catch {
    versions.value = []  // 版本面缺席如实空列，不拖垮主分区
  }
}

async function doRollback(): Promise<void> {
  if (selectedTs.value === null) return
  evoBusy.value = true
  error.value = ''
  try {
    await rollbackKg(summary.value?.board ?? 'main', selectedTs.value)
    confirmRollback.value = false
    await refresh()
    await refreshVersions()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    evoBusy.value = false
  }
}

// ---- 自动同步（A1） ----

async function doTick(): Promise<void> {
  evoBusy.value = true
  try {
    await tickKg()
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    evoBusy.value = false
  }
}

async function doArm(on: boolean): Promise<void> {
  evoBusy.value = true
  try {
    await (on ? armKg() : disarmKg())
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    evoBusy.value = false
  }
}

const pendingConflicts = computed(() => inbox.value.filter((e) => !e.resolved))
const kgUnavailable = computed(() => syncResults.value?.some((r) => !r.kgAvailable) ?? false)
const fmtTime = (ts: number): string => (ts > 0 ? new Date(ts).toLocaleString() : '')

onMounted(() => {
  void refresh()
  void refreshVersions()
})
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
        <template v-if="r.governed"> · {{ L?.governedAuto }} {{ r.governed.auto }} / {{ L?.governedManual }} {{ r.governed.manual }}<template v-if="r.governed.breaker">（{{ L?.breaker }}：{{ r.governed.reason }}）</template></template>
        <template v-if="r.dedup"> · {{ L?.dedupAlias }} {{ r.dedup.autoAlias }} / {{ L?.dedupReview }} {{ r.dedup.review }}</template>
      </div>
    </div>

    <div v-if="evoStatus" class="kg__autosync" data-testid="kg-autosync">
      <h4 class="kg__panel-title">{{ L?.autoSyncTitle }}</h4>
      <div class="kg__autosync-row">
        <span class="kg__autosync-state" :data-testid="`kg-autosync-${evoStatus.envEnabled ? (evoStatus.armed ? 'on' : 'off') : 'envoff' }`">
          <template v-if="!evoStatus.envEnabled">{{ L?.autoSyncEnvOff }}</template>
          <template v-else-if="evoStatus.armed">{{ L?.autoSyncOn }}</template>
          <template v-else>{{ L?.autoSyncOff }}</template>
        </span>
        <span>· {{ L?.pending }} {{ evoStatus.pendingCount }}（{{ evoStatus.batchSize }} / {{ Math.round(evoStatus.batchWindowMs / 1000) }}s）</span>
        <span v-if="evoStatus.throttleRemainMs > 0"> · {{ L?.throttleNext }} {{ Math.ceil(evoStatus.throttleRemainMs / 60_000) }}min</span>
        <span v-else> · {{ L?.lastSuccess }}：{{ evoStatus.lastSuccessAt > 0 ? fmtTime(evoStatus.lastSuccessAt) : L?.never }}</span>
        <span class="kg__autosync-actions">
          <button type="button" data-testid="kg-tick" :disabled="evoBusy" @click="doTick()">{{ evoBusy ? L?.ticking : L?.tickNow }}</button>
          <button v-if="evoStatus.armed" type="button" data-testid="kg-disarm" :disabled="evoBusy || !evoStatus.envEnabled" @click="doArm(false)">{{ L?.disarm }}</button>
          <button v-else type="button" data-testid="kg-arm" :disabled="evoBusy || !evoStatus.envEnabled" @click="doArm(true)">{{ L?.arm }}</button>
        </span>
      </div>
    </div>

    <div class="kg__panel" data-testid="kg-versions">
      <h4 class="kg__panel-title">{{ L?.versionsTitle }}</h4>
      <div v-if="!versions.length" class="kg__empty">{{ L?.versionsEmpty }}</div>
      <div v-else class="kg__versions">
        <select v-model.number="selectedTs" class="kg__versions-select" data-testid="kg-version-select">
          <option :value="null" disabled>{{ L?.versionSelect }}</option>
          <option v-for="v in versions" :key="v.ts" :value="v.ts">
            {{ fmtTime(v.ts) }} · {{ v.nodes }} {{ L?.nodes }} · {{ Math.round(v.bytes / 1024) }}KB
          </option>
        </select>
        <template v-if="!confirmRollback">
          <button type="button" class="kg__rollback" data-testid="kg-rollback" :disabled="selectedTs === null" @click="confirmRollback = true">{{ L?.rollback }}</button>
        </template>
        <template v-else>
          <span class="kg__rollback-confirm-text">{{ L?.rollbackConfirm }}</span>
          <button type="button" class="kg__rollback" data-testid="kg-rollback-confirm" :disabled="evoBusy" @click="doRollback()">{{ L?.rollback }}</button>
          <button type="button" data-testid="kg-rollback-cancel" @click="confirmRollback = false">✕</button>
        </template>
      </div>
    </div>

    <div class="kg__panel" data-testid="kg-conflicts">
      <h4 class="kg__panel-title">{{ L?.conflictsTitle }}</h4>
      <div v-if="!pendingConflicts.length" class="kg__empty">{{ L?.conflictsEmpty }}</div>
      <div v-for="c in pendingConflicts" :key="c.inboxId" class="kg__conflict" :data-testid="`kg-conflict-${c.inboxId}`">
        <div class="kg__conflict-main">
          <span v-if="c.kind === 'merge-review'" class="kg__kind-tag" data-testid="kg-merge-review-tag">{{ L?.mergeReviewTag }}<template v-if="typeof c.similarity === 'number'"> {{ c.similarity.toFixed(2) }}</template></span>
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
.kg__kind-tag { font-size: 10px; font-family: monospace; border: 1px solid var(--warning, #f59e0b); color: var(--warning-ink, #92400e); border-radius: 8px; padding: 0 5px; margin-right: 4px; }
.kg__autosync { border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.kg__autosync-row { font-size: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.kg__autosync-state { font-weight: 600; }
.kg__autosync-actions { margin-left: auto; display: flex; gap: 4px; }
.kg__autosync-actions button { font-size: 11px; cursor: pointer; }
.kg__versions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.kg__versions-select { font-size: 12px; max-width: 280px; }
.kg__rollback { font-size: 11px; cursor: pointer; }
.kg__rollback-confirm-text { font-size: 11px; color: var(--warning-ink, #92400e); }
</style>
