<!-- overlay/custom/client/skillgov/views/SkillgovView.vue -->
<!-- 技能安全扫描工作台（Skill 三段治理第一段产品面）：概览卡 + 扫描按钮 + 结果表
     （判定徽标/发现数/明细展开）。文案单一事实源=本模块 i18n.ts。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { skillgovApi, type SkillScanSummaryDto } from '@/custom/skillgov/api'
import { skillgovMessages } from '@/custom/skillgov/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? skillgovMessages.zh.skillgov : skillgovMessages.en.skillgov
})

const summary = ref<SkillScanSummaryDto | null>(null)
const busy = ref(false)
const error = ref('')
const rootsInput = ref('')
const expanded = ref<Set<string>>(new Set())

async function load(): Promise<void> {
  try {
    const r = await skillgovApi.latestScan()
    summary.value = r.scanned > 0 || r.results?.length ? r : null
  } catch { /* 无记录态 */ }
}

async function scan(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const roots = rootsInput.value.trim() ? rootsInput.value.trim().split(/[:：]/).map(s => s.trim()).filter(Boolean) : undefined
    summary.value = await skillgovApi.runScan(roots)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function toggle(name: string): void {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}

function verdictClass(v: string): string {
  return v === 'dangerous' ? 'v-dangerous' : v === 'caution' ? 'v-caution' : 'v-safe'
}

/** 危险优先、注意次之的呈现序。 */
const sorted = computed(() => {
  const order = { dangerous: 0, caution: 1, safe: 2 } as Record<string, number>
  return [...(summary.value?.results ?? [])].sort((a, b) => (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9))
})

onMounted(() => void load())
</script>

<template>
  <section class="sgov-view" data-testid="skillgov-view">
    <header class="sgov-view__head">
      <div>
        <h1 class="sgov-view__title">{{ L.navTitle }}</h1>
        <p class="sgov-view__tag">{{ L.tagline }}</p>
      </div>
    </header>

    <p v-if="error" class="sgov-view__error">{{ L.error }}：{{ error }}</p>

    <div class="sgov-view__bar">
      <button type="button" class="primary" :disabled="busy" data-testid="skillgov-scan-btn" :title="L.scanNowHint" @click="scan">
        {{ busy ? L.rescanning : L.scanNow }}
      </button>
      <label class="roots">
        {{ L.roots }}
        <input v-model="rootsInput" :placeholder="L.rootsPh" data-testid="skillgov-roots" />
      </label>
      <span v-if="summary" class="muted">{{ L.latest }}：{{ new Date(summary.scannedAt).toLocaleString() }}</span>
    </div>

    <template v-if="summary">
      <div class="sgov-view__cards" data-testid="skillgov-summary">
        <div class="card-num"><span class="num">{{ summary.scanned }}</span><span class="lbl">{{ L.summary.scanned }}</span></div>
        <div class="card-num v-safe"><span class="num">{{ summary.byVerdict.safe }}</span><span class="lbl">{{ L.summary.safe }}</span></div>
        <div class="card-num v-caution"><span class="num">{{ summary.byVerdict.caution }}</span><span class="lbl">{{ L.summary.caution }}</span></div>
        <div class="card-num v-dangerous"><span class="num">{{ summary.byVerdict.dangerous }}</span><span class="lbl">{{ L.summary.dangerous }}</span></div>
      </div>

      <p v-if="sorted.length === 0" class="muted">{{ L.empty }}</p>
      <table v-else class="sgov-table" data-testid="skillgov-table">
        <thead>
          <tr>
            <th>{{ L.table.name }}</th>
            <th>{{ L.table.verdict }}</th>
            <th>{{ L.table.findings }}</th>
            <th>{{ L.table.dir }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in sorted" :key="row.dir">
            <tr :data-testid="`skillgov-row-${row.name}`" @click="toggle(row.name)">
              <td class="mono">{{ row.name }}</td>
              <td :class="verdictClass(row.verdict)">{{ L.verdictNames[row.verdict] }}</td>
              <td>{{ row.findingsCount }}<span v-if="row.findingsCount > 0" class="muted"> ▾</span></td>
              <td class="mono muted">{{ row.dir }}</td>
            </tr>
            <tr v-if="expanded.has(row.name) && row.findings?.length" class="sgov-findings">
              <td colspan="4">
                <ul>
                  <li v-for="(f, i) in row.findings" :key="i" :class="`sev-${f.severity}`">
                    <span class="chip">[{{ f.severity }}]</span>
                    <span class="mono">{{ f.rule }}</span>
                    <span class="mono muted">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
                    <span>{{ f.message }}</span>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </template>
    <p v-else class="muted">{{ L.never }}</p>

    <p class="muted sgov-view__hint">{{ L.enforceHint }}</p>
  </section>
</template>

<style scoped lang="scss">
.sgov-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px;
  max-width: 1080px;
  margin: 0 auto;
}
.sgov-view__head h1 { font-size: 20px; margin: 0; }
.sgov-view__tag { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
.sgov-view__error { color: var(--danger, #dc2626); font-size: 13px; }
.sgov-view__bar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.sgov-view__bar .roots { display: flex; flex-direction: column; gap: 3px; font-size: 12px; flex: 1; min-width: 240px;
  input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary, #fff); color: inherit; font-family: var(--font-mono, monospace); } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
.sgov-view__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.card-num { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
  .num { font-size: 20px; font-weight: 600; }
  .lbl { font-size: 12px; opacity: 0.7; }
  &.v-safe .num { color: var(--success, #16a34a); }
  &.v-caution .num { color: var(--warning, #b45309); }
  &.v-dangerous .num { color: var(--danger, #dc2626); } }
.sgov-table { width: 100%; border-collapse: collapse; font-size: 13px;
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  th { font-weight: 600; opacity: 0.75; }
  tbody tr { cursor: pointer; }
  td.v-safe { color: var(--success, #16a34a); font-weight: 600; }
  td.v-caution { color: var(--warning, #b45309); font-weight: 600; }
  td.v-dangerous { color: var(--danger, #dc2626); font-weight: 600; } }
.sgov-findings td { background: var(--bg-tertiary, rgba(0,0,0,0.03)); }
.sgov-findings ul { margin: 0; padding-left: 14px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.sev-high { color: var(--danger, #dc2626); }
.sev-medium { color: var(--warning, #b45309); }
.chip { border: 1px solid currentColor; border-radius: 8px; padding: 0 5px; font-size: 10px; margin-right: 6px; }
.muted { opacity: 0.65; font-size: 12px; }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
.sgov-view__hint { margin: 0; }
</style>
