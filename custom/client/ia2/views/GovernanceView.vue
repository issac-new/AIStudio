<!-- overlay/custom/client/ia2/views/GovernanceView.vue -->
<!-- 治理中心（补功能主清单 2026-09-28 审计 §六）：G1 冻结/G2 评审/排期/测试报告/
     UAT/审计/复盘七个此前无专属界面的治理环节的产品承载页（#/app/gov）。
     布局：六闸卡行（工件在仓锚点）+ 左列工件清单 + 右侧 markdown 全文渲染
     （KanbanMarkdown 复用）+ 待裁决评审就地裁决（复用 approvals API review 域）。
     数据全真实：/api/governance/*（git 真仓实查，缺失如实灰态不编造）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KanbanMarkdown from '@/custom/kanban/components/KanbanMarkdown.vue'
import {
  fetchGovernanceOverview, fetchGovernanceDoc, runDomainAudit, fetchDomainAudit,
  type GovernanceDocMeta, type GovernanceOverview, type GovernanceDoc,
  type DomainCheckResult, type DomainAuditSummary,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'
import LedgerSection from '@/custom/governance/components/LedgerSection.vue'
import RuntimeSection from '@/custom/governance/components/RuntimeSection.vue'
import AuditSection from '@/custom/governance/components/AuditSection.vue'
import {
  fetchPendingApprovals, dedupePending, decideApproval, type PendingApprovalItem,
} from '@/custom/cockpit/api/approvals'

const i18nCtx = useI18n()
/** 文案单一事实源=custom/governance/i18n.ts；legacy i18n 无 mergeLocaleMessage，
 * 组件内按当前 locale 选表（zh* → zh，其余 en）。 */
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
})

const overview = ref<GovernanceOverview | null>(null)
const selectedKind = ref('')
const doc = ref<GovernanceDoc | null>(null)
const error = ref('')
const loading = ref(false)
const reviews = ref<PendingApprovalItem[]>([])
const acting = ref<Set<string>>(new Set())

// ── 六域体检（长期台账）──
const audit = ref<DomainAuditSummary | null>(null)
const auditRunning = ref(false)
const DOMAIN_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const
const DOMAIN_NAMES: Record<string, string> = {
  L0: '范围与需求', L1: '工程正确性', L2: '系统一致性',
  L3: '行为与业务语义', L4: '架构·非功能·安全', L5: '交付与治理',
}

async function runAudit(): Promise<void> {
  auditRunning.value = true
  try {
    await runDomainAudit(`run-${new Date().toISOString().slice(5, 16).replace('T', ' ')}`)
    audit.value = await fetchDomainAudit()
  } catch { /* 台账读取失败保留旧值 */ } finally { auditRunning.value = false }
}

const GATE_KEYS = ['gateG1', 'gateG2', 'gateG3', 'gateG4', 'gateG5', 'gateG6'] as const
const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const

