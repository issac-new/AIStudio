<!-- overlay/custom/client/bpa/components/BpaGovernancePanel.vue -->
<!-- 治理体检：八规则违规呈现（高危/注意）+ 覆盖率量化 + 治理参数配置。
     「流程架构不是靠自觉维护的，是靠机制约束的」（方法论第八节产品化）。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { bpaApi, type BpaArchitectureDto, type BpaAuditEntry, type BpaFramework, type ReviewDue } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; dto: BpaArchitectureDto; active?: boolean }>()
const emit = defineEmits<{ (e: 'updated', dto: BpaArchitectureDto): void }>()

const busy = ref(false)
const error = ref('')
const saved = ref(false)
const report = ref(props.dto.report)
watch(() => props.dto.report, (r) => { report.value = r })
watch(() => props.dto, () => { void loadAudit() }, { deep: true })
watch(() => props.active, (a) => { if (a) void loadAudit() }) // v-show 不重挂载：进入页签时刷新留痕与到期态

const auditHistory = ref<BpaAuditEntry[]>([])
const due = ref<ReviewDue | null>(null)
const exported = ref(false)

async function loadAudit(): Promise<void> {
  try {
    const r = await bpaApi.audit()
    auditHistory.value = r.history
    due.value = r.reviewDue
  } catch { /* fail-soft */ }
}
onMounted(() => void loadAudit())

