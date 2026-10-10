<!-- overlay/custom/client/ia2/views/gov/GovHealthSection.vue -->
<!-- 治理体检区（2026-10-01 单层页签重构，用户裁定：不要二级页签）：原治理中心
     「总览」分区拆出——六闸卡（G1-G6 工件在仓锚点，G3 以开发分支数为证据）
     + 六域体检（判定引擎台账跨轮累积）。与「管理三账」同页签堆叠（同属管理者
     健康总览语义：三账看工作项分布，六闸/六域看交付治理健康）。
     数据自取：/api/governance/*（git 真仓实查，缺失如实灰态不编造）。
     testid 沿用原 GovernanceView（gov-gates/gov-gate-*/gov-domain-audit/…），
     守门测试随迁不断代。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchGovernanceOverview, runDomainAudit, fetchDomainAudit, fetchQgateVerdicts, fetchUsage, fetchBoardStatus,
  type GovernanceOverview, type DomainAuditSummary, type QgateVerdictRow, type BoardStatusEntry,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
/** 文案单一事实源=custom/governance/i18n.ts；legacy i18n 无 mergeLocaleMessage，
 *  组件内按当前 locale 选表（zh* → zh，其余 en）。 */
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
})
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const overview = ref<GovernanceOverview | null>(null)
// 跨账号板状态分布（G3 2026-10-10）：步 22 工作台账产品面——全板分状态计数+WIP。
const boardStatus = ref<BoardStatusEntry[] | null>(null)
const BOARD_COLS = ['todo', 'doing', 'review', 'blocked', 'done'] as const
const usage = ref<import('@/custom/governance/api/governance').UsageReport | null>(null)
const error = ref('')
const loading = ref(false)

// ── 机器执法实况（v1.31.1 吸收轮）：qgate 逐门最新判定按域归 G 门 ──
// 六闸卡上方的人工工件核查之外，机器门禁判定同屏可见——两套证据各表，不互相冒充。
// G2（架构评审）/G6（复盘）是人工域：无机器判定属如实边界，灰态标注，不编造。
const qgateVerdicts = ref<QgateVerdictRow[]>([])
const QGATE_DOMAIN_TO_GATE: Record<string, string> = { L0: 'G1', L1: 'G3', L2: 'G4', L3: 'G4', L4: 'G5', L5: 'G5' }
const machineGateCards = computed(() => {
  const byGate = new Map<string, { worst: 'pass' | 'conditional' | 'reject'; count: number }>()
  for (const v of qgateVerdicts.value) {
    const gate = QGATE_DOMAIN_TO_GATE[v.domain] ?? 'G4'
    const cur = byGate.get(gate)
    const rank = (d: string): number => (d === 'reject' ? 3 : d === 'conditional' ? 2 : 1)
    if (!cur) byGate.set(gate, { worst: v.deliveryVerdict, count: 1 })
    else { byGate.set(gate, { worst: rank(v.deliveryVerdict) > rank(cur.worst) ? v.deliveryVerdict : cur.worst, count: cur.count + 1 }) }
  }
  return ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((gate) => ({
    gate,
    machine: byGate.get(gate) ?? null,
  }))
})
const sourceDistLine = computed(() => {
  const d = usage.value?.gateStats?.sourceDistribution
  if (!d) return ''
  return `核验 ${d.verified} · 声明 ${d.declared} · 降级 ${d.degraded} · 无信号 ${d.none}`
})

// ── 六域体检（长期台账）──
const audit = ref<DomainAuditSummary | null>(null)
const auditRunning = ref(false)
const auditError = ref('')
const DOMAIN_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const
// 2026-10-04 i18n 补齐（72h 审查窗口外旧债）：域名/判词/提示原硬编码 zh，改走 governance.health 词条
const DOMAIN_NAMES = computed<Record<string, string>>(() =>
  (L.value as unknown as { health: { levels: Record<string, string> } }).health.levels)

async function runAudit(): Promise<void> {
  auditRunning.value = true
  auditError.value = ''
  try {
    await runDomainAudit(`run-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`)
    audit.value = await fetchDomainAudit()
  } catch (e) {
    // 失败必须可见：静默吞掉会让旧台账徽章继续冒充本轮结果
    const h = (L.value as unknown as { health: { auditFailed: string } }).health
    auditError.value = h.auditFailed.replace('{msg}', e instanceof Error ? e.message : String(e))
  } finally { auditRunning.value = false }
}

