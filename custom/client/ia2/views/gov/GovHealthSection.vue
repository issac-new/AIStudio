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
  fetchGovernanceOverview, runDomainAudit, fetchDomainAudit,
  type GovernanceOverview, type DomainAuditSummary,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
/** 文案单一事实源=custom/governance/i18n.ts；legacy i18n 无 mergeLocaleMessage，
 *  组件内按当前 locale 选表（zh* → zh，其余 en）。 */
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
})

const overview = ref<GovernanceOverview | null>(null)
const error = ref('')
const loading = ref(false)

// ── 六域体检（长期台账）──
const audit = ref<DomainAuditSummary | null>(null)
const auditRunning = ref(false)
const auditError = ref('')
const DOMAIN_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const
const DOMAIN_NAMES: Record<string, string> = {
  L0: '范围与需求', L1: '工程正确性', L2: '系统一致性',
  L3: '行为与业务语义', L4: '架构·非功能·安全', L5: '交付与治理',
}

async function runAudit(): Promise<void> {
  auditRunning.value = true
  auditError.value = ''
  try {
    await runDomainAudit(`run-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`)
    audit.value = await fetchDomainAudit()
  } catch (e) {
    // 失败必须可见：静默吞掉会让旧台账徽章继续冒充本轮结果
    auditError.value = `六域体检失败：${e instanceof Error ? e.message : String(e)}（徽章仍为上一轮台账）`
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
        <h3 class="gov-health__title">{{ L.gatesTitle }} + 六域体检</h3>
        <p class="gov-health__sub">工件在仓锚点 · 判定引擎台账<template v-if="overview"> · {{ L.repoLabel }}: {{ overview.repo }}</template></p>
      </div>
      <button type="button" class="gov-health__refresh" data-testid="gov-health-refresh" :disabled="loading" @click="refresh()">
        {{ loading ? '⏳ …' : '⟳ ' + L.refresh }}
      </button>
    </div>
    <div v-if="error" class="gov-health__error" data-testid="gov-error">{{ L.loadFailed }}：{{ error }}</div>

    <!-- 六闸卡 -->
    <div class="gov-health__gates" data-testid="gov-gates">
      <div v-for="card in gateCards" :key="card.gate" class="gov-health__gate" :class="{ 'is-ok': card.ok }" :data-gate="card.gate">
        <div class="gov-health__gate-name">{{ card.gate }}</div>
        <div class="gov-health__gate-label">{{ card.label }}</div>
        <div class="gov-health__gate-detail" :data-testid="`gov-gate-${card.gate}`">{{ card.ok ? L.inRepo : L.missing }} · {{ card.detail }}</div>
        <div v-if="card.latest" class="gov-health__gate-ts">{{ card.latest }}</div>
      </div>
    </div>

    <!-- 六域体检：真实流程中运行的判定引擎，台账跨轮累积 -->
    <div class="gov-health__audit" data-testid="gov-domain-audit">
      <div class="gov-health__audit-bar">
        <h4 class="gov-health__list-title">六域体检 · 每域一个交付问题</h4>
        <button type="button" class="gov-health__refresh" data-testid="gov-audit-run" :disabled="auditRunning" @click="runAudit()">
          {{ auditRunning ? '⏳ 体检中…' : '▶ 运行六域体检' }}
        </button>
      </div>
      <div v-if="auditError" class="gov-health__audit-error" data-testid="gov-audit-error">{{ auditError }}</div>
      <div v-if="audit" class="gov-health__audit-grid">
        <div v-for="d in DOMAIN_ORDER" :key="d" class="gov-health__audit-cell" :data-testid="`gov-audit-${d}`">
          <span class="gov-health__audit-dom">{{ d }} · {{ DOMAIN_NAMES[d] }}</span>
          <span class="gov-health__audit-badge" :class="`is-${audit.latest[d]?.verdict ?? 'none'}`">
            {{ audit.latest[d] ? ({ pass: '通过', warn: '观察', fail: '不通过' } as Record<string, string>)[audit.latest[d]!.verdict] : '未体检' }}
          </span>
          <div class="gov-health__audit-ev">{{ (audit.latest[d]?.evidence ?? []).slice(0, 2).join(' · ') }}</div>
        </div>
      </div>
      <div v-else class="gov-health__empty">尚未体检——点击「运行六域体检」产出首轮台账（docs/governance/domain-audit.jsonl，跨轮累积）</div>
      <div v-if="audit" class="gov-health__audit-meta">
        台账 {{ audit.total }} 条判定 · {{ audit.runs.length }} 轮（{{ audit.runs.slice(0, 3).join(' / ') }}{{ audit.runs.length > 3 ? ' …' : '' }}）——长期基础数据，下轮目标 = 上轮基线
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
</style>