/** 工件库四组（单一事实源=server GOVERNANCE_DOCS.group 值；标题本地化） */
const DOC_GROUPS: Array<{ key: string; zh: string }> = [
  { key: 'gate', zh: '六闸工件' },
  { key: 'admin', zh: '管理档案' },
  { key: 'analysis', zh: '分析档案' },
  { key: 'evidence', zh: '测试证据' },
]
const docGroups = computed(() =>
  DOC_GROUPS.map(g => ({ ...g, docs: (overview.value?.docs ?? []).filter(d => (d.group || 'gate') === g.key) }))
    .filter(g => g.docs.length))

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
    const pending = await fetchPendingApprovals()
    reviews.value = dedupePending(pending.items ?? []).filter((i) => i.kind === 'review')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function openDoc(kind: string): Promise<void> {
  selectedKind.value = kind
  doc.value = null
  error.value = ''
  try {
    doc.value = await fetchGovernanceDoc(kind)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function decide(item: PendingApprovalItem, decision: 'approve' | 'request_changes'): Promise<void> {
  if (acting.value.has(item.id)) return
  acting.value = new Set(acting.value).add(item.id)
  try {
    await decideApproval(item.id, decision)
    await refresh()
  } finally {
    const next = new Set(acting.value)
    next.delete(item.id)
    acting.value = next
  }
}

function fmtTime(ts: number): string {
  return ts ? new Date(ts).toLocaleString('zh-CN') : ''
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ia-area ia-gov" data-testid="governance-view">
    <div class="ia-gov__bar">
      <div>
        <h2 class="ia-gov__title">{{ L.pageTitle }}</h2>
        <p class="ia-gov__sub">{{ L.pageSub }}<template v-if="overview">
          · {{ L.repoLabel }}: {{ overview.repo }}</template></p>
      </div>
      <button type="button" class="ia-gov__refresh" data-testid="gov-refresh" @click="refresh()">
        ⟳ {{ L.refresh }}
      </button>
    </div>

    <div v-if="error" class="ia-gov__error" data-testid="gov-error">{{ L.loadFailed }}：{{ error }}</div>

    <!-- 六闸卡 -->
    <div class="ia-gov__gates" data-testid="gov-gates">
      <div v-for="card in gateCards" :key="card.gate" class="ia-gov__gate" :class="{ 'is-ok': card.ok }" :data-gate="card.gate">
        <div class="ia-gov__gate-name">{{ card.gate }}</div>
        <div class="ia-gov__gate-label">{{ card.label }}</div>
        <div class="ia-gov__gate-detail" :data-testid="`gov-gate-${card.gate}`">{{ card.ok ? L.inRepo : L.missing }} · {{ card.detail }}</div>
        <div v-if="card.latest" class="ia-gov__gate-ts">{{ card.latest }}</div>
      </div>
    </div>

    <!-- 六域体检：真实流程中运行的判定引擎，台账跨轮累积 -->
    <div class="ia-gov__audit" data-testid="gov-domain-audit">
      <div class="ia-gov__audit-bar">
        <h3 class="ia-gov__list-title">六域体检 · 每域一个交付问题</h3>
        <button type="button" class="ia-gov__refresh" data-testid="gov-audit-run" :disabled="auditRunning" @click="runAudit()">
          {{ auditRunning ? '⏳ 体检中…' : '▶ 运行六域体检' }}
        </button>
      </div>
      <div v-if="audit" class="ia-gov__audit-grid">
        <div v-for="d in DOMAIN_ORDER" :key="d" class="ia-gov__audit-cell" :data-testid="`gov-audit-${d}`">
          <span class="ia-gov__audit-dom">{{ d }} · {{ DOMAIN_NAMES[d] }}</span>
          <span class="ia-gov__audit-badge" :class="`is-${audit.latest[d]?.verdict ?? 'none'}`">
            {{ audit.latest[d] ? ({ pass: '通过', warn: '观察', fail: '不通过' } as Record<string, string>)[audit.latest[d]!.verdict] : '未体检' }}
          </span>
          <div class="ia-gov__audit-ev">{{ (audit.latest[d]?.evidence ?? []).slice(0, 2).join(' · ') }}</div>
        </div>
      </div>
      <div v-else class="ia-gov__empty">尚未体检——点击「运行六域体检」产出首轮台账（docs/governance/domain-audit.jsonl，跨轮累积）</div>
      <div v-if="audit" class="ia-gov__audit-meta">
        台账 {{ audit.total }} 条判定 · {{ audit.runs.length }} 轮（{{ audit.runs.slice(0, 3).join(' / ') }}{{ audit.runs.length > 3 ? ' …' : '' }}）——长期基础数据，下轮目标 = 上轮基线
      </div>
    </div>

    <!-- 能力台账（4A 治理层：能力树+生命周期+语义指标层，spec 2026-09-29） -->
    <LedgerSection />

    <!-- 运行态（第二期：消费关系/SLO 实况/成本归集） -->
    <RuntimeSection />

    <!-- 统一审计查看器（第二期：审批/体检/provider/kanban 四源归一） -->
    <AuditSection />

    <div class="ia-gov__main">
      <!-- 左：工件清单 -->
      <aside class="ia-gov__list" data-testid="gov-docs">
        <h3 class="ia-gov__list-title">{{ L.docsTitle }}</h3>
        <template v-for="g in docGroups" :key="g.key">
          <div class="ia-gov__group-title" :data-group="g.key">{{ g.zh }}</div>
          <button
            v-for="d in g.docs"
            :key="d.kind"
            type="button"
            class="ia-gov__doc"
            :class="{ 'is-selected': selectedKind === d.kind, 'is-missing': !d.exists }"
            :data-testid="`gov-doc-${d.kind}`"
            :disabled="!d.exists"
            @click="openDoc(d.kind)"
          >
            <span class="ia-gov__doc-title">{{ d.title }}</span>
            <span class="ia-gov__doc-meta">{{ d.exists ? (d.ref ? d.ref.replace('origin/', '') + ' · ' : '') + d.commit : L.missing }}</span>
          </button>
        </template>
      </aside>

      <!-- 右：文档全文 + 待裁决 -->
      <section class="ia-gov__content">
        <div v-if="doc" class="ia-gov__docview">
          <div class="ia-gov__docview-hd">
            <b>{{ doc.title }}</b>
            <span class="ia-gov__docview-meta">
              {{ `${doc.markdown.split('\n').length} 行 · ${doc.commit} · ${doc.committedAt?.slice(0, 10)}` }}
            </span>
          </div>
          <div class="ia-gov__docview-body" data-testid="gov-doc-md">
            <KanbanMarkdown :source="doc.markdown" />
          </div>
        </div>
        <div v-else class="ia-gov__empty">{{ L.selectDoc }}</div>

        <!-- 待裁决评审（G2 语义就地裁决） -->
        <div class="ia-gov__reviews" data-testid="gov-reviews">
          <h3 class="ia-gov__list-title">{{ L.reviewsTitle }}<span v-if="reviews.length" class="ia-gov__count">{{ reviews.length }}</span></h3>
          <div v-if="!reviews.length" class="ia-gov__empty">{{ L.noReviews }}</div>
          <div v-for="item in reviews" :key="item.id" class="ia-gov__review-row" :data-testid="`gov-review-${item.id}`">
            <div class="ia-gov__review-main">
              <div class="ia-gov__review-title">{{ item.title }}</div>
              <div class="ia-gov__review-meta">{{ fmtTime(item.createdAt) }}<template v-if="item.taskId"> · {{ item.taskId }}</template></div>
            </div>
            <div class="ia-gov__review-actions">
              <button type="button" class="ia-gov__btn is-approve" :disabled="acting.has(item.id)" @click="decide(item, 'approve')">✓ {{ L.approve }}</button>
              <button type="button" class="ia-gov__btn is-reject" :disabled="acting.has(item.id)" @click="decide(item, 'request_changes')">✕ {{ L.reject }}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ia-gov {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
  padding: 12px 16px;
  overflow: auto;
}
.ia-gov__bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
}
.ia-gov__title { margin: 0; font-size: 15px; font-weight: 600; }
.ia-gov__sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted, #878c99); }
.ia-gov__refresh {
  margin-left: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: var(--bg-secondary, #f1f2f4); }
}
.ia-gov__error { color: #dc2626; font-size: 12px; }

.ia-gov__gates {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  flex-shrink: 0;
}
.ia-gov__gate {
  border: 1px solid var(--border-color, #e5e7eb);
  border-top: 3px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-primary, #fff);
  opacity: 0.75;
  &.is-ok { border-top-color: #16a34a; opacity: 1; }
}
.ia-gov__gate-name { font-size: 14px; font-weight: 800; }
.ia-gov__gate-label { font-size: 11px; color: var(--text-primary, inherit); margin-top: 1px; }
.ia-gov__gate-detail { font-size: 10.5px; color: var(--text-muted, #878c99); margin-top: 3px; }
.ia-gov__gate-ts { font-size: 10px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }

.ia-gov__audit { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary, #fff); flex-shrink: 0; }
.ia-gov__audit-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.ia-gov__audit-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.ia-gov__audit-cell { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 7px 9px; }
.ia-gov__audit-dom { display: block; font-size: 11px; font-weight: 700; }
.ia-gov__audit-badge { display: inline-block; margin: 3px 0 4px; font-size: 10.5px; font-weight: 700; border-radius: 4px; padding: 1px 8px;
  &.is-pass { color: #15803d; background: #dcfce7; }
  &.is-warn { color: #b45309; background: #fef3c7; }
  &.is-fail { color: #b91c1c; background: #fee2e2; }
  &.is-none { color: #64748b; background: #f1f5f9; } }
.ia-gov__audit-ev { font-size: 10px; color: var(--text-muted, #878c99); line-height: 1.45; }
.ia-gov__audit-meta { margin-top: 7px; font-size: 10.5px; color: var(--text-muted, #878c99); }
@media (max-width: 1100px) { .ia-gov__audit-grid { grid-template-columns: repeat(3, 1fr) } }

.ia-gov__main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  flex: 1;
  min-height: 360px;
}
.ia-gov__list {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  background: var(--bg-primary, #fff);
}
.ia-gov__list-title {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ia-gov__doc {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 7px;
  background: var(--bg-primary, #fff);
  padding: 7px 9px;
  cursor: pointer;
  font-family: inherit;
  &:hover:not(:disabled) { background: var(--bg-secondary, #f1f2f4); }
  &.is-selected { border-color: var(--accent-primary, #3b82f6); background: rgba(59, 130, 246, 0.06); }
  &.is-missing { opacity: 0.5; cursor: not-allowed; }
}
.ia-gov__group-title {
  margin: 8px 0 2px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ia-gov__doc-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary, inherit); line-height: 1.35; word-break: break-word; }
.ia-gov__doc-meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

.ia-gov__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.ia-gov__docview {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-primary, #fff);
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.ia-gov__docview-hd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  font-size: 13px;
}
.ia-gov__docview-meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.ia-gov__docview-body { padding: 12px 16px 26px; overflow: auto; font-size: 12.5px; line-height: 1.7; }
.ia-gov__empty {
  border: 1px dashed var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 22px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted, #878c99);
}
.ia-gov__reviews {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
}
.ia-gov__count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--accent-primary, #3b82f6);
  font-weight: 600;
}
.ia-gov__review-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 7px;
  padding: 7px 9px;
}
.ia-gov__review-main { flex: 1; min-width: 0; }
.ia-gov__review-title { font-size: 12.5px; font-weight: 600; }
.ia-gov__review-meta { font-size: 10.5px; color: var(--text-muted, #878c99); }
.ia-gov__review-actions { display: flex; gap: 6px; }
.ia-gov__btn {
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: var(--bg-primary, #fff);
  &.is-approve { color: #059669; border: 1px solid #05966944; }
  &.is-reject { color: #dc2626; border: 1px solid #dc262644; }
  &:disabled { opacity: 0.5; cursor: wait; }
}

@media (max-width: 1100px) {
  .ia-gov__gates { grid-template-columns: repeat(3, 1fr); }
  .ia-gov__main { grid-template-columns: 1fr; }
}
</style>