const GATE_KEYS = ['gateG1', 'gateG2', 'gateG3', 'gateG4', 'gateG5', 'gateG6'] as const
const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const

/** 六闸卡：每闸聚合其工件（在仓=绿，缺=灰）；G3 以开发分支数为证据。 */
const gateCards = computed(() => GATE_IDS.map((gateId, i) => {
  const docs = (overview.value?.docs ?? []).filter((d) => d.gate === gateId && (d.group || 'gate') === 'gate')
  const inRepo = docs.filter((d) => d.exists)
  const branchCount = gateId === 'G3' ? (overview.value?.devBranches?.length ?? 0) : null
  const okState = gateId === 'G3' ? branchCount! > 0 : docs.length > 0 && inRepo.length === docs.length
  const latest = inRepo.reduce((acc, d) => (d.committedAt && d.committedAt > acc ? d.committedAt : acc), '')
  return {
    gate: gateId,
    label: L.value[GATE_KEYS[i]],
    ok: okState,
    detail: gateId === 'G3'
      ? `${branchCount} ${L.value.branches}`
      : `${inRepo.length}/${docs.length} ${L.value.inRepo}`,
    latest: latest ? latest.slice(0, 10) : '',
  }
}))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    overview.value = await fetchGovernanceOverview()
    audit.value = await fetchDomainAudit().catch(() => audit.value)
    // gateStats（passRate/来源分布/advisory）在 /usage 报告里，与 RuntimeSection 同源
    usage.value = await fetchUsage().catch(() => usage.value)
    boardStatus.value = (await fetchBoardStatus().catch(() => null))?.boards ?? []
    qgateVerdicts.value = (await fetchQgateVerdicts().catch(() => ({ verdicts: [] as QgateVerdictRow[] }))).verdicts
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())
</script>

