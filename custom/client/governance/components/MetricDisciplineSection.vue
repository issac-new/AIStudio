<!-- overlay/custom/client/governance/components/MetricDisciplineSection.vue -->
<!-- 度量纪律（2026-11-05 组织治理能力批）：指标双轨（measure/settle）+ 四类核心派生 +
     装饰化判据（无消费者决策即装饰）+ 技能计量缺口如实标注。
     纪律：缺口态直接显示 gap 文本，不把 available:false 渲染成 0。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  fetchCoreMetrics, fetchDecorativeMetrics, fetchDecisionStageRatios, fetchMetricAudit,
  type DerivedReadingDto, type MetricIssueDto, type StageRatiosDto,
} from '@/custom/governance/api/org-governance'

const readings = ref<DerivedReadingDto[]>([])
const decorative = ref<{ key: string; title: string; judgement: string }[]>([])
const namespaces = ref<{ measure: number; settle: number }>({ measure: 0, settle: 0 })
const errorCount = ref(0)
const decorativeCount = ref(0)
const issuesByKey = ref<Record<string, MetricIssueDto[]>>({})
const skillUsage = ref<{
  available: boolean
  coverage: number | null
  declared: number
  total: number
  top: { skill: string; tasks: number }[]
  invocations: {
    available: boolean
    calls: number
    failed: number
    failureRate: number | null
    byTool: { tool: string; calls: number; failed: number }[]
    perSkill: null
    perSkillGap: string
  }
  gap?: string
} | null>(null)
const stages = ref<StageRatiosDto | null>(null)
const stageKg = ref(true)
const loading = ref(false)
const errorMsg = ref('')

async function refresh(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const [core, deco, audit, stage] = await Promise.all([
      fetchCoreMetrics(), fetchDecorativeMetrics(), fetchMetricAudit(), fetchDecisionStageRatios(),
    ])
    readings.value = core.readings
    skillUsage.value = core.skillUsage
    decorative.value = deco.entries
    namespaces.value = audit.namespaces
    errorCount.value = audit.errorCount
    decorativeCount.value = audit.decorativeCount
    const map: Record<string, MetricIssueDto[]> = {}
    for (const r of audit.rows) map[r.key] = r.issues
    issuesByKey.value = map
    stages.value = stage.ratios
    stageKg.value = stage.kgAvailable
  } catch (e) {
    errorMsg.value = `读取失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function fmt(r: DerivedReadingDto): string {
  if (!r.available || r.value === null) return '—'
  return r.unit === '%' ? `${(r.value * 100).toFixed(1)}%` : `${r.value}${r.unit ? ` ${r.unit}` : ''}`
}

function pctOrDash(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`
}

onMounted(refresh)
</script>

