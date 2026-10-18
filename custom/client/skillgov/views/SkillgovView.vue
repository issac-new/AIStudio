<!-- overlay/custom/client/skillgov/views/SkillgovView.vue -->
<!-- 技能治理工作台：安全扫描（Skill 三段治理第一段）+ 技能供给对账/供给。
     文案单一事实源=本模块 i18n.ts。供给默认干跑、执行需确认、只增不改。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  skillgovApi,
  type FleetMachineDto,
  type FleetReportDto,
  type ProvisionReportDto,
  type SkillScanSummaryDto,
} from '@/custom/skillgov/api'
import { skillgovMessages } from '@/custom/skillgov/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? skillgovMessages.zh.skillgov : skillgovMessages.en.skillgov
})

const tab = ref<'scan' | 'provision'>('scan')

// ── 安全扫描 ─────────────────────────────────────────
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

// ── 技能供给对账 ─────────────────────────────────────
const prov = ref<ProvisionReportDto | null>(null)
const provBusy = ref(false)
const provError = ref('')
const provMsg = ref('')
const provExpanded = ref<Set<string>>(new Set())

// ── 舰队能力（能力发现面 v1）─────────────────────────
const fleet = ref<FleetReportDto | null>(null)
const fleetQuery = ref('')
const fleetExpanded = ref<Set<string>>(new Set())

async function loadFleet(): Promise<void> {
  try {
    fleet.value = await skillgovApi.fleetReport()
  } catch { fleet.value = null }
}

function toggleFleet(machine: string): void {
  const next = new Set(fleetExpanded.value)
  if (next.has(machine)) next.delete(machine)
  else next.add(machine)
  fleetExpanded.value = next
}

/** 客户端搜索：机器名/账号名/技能名命中即保留该机器+该行。 */
const fleetFiltered = computed(() => {
  const q = fleetQuery.value.trim().toLowerCase()
  if (!q || !fleet.value) return fleet.value
  return {
    ...fleet.value,
    machines: fleet.value.machines
      .map((m) => ({
        ...m,
        profiles: m.profiles.filter(
          (p) => m.machine.toLowerCase().includes(q) || p.profile.toLowerCase().includes(q) || p.skills.some((sk) => sk.toLowerCase().includes(q)),
        ),
      }))
      .filter((m) => m.machine.toLowerCase().includes(q) || m.profiles.length > 0),
  }
})

const manifestReady = computed(() => Boolean(
  prov.value
  && prov.value.manifest.source === 'file'
  && prov.value.manifest.exists
  && prov.value.manifest.errors.length === 0,
))

async function loadProvision(): Promise<void> {
  provBusy.value = true
  provError.value = ''
  try {
    const r = await skillgovApi.provisionReport()
    prov.value = r.report
  } catch (e) {
    provError.value = (e as Error).message
  } finally {
    provBusy.value = false
  }
}

function openProvision(): void {
  tab.value = 'provision'
  if (!prov.value) void loadProvision()
  if (!fleet.value) void loadFleet()
}

async function seedManifest(): Promise<void> {
  if (!window.confirm(L.value.provision.seedConfirm)) return
  provBusy.value = true
  provError.value = ''
  provMsg.value = ''
  try {
    const current = await skillgovApi.getProvisionManifest()
    await skillgovApi.putProvisionManifest(current.manifest)
    provMsg.value = L.value.provision.seeded
    await loadProvision()
  } catch (e) {
    provError.value = (e as Error).message
  } finally {
    provBusy.value = false
  }
}

async function runApply(dryRun: boolean): Promise<void> {
  if (!dryRun && !window.confirm(L.value.provision.applyConfirm)) return
  provBusy.value = true
  provError.value = ''
  provMsg.value = ''
  try {
    const r = await skillgovApi.applyProvision({ dryRun, confirm: !dryRun })
    provMsg.value = dryRun
      ? `${L.value.provision.dryRunDone} ${r.summary.planned}（${L.value.provision.skipped} ${r.summary.skipped} / ${L.value.provision.failed} ${r.summary.failed}）`
      : `${L.value.provision.applyDone} ${r.summary.copied}（${L.value.provision.skipped} ${r.summary.skipped} / ${L.value.provision.failed} ${r.summary.failed}）`
    await loadProvision()
  } catch (e) {
    provError.value = (e as Error).message
  } finally {
    provBusy.value = false
  }
}