<template>
  <section class="gov-health" data-testid="gov-health">
    <div class="gov-health__bar">
      <div>
        <h3 class="gov-health__title">{{ L.gatesTitle }} + {{ (L as any).health.sixDomains }}</h3>
        <p class="gov-health__sub">{{ (L as any).health.sub }}<template v-if="overview"> · {{ L.repoLabel }}: {{ overview.repo }}</template></p>
      </div>
      <button type="button" class="gov-health__refresh" data-testid="gov-health-refresh" :disabled="loading" @click="refresh()">
        {{ loading ? '⏳ …' : '⟳ ' + L.refresh }}
      </button>
    </div>
    <div v-if="error" class="gov-health__error" data-testid="gov-error">{{ L.loadFailed }}：{{ error }}</div>

    <!-- 跨账号板状态分布（G3 2026-10-10 缺失功能实施方案）：步 22 工作台账产品面 -->
    <div class="gov-board-status" data-testid="gov-board-status">
      <h4 class="gov-board-status__title">{{ (L as any).health.boardStatusTitle }}</h4>
      <p class="gov-board-status__sub">{{ (L as any).health.boardStatusSub }}</p>
      <p v-if="boardStatus && boardStatus.length === 0" class="gov-board-status__empty">{{ (L as any).health.boardStatusEmpty }}</p>
      <table v-else-if="boardStatus" class="gov-board-status__tbl" data-testid="gov-board-status-table">
        <thead>
          <tr>
            <th>{{ (L as any).health.boardStatusCols.board }}</th>
            <th>{{ (L as any).health.boardStatusCols.total }}</th>
            <th v-for="c in BOARD_COLS" :key="c">{{ (L as any).health.boardStatusCols[c] }}</th>
            <th>{{ (L as any).health.boardStatusCols.wip }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in boardStatus" :key="b.slug" :class="{ 'is-unavailable': !b.available }" :data-board="b.slug">
            <td class="gov-board-status__name" :title="b.available ? b.slug : (L as any).health.boardUnavailable">
              {{ b.name }}<template v-if="!b.available"> · {{ (L as any).health.boardUnavailable }}</template>
            </td>
            <td>{{ b.available ? b.total : '—' }}</td>
            <td v-for="c in BOARD_COLS" :key="c">{{ b.available ? (b.statuses[c] ?? 0) : '—' }}</td>
            <td :class="{ 'is-wip-hot': b.available && b.wip >= 3 }">{{ b.available ? b.wip : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 六闸卡 -->
    <div class="gov-health__gates" data-testid="gov-gates">
      <div v-for="card in gateCards" :key="card.gate" class="gov-health__gate" :class="{ 'is-ok': card.ok }" :data-gate="card.gate">
        <div class="gov-health__gate-name">{{ card.gate }}</div>
        <div class="gov-health__gate-label">{{ card.label }}</div>
        <div class="gov-health__gate-detail" :data-testid="`gov-gate-${card.gate}`">{{ card.ok ? L.inRepo : L.missing }} · {{ card.detail }}</div>
        <div v-if="card.latest" class="gov-health__gate-ts">{{ card.latest }}</div>
      </div>
    </div>

    <!-- 机器执法实况（qgate 判定 → G 门映射；与上方工件核查各表，两套证据不互相冒充） -->
    <div class="gov-health__machine" data-testid="gov-qgate-verdicts">
      <span class="gov-health__machine-title">{{ zh ? '机器执法实况' : 'Machine gates' }}</span>
      <span
        v-for="m in machineGateCards"
        :key="m.gate"
        class="gov-health__machine-chip"
        :class="m.machine ? `is-${m.machine.worst}` : 'is-none'"
        :data-testid="`gov-qgate-${m.gate}`"
        :title="m.machine ? `${m.machine.count} qgate gate(s) · worst=${m.machine.worst}` : (zh ? '无机器判定（人工域或未在档）' : 'no machine verdict (human domain or not on record)')"
      >{{ m.gate }}:{{ m.machine ? m.machine.worst : '—' }}</span>
      <span v-if="sourceDistLine" class="gov-health__machine-dist" data-testid="gov-qgate-source-dist">{{ zh ? '来源分布' : 'sources' }}: {{ sourceDistLine }}</span>
    </div>

    <!-- 六域体检：真实流程中运行的判定引擎，台账跨轮累积 -->
    <div class="gov-health__audit" data-testid="gov-domain-audit">
      <div class="gov-health__audit-bar">
        <h4 class="gov-health__list-title">{{ (L as any).health.listTitle }}</h4>
        <button type="button" class="gov-health__refresh" data-testid="gov-audit-run" :disabled="auditRunning" @click="runAudit()">
          {{ auditRunning ? (L as any).health.running : (L as any).health.runNow }}
        </button>
      </div>
      <div v-if="auditError" class="gov-health__audit-error" data-testid="gov-audit-error">{{ auditError }}</div>
      <div v-if="audit" class="gov-health__audit-grid">
        <div v-for="d in DOMAIN_ORDER" :key="d" class="gov-health__audit-cell" :data-testid="`gov-audit-${d}`">
          <span class="gov-health__audit-dom">{{ d }} · {{ DOMAIN_NAMES[d] ?? d }}</span>
          <span class="gov-health__audit-badge" :class="`is-${audit.latest[d]?.verdict ?? 'none'}`">
            {{ audit.latest[d] ? ((L as any).health.verdict as Record<string, string>)[audit.latest[d]!.verdict] ?? audit.latest[d]!.verdict : (L as any).health.notRun }}
          </span>
          <div class="gov-health__audit-ev">{{ (audit.latest[d]?.evidence ?? []).slice(0, 2).join(' · ') }}</div>
        </div>
      </div>
      <div v-else class="gov-health__empty">{{ (L as any).health.emptyHint }}</div>
      <div v-if="audit" class="gov-health__audit-meta">
        {{ (L as any).health.ledgerMeta.replace('{total}', String(audit.total)).replace('{runs}', String(audit.runs.length)).replace('{list}', audit.runs.slice(0, 3).join(' / ') + (audit.runs.length > 3 ? ' …' : '')) }}
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.gov-health {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--bg-primary, #fff);
}
.gov-health__bar { display: flex; align-items: flex-start; gap: 10px; }
.gov-health__title { margin: 0; font-size: 13px; font-weight: 600; }
.gov-health__sub { margin: 2px 0 0; font-size: 11px; color: var(--text-muted, #878c99); }
.gov-health__refresh {
  margin-left: auto; flex-shrink: 0;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: var(--bg-secondary, #f1f2f4); }
  &:disabled { opacity: 0.6; cursor: wait; }
}
.gov-health__error { color: #dc2626; font-size: 12px; }
.gov-health__audit-error { color: #dc2626; font-size: 12px; padding: 2px 0; }

.gov-health__gates {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.gov-health__gate {
  border: 1px solid var(--border-color, #e5e7eb);
  border-top: 3px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-primary, #fff);
  opacity: 0.75;
  &.is-ok { border-top-color: #16a34a; opacity: 1; }
}
.gov-health__gate-name { font-size: 14px; font-weight: 800; }

.gov-health__machine { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gov-health__machine-title { font-size: 11px; font-weight: 700; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; }
.gov-health__machine-chip { font-size: 10.5px; font-weight: 700; border-radius: 4px; padding: 1px 8px; font-family: ui-monospace, monospace;
  &.is-pass { color: #15803d; background: #dcfce7; }
  &.is-conditional { color: #b45309; background: #fef3c7; }
  &.is-reject { color: #b91c1c; background: #fee2e2; }
  &.is-none { color: #64748b; background: #f1f5f9; } }
.gov-health__machine-dist { font-size: 10.5px; color: var(--text-muted, #878c99); margin-left: auto; }
.gov-health__gate-label { font-size: 11px; color: var(--text-primary, inherit); margin-top: 1px; }
.gov-health__gate-detail { font-size: 10.5px; color: var(--text-muted, #878c99); margin-top: 3px; }
.gov-health__gate-ts { font-size: 10px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }

.gov-health__audit { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); }
.gov-health__audit-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.gov-health__list-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted, #878c99); text-transform: uppercase; letter-spacing: 0.04em; }
.gov-health__audit-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.gov-health__audit-cell { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 7px 9px; }
.gov-health__audit-dom { display: block; font-size: 11px; font-weight: 700; }
.gov-health__audit-badge { display: inline-block; margin: 3px 0 4px; font-size: 10.5px; font-weight: 700; border-radius: 4px; padding: 1px 8px;
  &.is-pass { color: #15803d; background: #dcfce7; }
  &.is-warn { color: #b45309; background: #fef3c7; }
  &.is-fail { color: #b91c1c; background: #fee2e2; }
  &.is-none { color: #64748b; background: #f1f5f9; } }
.gov-health__audit-ev { font-size: 10px; color: var(--text-muted, #878c99); line-height: 1.45; }
.gov-health__audit-meta { margin-top: 7px; font-size: 10.5px; color: var(--text-muted, #878c99); }
.gov-health__empty {
  border: 1px dashed var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 22px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted, #878c99);
}

@media (max-width: 1100px) {
  .gov-health__gates { grid-template-columns: repeat(3, 1fr); }
  .gov-health__audit-grid { grid-template-columns: repeat(3, 1fr); }
}

/* G3 跨账号板状态分布 */
.gov-board-status { margin: 14px 0; }
.gov-board-status__title { margin: 0 0 2px; font-size: 14px; }
.gov-board-status__sub { margin: 0 0 8px; font-size: 12px; color: var(--muted, #888); }
.gov-board-status__empty { font-size: 12px; color: var(--muted, #888); padding: 8px 0; }
.gov-board-status__tbl { border-collapse: collapse; width: 100%; font-size: 12px; }
.gov-board-status__tbl th, .gov-board-status__tbl td { border: 1px solid var(--border-color, rgba(0,0,0,.08)); padding: 4px 8px; text-align: right; }
.gov-board-status__tbl th:first-child, .gov-board-status__tbl td:first-child { text-align: left; }
.gov-board-status__tbl th { background: rgba(127,127,127,.06); }
.gov-board-status__tbl tr.is-unavailable td { color: var(--muted, #999); }
.gov-board-status__tbl td.is-wip-hot { color: #b45309; font-weight: 600; }

</style>
