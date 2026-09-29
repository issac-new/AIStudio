<!-- overlay/custom/client/governance/components/ChangeGovernanceSection.vue -->
<!-- 变更治理区（调研落地轮 2026-09-29，《研发总监怎么管需求变更》产品化）：
     管控基准指标条（实绩 vs 基准 vs 判定）+ 变更单全生命周期（草稿→提交(落 SLA)
     →决议(冻结窗口 409 拦截)→实施(返工工时)）+ 三级冻结窗口管理。
     数据面 /api/change-gov/*（server change-governance-controller，挂载=patch 506）。
     词条=governance/i18n.ts changeGov 子树（zh/en 双侧）；设计文档
     docs/2026-09-29-change-gov-three-accounts-research.md §4.1。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceMessages } from '@/custom/governance/i18n'
import {
  fetchChangeGovMeta, fetchChangeRequests, fetchChangeMetrics, fetchFreezeWindows,
  createChangeRequest, updateChangeRequest, submitChangeRequest, resubmitChangeRequest,
  decideChangeRequest, implementChangeRequest, createFreezeWindow, setFreezeWindowActive,
  type ChangeGovMeta, type ChangeRequest, type ChangeMetrics, type FreezeWindow,
  type ImpactScores,
} from '@/custom/governance/api/changeGov'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance.changeGov : governanceMessages.en.governance.changeGov
})

const DIM_KEYS: Array<'schedule' | 'cost' | 'scope' | 'quality' | 'risk'> = ['schedule', 'cost', 'scope', 'quality', 'risk']
const DIM_LABELS = computed<Record<typeof DIM_KEYS[number], string>>(() => ({
  schedule: L.value.impactSchedule, cost: L.value.impactCost, scope: L.value.impactScope,
  quality: L.value.impactQuality, risk: L.value.impactRisk,
}))
const STATUS_KEYS = ['draft', 'submitted', 'approved', 'rejected', 'implemented', 'withdrawn'] as const
const METRIC_LABELS = computed<Record<string, string>>(() => ({
  monthlyNew: L.value.metricMonthlyNew, emergencyRatio: L.value.metricEmergencyRatio,
  overdueReview: L.value.metricOverdueReview, reworkHours: L.value.metricReworkHours,
  freezePenetration: L.value.metricFreezePenetration, firstPassRate: L.value.metricFirstPassRate,
}))

const meta = ref<ChangeGovMeta | null>(null)
const metrics = ref<ChangeMetrics | null>(null)
const items = ref<ChangeRequest[]>([])
const freezes = ref<FreezeWindow[]>([])
const error = ref('')
const busy = ref(false)
const showForm = ref(false)
const showFreezeForm = ref(false)

const filterStatus = ref('')
const filterLevel = ref('')

// 新建表单（五维 0-3；分级建议=紧急或总分 ≥11→L1、≥8→L2、≥4→L3、否则 L4，与服务端口径一致）
const form = reactive({
  title: '', description: '', source: '', board: '', task_id: '',
  emergency: false, level: 0, raciR: '', raciA: '', target_baseline: '',
  impact: { schedule: 0, cost: 0, scope: 0, quality: 0, risk: 0 } as ImpactScores,
})
const formMsg = ref('')
const impactTotal = computed(() => DIM_KEYS.reduce((s, k) => s + (Number(form.impact[k]) || 0), 0))
const suggestedLevel = computed(() => {
  if (form.emergency || impactTotal.value >= 11) return 1
  if (impactTotal.value >= 8) return 2
  if (impactTotal.value >= 4) return 3
  return 4
})

// 冻结窗口新建表单（datetime-local 字符串 → epoch 毫秒）
const freezeForm = reactive({ name: '', tier: 3, start: '', end: '', scope: 'all', note: '' })

// 行内决议输入（按 id 记）
const decisions = reactive<Record<string, { decider: string; note: string; override: boolean; rework: string }>>({})
function decisionOf(id: string) {
  if (!decisions[id]) {
    decisions[id] = { decider: '', note: '', override: false, rework: '' }
  }
  return decisions[id]
}

async function refresh(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const [m, ms, list, fw] = await Promise.all([
      fetchChangeGovMeta().catch(() => null),
      fetchChangeMetrics().catch(() => null),
      fetchChangeRequests({
        status: filterStatus.value || undefined,
        level: filterLevel.value ? Number(filterLevel.value) : undefined,
      }),
      fetchFreezeWindows().catch(() => ({ ok: false, items: [] as FreezeWindow[] })),
    ])
    meta.value = m
    metrics.value = ms
    items.value = list.items ?? []
    freezes.value = fw.items ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
onMounted(() => { void refresh() })

function levelKey(l: number): string { return `L${l}` }
function levelClass(l: number): string { return `cg-lv--${l}` }
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: L.value.statusDraft, submitted: L.value.statusSubmitted, approved: L.value.statusApproved,
    rejected: L.value.statusRejected, implemented: L.value.statusImplemented, withdrawn: L.value.statusWithdrawn,
  }
  return map[s] ?? s
}
function slaText(it: ChangeRequest): { text: string; over: boolean } {
  if (!it.deadline_at) return { text: L.value.noSla, over: false }
  const diffH = Math.round(((it.deadline_at - Date.now()) / 3600_000) * 10) / 10
  if (diffH >= 0) return { text: L.value.slaLeft.replace('{h}', String(diffH)), over: false }
  return { text: L.value.slaOver.replace('{h}', String(-diffH)), over: true }
}
function pct(v: number): string { return `${Math.round(v * 1000) / 10}%` }
function metricActual(cell: { key: string; actual: number }): string {
  return cell.key === 'emergencyRatio' || cell.key === 'overdueReview'
    || cell.key === 'freezePenetration' || cell.key === 'firstPassRate'
    ? pct(cell.actual) : String(cell.actual)
}
function metricBaseline(cell: { key: string; baseline: number }): string {
  return cell.key === 'firstPassRate' ? `≥${pct(cell.baseline)}` : `≤${cell.baseline}`
}
function verdictLabel(v: string): string {
  return v === 'ok' ? L.value.verdictOk : v === 'warn' ? L.value.verdictWarn : L.value.verdictOver
}

async function doCreate(andSubmit: boolean): Promise<void> {
  formMsg.value = ''
  if (!form.title.trim()) { formMsg.value = L.value.fieldTitle; return }
  busy.value = true
  try {
    const payload = {
      title: form.title, description: form.description, source: form.source,
      board: form.board, task_id: form.task_id, emergency: form.emergency,
      level: form.level || suggestedLevel.value,
      impact: { ...form.impact },
      raci: {
        ...(form.raciR ? { responsible: [form.raciR] } : {}),
        ...(form.raciA ? { approver: [form.raciA] } : {}),
      },
      target_baseline: form.target_baseline,
    }
    const created = await createChangeRequest(payload)
    if (andSubmit) await submitChangeRequest(created.item.id)
    form.title = ''; form.description = ''; form.source = ''; form.board = ''
    form.task_id = ''; form.emergency = false; form.level = 0
    form.raciR = ''; form.raciA = ''; form.target_baseline = ''
    form.impact = { schedule: 0, cost: 0, scope: 0, quality: 0, risk: 0 }
    showForm.value = false
    await refresh()
  } catch (e) {
    formMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function act(fn: () => Promise<unknown>): Promise<void> {
  busy.value = true
  try { await fn(); await refresh() } catch (e) { error.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

function submitDraft(id: string): Promise<void> { return act(() => submitChangeRequest(id)) }
function resubmit(id: string): Promise<void> { return act(() => resubmitChangeRequest(id)) }
function decide(id: string, decision: 'approve' | 'reject'): Promise<void> {
  const d = decisionOf(id)
  if (!d.decider.trim()) { error.value = L.value.deciderLabel; return Promise.resolve() }
  const it = items.value.find((x) => x.id === id)
  return act(() => decideChangeRequest(id, {
    decision, decider: d.decider, note: d.note,
    override_freeze: decision === 'approve' && !!it?.freeze_violation && d.override,
  }))
}
function implement(id: string): Promise<void> {
  const d = decisionOf(id)
  const h = Number(d.rework || 0)
  return act(() => implementChangeRequest(id, h))
}

async function doCreateFreeze(): Promise<void> {
  const starts = freezeForm.start ? Date.parse(freezeForm.start) : NaN
  const ends = freezeForm.end ? Date.parse(freezeForm.end) : NaN
  if (!freezeForm.name.trim() || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    error.value = L.value.freezeTitle
    return
  }
  await act(async () => {
    await createFreezeWindow({
      name: freezeForm.name, tier: freezeForm.tier, starts_at: starts, ends_at: ends,
      scope: freezeForm.scope, note: freezeForm.note,
    })
    freezeForm.name = ''; freezeForm.start = ''; freezeForm.end = ''; freezeForm.note = ''
    showFreezeForm.value = false
  })
}
function toggleFreeze(fw: FreezeWindow): Promise<void> { return act(() => setFreezeWindowActive(fw.id, !fw.active)) }

function fmtDate(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—'
}
</script>

<template>
  <section class="cg" data-testid="gov-change-section">
    <div class="cg__hd">
      <div>
        <h3>{{ L.title }}</h3>
        <p class="cg__sub">{{ L.sub }}</p>
      </div>
      <button type="button" class="cg__btn" data-testid="cg-refresh" :disabled="busy" @click="refresh()">{{ L.refresh }}</button>
    </div>
    <p v-if="error" class="cg__error" data-testid="cg-error">{{ L.errorLoad }}：{{ error }}</p>

    <!-- 管控基准指标条：实绩 vs 基准 vs 判定（文章 §1.1） -->
    <div v-if="metrics" class="cg__metrics" data-testid="cg-metrics">
      <div class="cg__metrics-title">{{ L.metricsTitle }} · {{ metrics.month }}（{{ metrics.submittedInMonth }}）</div>
      <div class="cg__metric-cells">
        <div
          v-for="cell in metrics.metrics" :key="cell.key"
          class="cg-mcell" :class="`cg-mcell--${cell.verdict}`"
          :data-testid="`cg-metric-${cell.key}`"
        >
          <div class="cg-mcell__label">{{ METRIC_LABELS[cell.key] || cell.key }}</div>
          <div class="cg-mcell__value">{{ metricActual(cell) }} <span class="cg-mcell__base">{{ metricBaseline(cell) }}</span></div>
          <div class="cg-mcell__verdict">{{ verdictLabel(cell.verdict) }}</div>
          <div class="cg-mcell__detail">{{ cell.detail }}</div>
        </div>
      </div>
    </div>

    <!-- 三级冻结窗口 -->
    <div class="cg__block">
      <div class="cg__block-hd">
        <h4>{{ L.freezeTitle }}</h4>
        <button type="button" class="cg__btn" data-testid="cg-freeze-new" @click="showFreezeForm = !showFreezeForm">{{ L.freezeCreate }}</button>
      </div>
      <p class="cg__hint">{{ L.freezeHint }}</p>
      <div v-if="showFreezeForm" class="cg__freeze-form" data-testid="cg-freeze-form">
        <input v-model="freezeForm.name" class="cg__in" :placeholder="L.freezeName" data-testid="cg-freeze-name">
        <select v-model.number="freezeForm.tier" class="cg__in" data-testid="cg-freeze-tier">
          <option v-for="t in meta?.freezeTiers ?? []" :key="t.tier" :value="t.tier">{{ t.tier }} · {{ t.name }}</option>
        </select>
        <input v-model="freezeForm.start" type="datetime-local" class="cg__in" :placeholder="L.freezeStart" data-testid="cg-freeze-start">
        <input v-model="freezeForm.end" type="datetime-local" class="cg__in" :placeholder="L.freezeEnd" data-testid="cg-freeze-end">
        <input v-model="freezeForm.scope" class="cg__in" :placeholder="L.freezeScope + ' (all / board slug)'" data-testid="cg-freeze-scope">
        <button type="button" class="cg__btn cg__btn--primary" data-testid="cg-freeze-create" :disabled="busy" @click="doCreateFreeze()">{{ L.freezeCreate }}</button>
      </div>
      <table v-if="freezes.length" class="cg__table" data-testid="cg-freeze-table">
        <thead><tr>
          <th>{{ L.freezeName }}</th><th>{{ L.freezeTier }}</th><th>{{ L.freezeScope }}</th>
          <th>{{ L.freezeStart }}</th><th>{{ L.freezeEnd }}</th><th/>
        </tr></thead>
        <tbody>
          <tr v-for="fw in freezes" :key="fw.id" :data-testid="`cg-freeze-row-${fw.id}`">
            <td>{{ fw.name }}</td>
            <td><span class="cg-tier" :class="`cg-tier--${fw.tier}`">T{{ fw.tier }}</span></td>
            <td>{{ fw.scope }}</td>
            <td>{{ fmtDate(fw.starts_at) }}</td>
            <td>{{ fmtDate(fw.ends_at) }}</td>
            <td>
              <span :class="fw.active ? 'cg-ok' : 'cg-muted'">{{ fw.active ? L.freezeActive : L.freezeInactive }}</span>
              <button type="button" class="cg__btn cg__btn--sm" @click="toggleFreeze(fw)">
                {{ fw.active ? L.freezeToggleOff : L.freezeToggleOn }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="cg__empty">{{ L.freezeEmpty }}</p>
    </div>

    <!-- 变更单 -->
    <div class="cg__block">
      <div class="cg__block-hd">
        <h4>{{ L.listTitle }}</h4>
        <div class="cg__filters">
          <select v-model="filterStatus" class="cg__in cg__in--sm" data-testid="cg-filter-status" @change="refresh()">
            <option value="">{{ L.filterStatus }}·{{ L.all }}</option>
            <option v-for="s in STATUS_KEYS" :key="s" :value="s">{{ statusLabel(s) }}</option>
          </select>
          <select v-model="filterLevel" class="cg__in cg__in--sm" data-testid="cg-filter-level" @change="refresh()">
            <option value="">{{ L.filterLevel }}·{{ L.all }}</option>
            <option v-for="lv in meta?.levels ?? []" :key="lv.level" :value="String(lv.level)">{{ lv.key }} · {{ lv.name }}</option>
          </select>
          <button type="button" class="cg__btn cg__btn--primary" data-testid="cg-new" @click="showForm = !showForm">{{ L.formTitle }}</button>
        </div>
      </div>

      <div v-if="showForm" class="cg__form" data-testid="cg-form">
        <input v-model="form.title" class="cg__in" :placeholder="L.fieldTitle" data-testid="cg-form-title">
        <input v-model="form.source" class="cg__in cg__in--sm" :placeholder="L.fieldSource" data-testid="cg-form-source">
        <input v-model="form.board" class="cg__in cg__in--sm" :placeholder="L.fieldBoard" data-testid="cg-form-board">
        <input v-model="form.task_id" class="cg__in cg__in--sm" :placeholder="L.fieldTask" data-testid="cg-form-task">
        <input v-model="form.target_baseline" class="cg__in cg__in--sm" :placeholder="L.fieldBaseline" data-testid="cg-form-baseline">
        <label class="cg__check"><input v-model="form.emergency" type="checkbox" data-testid="cg-form-emergency"> {{ L.fieldEmergency }}</label>
        <div class="cg__dims">
          <span class="cg__dims-label">{{ L.fieldImpact }}</span>
          <label v-for="k in DIM_KEYS" :key="k" class="cg__dim">
            {{ DIM_LABELS[k] }}
            <select v-model.number="form.impact[k]" class="cg__in cg__in--xs" :data-testid="`cg-form-impact-${k}`">
              <option :value="0">0</option><option :value="1">1</option>
              <option :value="2">2</option><option :value="3">3</option>
            </select>
          </label>
          <span class="cg__sum">Σ={{ impactTotal }} · {{ L.suggested }} L{{ suggestedLevel }}</span>
        </div>
        <input v-model="form.raciR" class="cg__in cg__in--sm" :placeholder="L.fieldRaciR" data-testid="cg-form-raci-r">
        <input v-model="form.raciA" class="cg__in cg__in--sm" :placeholder="L.fieldRaciA" data-testid="cg-form-raci-a">
        <textarea v-model="form.description" class="cg__in" rows="2" :placeholder="L.fieldDesc" data-testid="cg-form-desc" />
        <div class="cg__form-acts">
          <button type="button" class="cg__btn" data-testid="cg-form-create" :disabled="busy" @click="doCreate(false)">{{ L.create }}</button>
          <button type="button" class="cg__btn cg__btn--primary" data-testid="cg-form-create-submit" :disabled="busy" @click="doCreate(true)">{{ L.createSubmit }}</button>
        </div>
        <p v-if="formMsg" class="cg__error">{{ formMsg }}</p>
      </div>

      <table v-if="items.length" class="cg__table" data-testid="cg-table">
        <thead><tr>
          <th>{{ L.colId }}</th><th>{{ L.colTitle }}</th><th>{{ L.colLevel }}</th>
          <th>{{ L.colStatus }}</th><th>{{ L.colSla }}</th><th>{{ L.colActions }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="it in items" :key="it.id" :data-testid="`cg-row-${it.id}`">
            <td class="cg__id">{{ it.id }}</td>
            <td>
              <div class="cg__title">{{ it.title }}</div>
              <div class="cg__meta">
                <span v-if="it.emergency" class="cg-em">EM</span>
                <span>Σ{{ it.impact_total }}</span>
                <span v-if="it.board">{{ it.board }}</span>
                <span v-if="it.freeze_violation" class="cg-freeze" data-testid="cg-freeze-violation">{{ L.freezeChip }}</span>
                <span v-if="it.freeze_overridden" class="cg-freeze cg-freeze--ok">{{ L.freezeOverridden }}</span>
                <span v-if="it.resubmit_count">×{{ it.resubmit_count + 1 }}</span>
              </div>
            </td>
            <td><span class="cg-lv" :class="levelClass(it.level)">{{ levelKey(it.level) }}</span></td>
            <td><span class="cg-st" :class="`cg-st--${it.status}`">{{ statusLabel(it.status) }}</span>
              <div v-if="it.decider" class="cg__meta">{{ it.decider }}</div></td>
            <td>
              <span v-if="it.status === 'submitted'" class="cg-sla" :class="{ 'cg-sla--over': slaText(it).over }">
                {{ slaText(it).text }}
              </span>
              <span v-else class="cg-muted">{{ L.noSla }}</span>
            </td>
            <td class="cg__acts">
              <template v-if="it.status === 'submitted'">
                <div class="cg__decide" :data-testid="`cg-decide-${it.id}`">
                  <input v-model="decisionOf(it.id).decider" class="cg__in cg__in--sm" :placeholder="L.deciderLabel">
                  <input v-model="decisionOf(it.id).note" class="cg__in cg__in--sm" :placeholder="L.noteLabel">
                  <label v-if="it.freeze_violation && it.level >= 2" class="cg__check">
                    <input v-model="decisionOf(it.id).override" type="checkbox"> {{ L.freezeOverride }}
                  </label>
                  <button type="button" class="cg__btn cg__btn--sm cg__btn--ok" :data-testid="`cg-approve-${it.id}`" :disabled="busy" @click="decide(it.id, 'approve')">{{ L.actApprove }}</button>
                  <button type="button" class="cg__btn cg__btn--sm cg__btn--bad" :data-testid="`cg-reject-${it.id}`" :disabled="busy" @click="decide(it.id, 'reject')">{{ L.actReject }}</button>
                </div>
              </template>
              <template v-else-if="it.status === 'draft'">
                <button type="button" class="cg__btn cg__btn--sm cg__btn--primary" :data-testid="`cg-submit-${it.id}`" :disabled="busy" @click="submitDraft(it.id)">{{ L.actSubmit }}</button>
              </template>
              <template v-else-if="it.status === 'rejected'">
                <button type="button" class="cg__btn cg__btn--sm" :data-testid="`cg-resubmit-${it.id}`" :disabled="busy" @click="resubmit(it.id)">{{ L.actResubmit }}</button>
              </template>
              <template v-else-if="it.status === 'approved'">
                <div class="cg__decide">
                  <input v-model="decisionOf(it.id).rework" class="cg__in cg__in--xs" :placeholder="L.reworkLabel" type="number" min="0">
                  <button type="button" class="cg__btn cg__btn--sm cg__btn--primary" :data-testid="`cg-implement-${it.id}`" :disabled="busy" @click="implement(it.id)">{{ L.actImplement }}</button>
                </div>
              </template>
              <span v-else-if="it.status === 'implemented'" class="cg-muted">{{ it.rework_hours }}h</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="cg__empty">{{ L.emptyList }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cg {
  display: flex; flex-direction: column; gap: 10px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px;
  padding: 12px 14px; background: var(--bg-primary, transparent);
}
.cg__hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;
  h3 { margin: 0; font-size: 15px; } }
.cg__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted, #878c99); }
.cg__error { color: #d03050; font-size: 12px; margin: 0; }
.cg__hint { margin: 0; font-size: 12px; color: var(--text-muted, #878c99); }
.cg__empty { margin: 4px 0; font-size: 12px; color: var(--text-muted, #878c99); }
.cg__metrics-title { font-size: 12px; color: var(--text-muted, #878c99); margin-bottom: 6px; }
.cg__metric-cells { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.cg-mcell {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px;
  &--ok { border-color: #18a05833; }
  &--warn { border-color: #f0a02055; background: #f0a0200d; }
  &--over { border-color: #d0305066; background: #d030500d; }
}
.cg-mcell__label { font-size: 12px; color: var(--text-muted, #878c99); }
.cg-mcell__value { font-size: 18px; font-weight: 600; margin-top: 2px; }
.cg-mcell__base { font-size: 11px; font-weight: 400; color: var(--text-muted, #878c99); }
.cg-mcell__verdict { font-size: 11px; margin-top: 2px; }
.cg-mcell--over .cg-mcell__verdict { color: #d03050; }
.cg-mcell--warn .cg-mcell__verdict { color: #f0a020; }
.cg-mcell--ok .cg-mcell__verdict { color: #18a058; }
.cg-mcell__detail { font-size: 11px; color: var(--text-muted, #878c99); margin-top: 2px; }
.cg__block { display: flex; flex-direction: column; gap: 6px;
  h4 { margin: 0; font-size: 13px; } }
.cg__block-hd { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.cg__filters { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.cg__freeze-form, .cg__form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px; }
.cg__form { flex-direction: column; align-items: stretch; }
.cg__form .cg__in { width: 100%; box-sizing: border-box; }
.cg__form-acts { display: flex; gap: 6px; }
.cg__in {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px;
  padding: 4px 8px; font-size: 12px; font-family: inherit;
  background: var(--bg-secondary, #f1f2f4); color: inherit;
  &--sm { width: 140px; } &--xs { width: 70px; }
}
.cg__check { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; }
.cg__dims { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.cg__dims-label { color: var(--text-muted, #878c99); }
.cg__dim { display: inline-flex; gap: 4px; align-items: center; }
.cg__sum { color: var(--text-muted, #878c99); }
.cg__table { width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: top; }
  th { color: var(--text-muted, #878c99); font-weight: 500; } }
.cg__id { font-family: ui-monospace, monospace; font-size: 11px; white-space: nowrap; }
.cg__title { font-weight: 500; }
.cg__meta { display: flex; gap: 6px; font-size: 11px; color: var(--text-muted, #878c99); margin-top: 2px; flex-wrap: wrap; }
.cg__acts { min-width: 260px; }
.cg__decide { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.cg__btn {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; background: var(--bg-secondary, #f1f2f4);
  color: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; font-family: inherit;
  &:hover:not(:disabled) { border-color: var(--accent-primary, #3b82f6); }
  &:disabled { opacity: 0.5; cursor: default; }
  &--sm { padding: 2px 8px; font-size: 11px; }
  &--primary { background: var(--accent-primary, #3b82f6); border-color: var(--accent-primary, #3b82f6); color: #fff; }
  &--ok { background: #18a058; border-color: #18a058; color: #fff; }
  &--bad { background: transparent; border-color: #d03050; color: #d03050; }
}
.cg-lv {
  display: inline-block; border-radius: 5px; padding: 1px 7px; font-size: 11px; font-weight: 600; color: #fff;
  &--1 { background: #d03050; } &--2 { background: #f0a020; }
  &--3 { background: #4a7cc7; } &--4 { background: #878c99; }
}
.cg-st {
  display: inline-block; border-radius: 5px; padding: 1px 7px; font-size: 11px;
  &--draft { background: var(--bg-secondary, #f1f2f4); color: var(--text-muted, #878c99); }
  &--submitted { background: #4a7cc722; color: #4a7cc7; }
  &--approved { background: #18a05822; color: #18a058; }
  &--rejected { background: #d0305022; color: #d03050; }
  &--implemented { background: #18a05822; color: #18a058; }
  &--withdrawn { background: var(--bg-secondary, #f1f2f4); color: var(--text-muted, #878c99); }
}
.cg-sla { font-size: 11px; white-space: nowrap; color: #4a7cc7; &--over { color: #d03050; font-weight: 600; } }
.cg-em { color: #d03050; font-weight: 700; font-size: 10px; border: 1px solid #d03050; border-radius: 4px; padding: 0 3px; }
.cg-freeze { color: #d03050; border: 1px dashed #d03050; border-radius: 4px; padding: 0 4px; font-size: 10px;
  &--ok { color: #f0a020; border-color: #f0a020; } }
.cg-tier { display: inline-block; border-radius: 4px; padding: 0 5px; font-size: 11px; color: #fff;
  &--1 { background: #878c99; } &--2 { background: #f0a020; } &--3 { background: #d03050; } }
.cg-ok { color: #18a058; font-size: 11px; margin-right: 4px; }
.cg-muted { color: var(--text-muted, #878c99); font-size: 11px; }
</style>
