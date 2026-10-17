<!-- overlay/custom/client/governance/components/AuditSection.vue -->
<!-- 统一审计查看器（4A 治理层第二期 ⑥）：审批/六域体检/provider/kanban
     四源归一单页查询。源 chips 过滤 + 文本检索 + 时间倒序表；源缺席如实灰态。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadProvO, fetchAuditLog, type AuditLogResult } from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { audit: Record<string, string> }).audit
})

const SOURCE_IDS = ['approvals', 'domain', 'provider', 'kanban'] as const
const active = ref<Set<string>>(new Set(SOURCE_IDS))
const q = ref('')
const result = ref<AuditLogResult | null>(null)
const loading = ref(false)
const provMsg = ref('')

/** PROV-O 导出（丁10 UI 化，2026-10-01）：audit 四源证据链下载为 W3C PROV JSON-LD。 */
async function exportProv(): Promise<void> {
  provMsg.value = ''
  try {
    await downloadProvO()
    provMsg.value = '已导出 JSON-LD'
  } catch (e) {
    provMsg.value = `导出失败：${e instanceof Error ? e.message : String(e)}`
  }
}

const sourceAvailable = computed(() => {
  const m = new Map<string, boolean>()
  for (const s of result.value?.sources ?? []) m.set(s.id, s.available)
  return m
})

function toggle(id: string): void {
  const next = new Set(active.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  active.value = next
  void refresh()
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function onQueryInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void refresh(), 350)
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    result.value = await fetchAuditLog({ sources: [...active.value], q: q.value, limit: 200 })
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="audit" data-testid="gov-audit">
    <div class="audit__bar">
      <h3 class="audit__title">{{ L?.title }}</h3>
      <button
        v-for="id in SOURCE_IDS"
        :key="id"
        type="button"
        class="audit__chip"
        :class="{ 'is-on': active.has(id), 'is-off': !active.has(id), 'is-na': sourceAvailable.get(id) === false }"
        :data-testid="`audit-src-${id}`"
        @click="toggle(id)"
      >{{ id }}<template v-if="sourceAvailable.get(id) === false"> · n/a</template></button>
      <input
        v-model="q"
        class="audit__q"
        :placeholder="L?.searchHint"
        data-testid="audit-q"
        @input="onQueryInput"
      />
      <span v-if="result" class="audit__count" data-testid="audit-count">{{ result.total }} {{ L?.events }}</span>
      <!-- PROV-O 导出（丁10 UI 化）：四源证据链 → W3C PROV JSON-LD 下载 -->
      <button type="button" class="audit__prov" data-testid="audit-prov-export" @click="exportProv()">⤓ PROV-O</button>
      <span v-if="provMsg" class="audit__prov-msg" data-testid="audit-prov-msg">{{ provMsg }}</span>
    </div>
    <div class="audit__body">
      <div v-if="loading && !result" class="ui-empty-state ui-empty-state--compact">…</div>
      <div v-else-if="!result || result.events.length === 0" class="ui-empty-state ui-empty-state--compact" data-testid="audit-empty">{{ L?.empty }}</div>
      <table v-else class="audit__table">
        <thead><tr><th>{{ L?.colTime }}</th><th>{{ L?.colSource }}</th><th>{{ L?.colActor }}</th><th>{{ L?.colAction }}</th><th>{{ L?.colTarget }}</th><th>{{ L?.colResult }}</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in result.events" :key="i" :data-testid="`audit-row-${e.source}`">
            <td class="audit__ts">{{ fmtTime(e.ts) }}</td>
            <td><span class="audit__badge" :class="`is-${e.source}`">{{ e.source }}</span></td>
            <td>{{ e.actor }}</td>
            <td>{{ e.action }}</td>
            <td class="audit__target" :title="e.target">{{ e.target }}</td>
            <td>{{ e.result || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audit {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.audit__bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.audit__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: 4px;
}
.audit__chip {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 1px 9px;
  font-size: 10.5px;
  cursor: pointer;
  &.is-on { color: var(--success); border-color: rgba(var(--success-rgb), 0.33); background: rgba(var(--success-rgb), 0.08); }
  &.is-off { color: var(--text-muted); opacity: 0.7; }
  &.is-na { opacity: 0.45; }
}
.audit__q {
  margin-left: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  min-width: 180px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.audit__prov { border: none; background: transparent; cursor: pointer; font-size: 12px; color: var(--accent-primary, var(--color-primary)); }
.audit__prov-msg { font-size: 11px; opacity: 0.7; }
.audit__count { font-size: 10.5px; color: var(--text-muted); }
.audit__body { max-height: 300px; overflow: auto; }
.audit__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--bg-primary); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.audit__ts { font-family: ui-monospace, monospace; font-size: 9.5px; white-space: nowrap; }
.audit__target { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit__badge { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6;
  &.is-approvals { color: var(--ia-compensated); background: color-mix(in srgb, var(--ia-compensated) 12%, transparent); }
  &.is-domain { color: var(--accent-info); background: rgba(var(--accent-info-rgb), 0.1); }
  &.is-provider { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-kanban { color: var(--success); background: rgba(var(--success-rgb), 0.08); } }
</style>