async function runRollback(): Promise<void> {
  if (!window.confirm(L.value.provision.rollbackConfirm)) return
  provBusy.value = true
  provError.value = ''
  provMsg.value = ''
  try {
    const r = await skillgovApi.rollbackProvision({ dryRun: false, confirm: true })
    provMsg.value = `${L.value.provision.rollbackDone} ${r.summary.removed}（${L.value.provision.skipped} ${r.summary.skipped} / ${L.value.provision.failed} ${r.summary.failed}）`
    await loadProvision()
  } catch (e) {
    provError.value = (e as Error).message
  } finally {
    provBusy.value = false
  }
}

function toggleProv(name: string): void {
  const next = new Set(provExpanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  provExpanded.value = next
}

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

    <nav class="sgov-tabs" data-testid="skillgov-tabs">
      <button type="button" :class="{ active: tab === 'scan' }" data-testid="skillgov-tab-scan" @click="tab = 'scan'">
        {{ L.provision.tabScan }}
      </button>
      <button type="button" :class="{ active: tab === 'provision' }" data-testid="skillgov-tab-provision" @click="openProvision">
        {{ L.provision.tabProvision }}
      </button>
    </nav>

    <template v-if="tab === 'scan'">
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
    </template>

    <template v-else>
      <p v-if="provError" class="sgov-view__error">{{ L.error }}：{{ provError }}</p>
      <p v-if="provMsg" class="sgov-view__ok" data-testid="skillgov-provision-msg">{{ provMsg }}</p>

      <div class="sgov-view__bar">
        <button type="button" class="primary" :disabled="provBusy" data-testid="skillgov-provision-refresh" @click="loadProvision">
          {{ provBusy ? L.provision.loading : L.provision.refresh }}
        </button>
        <button type="button" class="ghost" :disabled="provBusy" data-testid="skillgov-provision-seed" @click="seedManifest">
          {{ L.provision.seedManifest }}
        </button>
        <button type="button" class="ghost" :disabled="provBusy || !manifestReady" data-testid="skillgov-provision-dry" @click="runApply(true)">
          {{ L.provision.dryRun }}
        </button>
        <button type="button" class="ghost" :disabled="provBusy || !manifestReady" data-testid="skillgov-provision-apply" @click="runApply(false)">
          {{ L.provision.apply }}
        </button>
        <button type="button" class="ghost" :disabled="provBusy" data-testid="skillgov-provision-rollback" @click="runRollback">
          {{ L.provision.rollback }}
        </button>
      </div>

      <template v-if="prov">
        <div class="prov-meta">
          <span>{{ L.provision.manifest }}：<code>{{ prov.manifest.path }}</code></span>
          <span class="badge" :class="prov.manifest.source">
            {{ prov.manifest.source === 'file' ? L.provision.manifestSourceFile : L.provision.manifestSourceBuiltin }}
          </span>
          <span>{{ L.provision.hostRoot }}：<code>{{ prov.hostRoot }}</code></span>
          <span>
            {{ L.provision.simRoot }}：<code>{{ prov.simRoot }}</code>
            <em v-if="!prov.sim.available">（{{ L.provision.simUnavailable }}：{{ prov.sim.note }}）</em>
          </span>
        </div>

        <p v-if="!manifestReady" class="sgov-view__warn">{{ L.provision.noManifest }}</p>
        <p v-if="!prov.catalog.available" class="muted">{{ L.provision.catalogUnavailable }}：{{ prov.catalog.note }}</p>
        <p v-else class="muted">{{ L.provision.catalogHeuristic }}</p>

        <div class="sgov-view__cards" data-testid="skillgov-provision-summary">
          <div class="card-num"><span class="num">{{ prov.summary.profiles }}</span><span class="lbl">{{ L.provision.summary.profiles }}</span></div>
          <div class="card-num v-caution"><span class="num">{{ prov.summary.hostMissing }}</span><span class="lbl">{{ L.provision.summary.hostMissing }}</span></div>
          <div class="card-num"><span class="num">{{ prov.summary.simMissing }}</span><span class="lbl">{{ L.provision.summary.simMissing }}</span></div>
          <div class="card-num v-dangerous"><span class="num">{{ prov.summary.sourceMissing }}</span><span class="lbl">{{ L.provision.summary.sourceMissing }}</span></div>
          <div class="card-num"><span class="num">{{ prov.summary.disabledExpected }}</span><span class="lbl">{{ L.provision.summary.disabledExpected }}</span></div>
          <div class="card-num"><span class="num">{{ prov.summary.catalogGaps }}</span><span class="lbl">{{ L.provision.summary.catalogGaps }}</span></div>
        </div>

        <p v-if="prov.profiles.length === 0" class="muted">{{ L.provision.empty }}</p>
        <table v-else class="sgov-table" data-testid="skillgov-provision-table">
          <thead>
            <tr>
              <th>{{ L.provision.table.profile }}</th>
              <th>{{ L.provision.table.role }}</th>
              <th>{{ L.provision.table.catalog }}</th>
              <th>{{ L.provision.table.expected }}</th>
              <th>{{ L.provision.table.host }}</th>
              <th>{{ L.provision.table.sim }}</th>
              <th>{{ L.provision.table.gaps }}</th>
              <th>{{ L.provision.table.disabled }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in prov.profiles" :key="row.profile">
              <tr :data-testid="`skillgov-provision-row-${row.profile}`" @click="toggleProv(row.profile)">
                <td class="mono">{{ row.profile }}</td>
                <td>{{ row.matchedRole ?? '—' }}</td>
                <td>{{ row.catalogDeclared.length }}</td>
                <td>{{ row.expected.length }}</td>
                <td>{{ row.hostActual.length }}</td>
                <td>{{ row.simComparable ? row.simActual.length : '—' }}</td>
                <td :class="row.missingInHost.length ? 'v-caution' : ''">{{ row.missingInHost.join(', ') || '—' }}</td>
                <td>{{ row.disabledExpected.join(', ') || '—' }}</td>
              </tr>
              <tr v-if="provExpanded.has(row.profile)" class="sgov-findings">
                <td colspan="8">
                  <div class="prov-detail">
                    <div><b>{{ L.provision.table.catalog }}</b>：{{ row.catalogDeclared.join(', ') || L.provision.none }}</div>
                    <div><b>{{ L.provision.table.expected }}</b>：{{ row.expected.join(', ') || L.provision.none }}</div>
                    <div><b>{{ L.provision.table.host }}</b>：{{ row.hostActual.join(', ') || L.provision.none }}<span v-if="row.hostLinked" class="muted">（{{ L.provision.linked }} {{ row.hostLinked }}）</span></div>
                    <div v-if="row.simComparable"><b>{{ L.provision.table.sim }}</b>：{{ row.simActual.join(', ') || L.provision.none }}<span v-if="row.simLinked" class="muted">（{{ L.provision.linked }} {{ row.simLinked }}）</span></div>
                    <div v-else><b>{{ L.provision.table.sim }}</b>：<span class="muted">{{ L.provision.simNotComparable }}</span></div>
                    <div><b>{{ L.provision.table.extra }}</b>：{{ row.extraInHost.join(', ') || L.provision.none }}</div>
                    <div v-if="row.sourceMissing.length"><b>{{ L.provision.table.source }}</b>：{{ row.sourceMissing.join(', ') }}</div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <p v-if="prov.simOnlyProfiles.length" class="muted">
          sim-only：{{ prov.simOnlyProfiles.join(', ') }}
        </p>
      </template>

      <section v-if="fleet" class="fleet" data-testid="skillgov-fleet">
        <div class="fleet-head">
          <h2>{{ L.provision.fleet.title }}</h2>
          <input v-model="fleetQuery" class="fleet-search" :placeholder="L.provision.fleet.searchPh" data-testid="skillgov-fleet-search" />
        </div>
        <p v-if="!fleet.available" class="muted">{{ L.provision.fleet.unavailable }}：{{ fleet.note }}</p>
        <p v-else class="muted">{{ L.provision.fleet.note }}<template v-if="fleet.bad.length">（{{ fleet.bad.length }} 坏文件）</template></p>
        <template v-if="fleetFiltered && fleetFiltered.machines.length">
          <div class="fleet-cards">
            <div v-for="m in fleetFiltered.machines" :key="m.machine" class="fleet-card" :class="{ stale: m.stale }" :data-testid="`skillgov-fleet-${m.machine}`" @click="toggleFleet(m.machine)">
              <div class="fleet-card__head">
                <b class="mono">{{ m.machine }}</b>
                <span class="badge" :class="m.stale ? 'b-stale' : 'b-fresh'">{{ m.stale ? L.provision.fleet.staleBadge : L.provision.fleet.freshBadge }}</span>
              </div>
              <div class="fleet-card__row">
                <span>{{ L.provision.fleet.age }}：{{ m.generatedAt ? new Date(m.generatedAt).toLocaleString() : '—' }}<template v-if="m.ageMinutes >= 0">（{{ m.ageMinutes >= 1440 ? `${Math.floor(m.ageMinutes / 1440)}d` : `${m.ageMinutes}m` }}）</template></span>
              </div>
              <div class="fleet-card__row">
                <span>{{ L.provision.fleet.profiles }}：{{ m.profiles.length }} ｜ {{ L.provision.fleet.totalSkills }}：{{ m.totalSkills }}</span>
              </div>
              <table v-if="fleetExpanded.has(m.machine)" class="sgov-table fleet-table">
                <thead>
                  <tr><th>{{ L.provision.table.profile }}</th><th>{{ L.provision.table.role }}</th><th>{{ L.provision.fleet.skillCount }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="p in m.profiles" :key="p.profile">
                    <td class="mono">{{ p.profile }}</td>
                    <td>{{ p.role ?? '—' }}</td>
                    <td>{{ p.skillCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
        <p v-else-if="fleet.available" class="muted">{{ L.provision.fleet.empty }}</p>
      </section>
      <p v-else class="muted">{{ L.provision.loading }}</p>
    </template>
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
.sgov-view__ok { color: var(--success, #16a34a); font-size: 13px; }
.sgov-view__warn { color: var(--warning, #b45309); font-size: 13px; }
.sgov-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border-color, #e5e7eb); padding-bottom: 6px;
  button { border: 1px solid transparent; background: transparent; color: inherit; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; opacity: 0.7;
    &.active { opacity: 1; border-color: var(--border-color, #e5e7eb); background: var(--bg-tertiary, rgba(0,0,0,0.03)); font-weight: 600; } } }
.sgov-view__bar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.sgov-view__bar .roots { display: flex; flex-direction: column; gap: 3px; font-size: 12px; flex: 1; min-width: 240px;
  input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary, #fff); color: inherit; font-family: var(--font-mono, monospace); } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
button.ghost { background: transparent; color: inherit; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 12px;
  &:disabled { opacity: 0.5; cursor: not-allowed; } }
.prov-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; opacity: 0.85;
  code { font-family: var(--font-mono, monospace); font-size: 11px; }
  .badge { align-self: flex-start; border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; font-size: 10px;
    &.file { color: var(--success, #16a34a); }
    &.builtin { color: var(--warning, #b45309); } } }
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
.prov-detail { display: flex; flex-direction: column; gap: 4px; font-size: 12px;
  b { font-weight: 600; margin-right: 4px; } }
.sev-high { color: var(--danger, #dc2626); }
.sev-medium { color: var(--warning, #b45309); }
.chip { border: 1px solid currentColor; border-radius: 8px; padding: 0 5px; font-size: 10px; margin-right: 6px; }
.muted { opacity: 0.65; font-size: 12px; }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
.sgov-view__hint { margin: 0; }
.fleet { display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed var(--border-color, #e5e7eb); padding-top: 10px;
  h2 { font-size: 15px; margin: 0; } }
.fleet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.fleet-search { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 5px 10px; font-size: 12px; min-width: 220px; background: var(--bg-primary, #fff); color: inherit; }
.fleet-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.fleet-card { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; font-size: 12px;
  &.stale { border-color: var(--warning, #b45309); }
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__row { opacity: 0.8; } }
.fleet-table { margin-top: 6px; font-size: 12px; }
.badge { border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; font-size: 10px;
  &.b-fresh { color: var(--success, #16a34a); }
  &.b-stale { color: var(--warning, #b45309); } }
</style>