async function rerun(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const r = await bpaApi.validate()
    report.value = r.report
    await loadAudit()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function exportReport(): Promise<void> {
  busy.value = true; error.value = ''
  try {
    const md = await bpaApi.exportMd()
    const blob = new Blob([typeof md === 'string' ? md : JSON.stringify(md)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bpa-architecture-report-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    exported.value = true
    setTimeout(() => { exported.value = false }, 2000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const cfgForm = reactive({
  framework: props.dto.config.framework as BpaFramework,
  maxDepth: props.dto.config.maxDepth,
  forbidSkippingLevel: props.dto.config.forbidSkippingLevel,
  requireEndToEnd: props.dto.config.requireEndToEnd,
  requireL3Owner: props.dto.config.requireL3Owner,
  requireL3Kpi: props.dto.config.requireL3Kpi,
  reviewCycleDays: props.dto.config.reviewCycleDays,
})
watch(() => props.dto.config, (c) => { Object.assign(cfgForm, c) })

async function saveConfig(): Promise<void> {
  busy.value = true; error.value = ''; saved.value = false
  try {
    const next = await bpaApi.saveConfig({ ...cfgForm })
    emit('updated', next)
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const violations = computed(() => report.value.violations)
const frameworkOptions: BpaFramework[] = ['OES+PCF6', 'POS+PCF5', 'MOS+PCF5', 'OMS+PCF5']
</script>

<template>
  <div class="bpa-gov" data-testid="bpa-governance-panel">
    <div class="bpa-gov__bar">
      <p class="muted hint">{{ L.governance.hint }}</p>
      <div class="bar-actions">
        <button type="button" class="primary" :disabled="busy" data-testid="bpa-rerun" @click="rerun">{{ L.governance.rerun }}</button>
        <button type="button" class="ghost" :disabled="busy" data-testid="bpa-export" @click="exportReport">{{ exported ? '✓ ' + L.governance.exported : L.governance.exportBtn }}</button>
      </div>
    </div>

    <!-- 评审周期（reviewCycleDays 活约束） -->
    <div v-if="due" class="due" :class="{ overdue: due.daysUntilDue !== null && due.daysUntilDue < 0 }" data-testid="bpa-review-due">
      <strong>{{ L.governance.reviewDue }}：{{ due.reviewCycleDays }} {{ L.governance.reviewDaysUnit === 'd' ? 'd' : '天' }}</strong>
      <span v-if="due.daysSince === null" class="muted">{{ L.governance.reviewNoBaseline }}</span>
      <span v-else>
        {{ L.governance.reviewDaysSince }} {{ due.daysSince }} {{ L.governance.reviewDaysUnit }} ·
        <template v-if="due.daysUntilDue !== null && due.daysUntilDue < 0">{{ L.governance.reviewOverdue }} {{ -due.daysUntilDue }} {{ L.governance.reviewDaysUnit }}</template>
        <template v-else>{{ L.governance.reviewLeft }} {{ due.daysUntilDue }} {{ L.governance.reviewDaysUnit }}</template>
      </span>
    </div>

    <div class="cards">
      <div class="card-num" :class="{ 'v-danger': report.bySeverity.high > 0 }">
        <span class="num">{{ report.bySeverity.high }}</span><span class="lbl">{{ L.governance.high }}</span>
      </div>
      <div class="card-num" :class="{ 'v-warn': report.bySeverity.medium > 0 }">
        <span class="num">{{ report.bySeverity.medium }}</span><span class="lbl">{{ L.governance.medium }}</span>
      </div>
      <div class="card-num"><span class="num">{{ report.ownerCoverage }}%</span><span class="lbl">{{ L.governance.ownerCoverage }}</span></div>
      <div class="card-num"><span class="num">{{ report.kpiCoverage }}%</span><span class="lbl">{{ L.governance.kpiCoverage }}</span></div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="violations.length === 0" class="ok" data-testid="bpa-gov-clean">✓ {{ L.governance.clean }}</p>

    <table v-else class="gov-table" data-testid="bpa-gov-table">
      <thead>
        <tr><th>{{ L.governance.high }}/{{ L.governance.medium }}</th><th>{{ L.registry.id }}</th><th>{{ L.registry.name }}</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="(v, i) in violations" :key="`${v.rule}:${v.nodeId}:${i}`">
          <td><span class="chip" :class="v.severity === 'high' ? 'c-high' : 'c-med'">{{ v.severity === 'high' ? L.governance.high : L.governance.medium }}</span></td>
          <td class="mono">{{ v.nodeId }}</td>
          <td>{{ v.nodeName }}</td>
          <td><span class="rule">{{ L.governance.ruleNames[v.rule] }}</span> · {{ v.detail }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 体检留痕 -->
    <section v-if="auditHistory.length" class="audit">
      <h3>{{ L.governance.auditTitle }}（{{ auditHistory.length }}）</h3>
      <p class="muted small">{{ L.governance.auditHint }}</p>
      <table class="audit-table" data-testid="bpa-audit-table">
        <thead>
          <tr>
            <th>{{ L.governance.auditCol.at }}</th>
            <th>{{ L.governance.auditCol.high }}</th>
            <th>{{ L.governance.auditCol.medium }}</th>
            <th>{{ L.governance.auditCol.owner }}</th>
            <th>{{ L.governance.auditCol.kpi }}</th>
            <th>{{ L.governance.auditCol.source }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, i) in auditHistory.slice(-8).reverse()" :key="a.at + '-' + i">
            <td class="mono">{{ new Date(a.at).toLocaleString() }}</td>
            <td :class="{ hi: a.high > 0 }">{{ a.high }}</td>
            <td>{{ a.medium }}</td>
            <td>{{ a.ownerCoverage }}%</td>
            <td>{{ a.kpiCoverage }}%</td>
            <td class="muted">{{ L.governance.sourceNames[a.source] }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <fieldset class="gov-config">
      <legend>{{ L.governance.configTitle }}</legend>
      <div class="cfg-grid">
        <label class="span2">{{ L.governance.framework }}
          <select v-model="cfgForm.framework">
            <option v-for="f in frameworkOptions" :key="f" :value="f">{{ L.frameworkNames[f] }}</option>
          </select>
        </label>
        <label>{{ L.governance.maxDepth }}
          <select v-model.number="cfgForm.maxDepth">
            <option v-for="d in [1,2,3,4,5,6]" :key="d" :value="d">L{{ d }}</option>
          </select>
        </label>
        <label>{{ L.governance.reviewCycleDays }}
          <input v-model.number="cfgForm.reviewCycleDays" type="number" min="7" max="3650" />
        </label>
        <label class="check"><input v-model="cfgForm.forbidSkippingLevel" type="checkbox" /> {{ L.governance.forbidSkippingLevel }}</label>
        <label class="check"><input v-model="cfgForm.requireEndToEnd" type="checkbox" /> {{ L.governance.requireEndToEnd }}</label>
        <label class="check"><input v-model="cfgForm.requireL3Owner" type="checkbox" /> {{ L.governance.requireL3Owner }}</label>
        <label class="check"><input v-model="cfgForm.requireL3Kpi" type="checkbox" /> {{ L.governance.requireL3Kpi }}</label>
      </div>
      <div class="cfg-actions">
        <button type="button" class="primary" :disabled="busy" data-testid="bpa-save-config" @click="saveConfig">{{ L.governance.saveConfig }}</button>
        <span v-if="saved" class="ok small">✓ {{ L.governance.saved }}</span>
      </div>
    </fieldset>
  </div>
</template>

<style scoped lang="scss">
.bpa-gov { display: flex; flex-direction: column; gap: 12px; }
.bpa-gov__bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
  .hint { margin: 0; flex: 1; min-width: 260px; }
  .bar-actions { display: flex; gap: 8px; } }
.due {
  display: flex;
  gap: 14px;
  align-items: baseline;
  flex-wrap: wrap;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  &.overdue { border-color: var(--danger, #dc2626);
    strong { color: var(--danger, #dc2626); } }
}
.audit {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  h3 { margin: 0 0 4px; font-size: 13px; }
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  th { font-weight: 600; opacity: 0.7; }
  td.hi { color: var(--danger, #dc2626); font-weight: 600; }
}
button.ghost { background: transparent; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px; color: inherit; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.card-num { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
  .num { font-size: 20px; font-weight: 600; }
  .lbl { font-size: 12px; opacity: 0.7; }
  &.v-danger .num { color: var(--danger, #dc2626); }
  &.v-warn .num { color: var(--warning, #b45309); } }
.gov-table { width: 100%; border-collapse: collapse; font-size: 13px;
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); vertical-align: top; }
  th { font-weight: 600; opacity: 0.75; }
  .rule { font-weight: 600; } }
.chip { border-radius: 8px; padding: 0 6px; font-size: 11px; color: #fff; }
.c-high { background: var(--danger, #dc2626); }
.c-med { background: var(--warning, #b45309); }
.gov-config { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 10px; padding: 12px;
  legend { font-size: 13px; font-weight: 600; padding: 0 4px; }
  .cfg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px;
    label { display: flex; flex-direction: column; gap: 3px; font-size: 12px;
      &.span2 { grid-column: span 2; }
      &.check { flex-direction: row; align-items: center; gap: 6px; }
      input, select { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 13px; background: var(--bg-primary, #fff); color: inherit; } } }
  .cfg-actions { margin-top: 10px; display: flex; gap: 10px; align-items: center; } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
.err { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.ok { color: var(--success, #16a34a); font-size: 13px; margin: 0; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
</style>