<template>
  <div class="md" data-testid="metric-discipline-section">
    <div class="md__bar">
      <h3 class="md__title">度量纪律</h3>
      <span class="md__hint">测量指标不进考核——指标一旦进考核，测量的就不再是能力</span>
    </div>

    <div v-if="errorMsg" class="md__err" data-testid="md-error">{{ errorMsg }}</div>

    <div class="md__stats">
      <span>measure {{ namespaces.measure }}</span>
      <span>settle {{ namespaces.settle }}</span>
      <span :class="errorCount > 0 ? 'is-bad' : ''">配置错误 {{ errorCount }}</span>
      <span :class="decorativeCount > 0 ? 'is-warn' : ''">装饰指标 {{ decorativeCount }}</span>
    </div>

    <div class="md__grid" data-testid="md-core">
      <div v-for="r in readings" :key="r.key" class="md__card" :class="r.available ? '' : 'is-gap'">
        <div class="md__card-title">{{ r.title }}</div>
        <div class="md__card-value">{{ fmt(r) }}</div>
        <div class="md__card-def">{{ r.definition }}</div>
        <div class="md__card-meta">样本 {{ r.sample }}</div>
        <div v-if="r.gap" class="md__card-gap">{{ r.gap }}</div>
      </div>
    </div>

    <div class="md__block" data-testid="md-stage">
      <div class="md__block-title">决策权审计两比例（介入阶段口径）</div>
      <div v-if="stages" class="md__stage">
        <span>设计阶段介入比 <strong>{{ pctOrDash(stages.designShare) }}</strong></span>
        <span>实质否决率 <strong>{{ pctOrDash(stages.vetoRate) }}</strong></span>
        <span class="md__muted">样本 {{ stages.staged }} 条，缺阶段 {{ stages.unstaged }} 条</span>
        <span v-if="!stageKg" class="md__bad">决策图谱不可用——读数不成立</span>
      </div>
      <div v-if="stages?.gap" class="md__card-gap">{{ stages.gap }}</div>
    </div>

    <div class="md__block" data-testid="md-decorative">
      <div class="md__block-title">装饰化清单（无消费者决策）</div>
      <div v-for="d in decorative" :key="d.key" class="md__deco-row">
        <span class="md__deco-key">{{ d.key }}</span>
        <span class="md__deco-judge">{{ d.judgement }}</span>
      </div>
      <div v-if="decorative.length === 0" class="md__muted">全部指标都有消费者决策</div>
    </div>

    <div class="md__block" data-testid="md-skills">
      <div class="md__block-title">技能调用计量</div>
      <div v-if="skillUsage">
        <div class="md__stage">
          <span>声明覆盖率 {{ pctOrDash(skillUsage.coverage) }}</span>
          <span class="md__muted">声明 {{ skillUsage.declared }} / 任务创建 {{ skillUsage.total }}</span>
        </div>
        <div v-for="s in skillUsage.top.slice(0, 6)" :key="s.skill" class="md__skill-row">
          <span class="md__deco-key">{{ s.skill }}</span>
          <span class="md__muted">{{ s.tasks }} 个任务</span>
        </div>
        <div v-if="skillUsage.invocations" class="md__stage">
          <span>技能调用 {{ skillUsage.invocations.calls }} 次</span>
          <span class="md__muted">失败率 {{ pctOrDash(skillUsage.invocations.failureRate) }}</span>
          <span v-for="t in skillUsage.invocations.byTool.slice(0, 4)" :key="t.tool" class="md__muted">{{ t.tool }} {{ t.calls }}</span>
        </div>
        <div v-if="skillUsage.invocations?.perSkillGap" class="md__card-gap">{{ skillUsage.invocations.perSkillGap }}</div>
        <div v-if="skillUsage.gap" class="md__card-gap">{{ skillUsage.gap }}</div>
      </div>
    </div>

    <div class="md__block" data-testid="md-issues">
      <div class="md__block-title">逐条体检</div>
      <div v-for="(issues, key) in issuesByKey" :key="key" class="md__issue-row">
        <span class="md__deco-key">{{ key }}</span>
        <span v-for="i in issues" :key="i.code" class="md__issue" :class="i.severity === 'error' ? 'is-bad' : 'is-warn'">{{ i.detail }}</span>
        <span v-if="issues.length === 0" class="md__ok">通过</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.md { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 8px; }
.md__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.md__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.md__hint { font-size: 10px; color: var(--warning); }
.md__err { font-size: 11px; color: var(--error); }
.md__stats { display: flex; gap: 14px; font-size: 10.5px; color: var(--text-muted); }
.md__stats .is-bad { color: var(--error); }
.md__stats .is-warn { color: var(--warning); }
.md__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
.md__card { border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
.md__card.is-gap { border-style: dashed; }
.md__card-title { font-size: 10.5px; font-weight: 600; }
.md__card-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.md__card-def { font-size: 9.5px; color: var(--text-muted); }
.md__card-meta { font-size: 9px; color: var(--text-muted); }
.md__card-gap { font-size: 9.5px; color: var(--warning); }
.md__block { border-top: 1px dashed var(--border-color); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.md__block-title { font-size: 10.5px; font-weight: 600; }
.md__stage { display: flex; gap: 14px; font-size: 10.5px; flex-wrap: wrap; }
.md__muted { color: var(--text-muted); font-size: 10px; }
.md__bad { color: var(--error); font-size: 10px; }
.md__ok { color: var(--success); font-size: 10px; }
.md__deco-row, .md__skill-row, .md__issue-row { display: flex; gap: 8px; font-size: 10px; align-items: baseline; flex-wrap: wrap; }
.md__deco-key { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; }
.md__deco-judge { color: var(--text-muted); }
.md__issue { font-size: 9.5px; }
.md__issue.is-bad { color: var(--error); }
.md__issue.is-warn { color: var(--warning); }
</style>
