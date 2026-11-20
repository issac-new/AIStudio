<!-- overlay/custom/client/governance/components/DecisionAgendaSection.vue -->
<!-- 决策议程（批三 T6，设计 §4.7/§5.1）：把散在各权威域「等人决定」的事项聚成一张
     只读议程。纪律：
     - 零写面：人处理决定回原权威域（审批账/PremiseLog/expcandidates/OutcomeTeam），
       条目只显示 sourceRef 指引，不带任何写动作；
     - 逐源 fail-soft：available=false 显示「来源不可用＋原因」，与「没有待决事项」
       （available=true 且 0 条）严格分文案——失败≠空数据；
     - age 巨值防御：mx 迁移数据 createdAt=0 会算出约 2 万天，>3650 天显示「时刻未知」
       不渲染巨数（显示层不猜数）；
     - 界面诚实态：高风险/one-way/来源不可用一律警示色，不用绿色。
     功能门关（OUTCOME_WORKBENCH≠1）整段不渲染（OutcomeSection 同款）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchAgenda, OrgWorkbenchDisabledError, type AgendaItem, type AgendaResult, type AgendaSourceKind } from '@/custom/governance/api/org-workbench'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

/** 源固定展示序（人先看审批与逾期，再看假设/评审，最后看候选与团队）。 */
const SOURCE_ORDER: AgendaSourceKind[] = [
  'approvals', 'outcome_contracts', 'premises', 'review_cases', 'escalations', 'exp_candidates', 'outcome_teams',
]
const SOURCE_LABEL: Record<AgendaSourceKind, string> = {
  approvals: '待审批/双签', outcome_contracts: '逾期结果', premises: '假设登记簿',
  review_cases: '评审分歧', escalations: '权限升级', exp_candidates: '学习候选', outcome_teams: '待确认团队',
}
const KIND_LABEL: Record<string, string> = {
  approval_pending: '审批待决', dual_sign_pending: '双签待决', outcome_overdue: '结果逾期',
  premise_due: '假设到期', premise_refuted: '假设被推翻', review_disagreement: '评审分歧',
  escalation_pending: '权限升级', learning_candidate: '学习候选', team_pending: '团队待确认',
}

const gateOff = ref(false)
const loadError = ref('')
const agenda = ref<AgendaResult | null>(null)
const busy = ref(false)
/** 展开源集合（默认全折叠——折叠组语义；空/失败组展开也只有一行状态文案）。 */
const expanded = ref<Set<AgendaSourceKind>>(new Set())

function toggle(kind: AgendaSourceKind): void {
  const next = new Set(expanded.value)
  if (next.has(kind)) next.delete(kind)
  else next.add(kind)
  expanded.value = next
}

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    agenda.value = await fetchAgenda()
  } catch (err) {
    if (err instanceof OrgWorkbenchDisabledError) gateOff.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

onMounted(() => { void refresh() })

/** age 显示：>3650 天按「时刻未知」——锚点时刻缺失/迁移脏数据不渲染成 2 万天巨数。 */
function fmtAge(age: number): string {
  return Number.isFinite(age) && age >= 0 && age <= 3650 ? `${age} 天` : '时刻未知'
}

function sourceOf(kind: AgendaSourceKind) {
  return agenda.value?.sources[kind] ?? null
}

function itemsOf(kind: AgendaSourceKind): AgendaItem[] {
  const s = sourceOf(kind)
  return s?.available && Array.isArray(s.items) ? s.items : []
}

const T = computed(() => zh.value ? {
  title: '决策议程（组织工作台）',
  sub: '聚合各权威域「等人决定」的事项——例行进度不入；处理决定回原权威域，本面板零写面',
  refresh: '刷新', expand: '展开', collapse: '收起',
  count: (n: number) => `${n} 项`,
  unavailable: '来源不可用', empty: '没有待决事项',
  failPrefix: '来源不可用',
  guide: '回原权威域处理', ownerUnknown: '负责人未标注',
  evid: (n: number) => `证据 ${n} 处`,
  highRisk: '高风险', oneWay: '不可逆（one-way）',
} : {
  title: 'Decision Agenda (Org Workbench)',
  sub: 'Items awaiting a human decision, aggregated from authority domains — routine progress excluded; decisions are made back in the source domain (this panel is read-only)',
  refresh: 'Refresh', expand: 'Expand', collapse: 'Collapse',
  count: (n: number) => `${n} item(s)`,
  unavailable: 'Source unavailable', empty: 'No pending decisions',
  failPrefix: 'Source unavailable',
  guide: 'Handle in source domain', ownerUnknown: 'owner not specified',
  evid: (n: number) => `${n} evidence ref(s)`,
  highRisk: 'high risk', oneWay: 'one-way',
})
</script>

<template>
  <section v-if="!gateOff" class="oa" data-testid="org-agenda-section">
    <div class="oa__bar">
      <h3 class="oa__title">{{ T.title }}</h3>
      <button type="button" :disabled="busy" @click="refresh()">{{ busy ? '…' : T.refresh }}</button>
    </div>
    <p class="oa__sub">{{ T.sub }}</p>
    <p v-if="loadError" class="oa__err" data-testid="org-agenda-error">决策议程读取失败：{{ loadError }}</p>

    <template v-else-if="agenda">
      <div
        v-for="kind in SOURCE_ORDER"
        :key="kind"
        class="oa__src"
        :data-testid="`org-agenda-src-${kind}`"
      >
        <button
          type="button"
          class="oa__src-head"
          :data-testid="`org-agenda-src-head-${kind}`"
          :disabled="itemsOf(kind).length === 0"
          @click="toggle(kind)"
        >
          <span class="oa__src-name">{{ SOURCE_LABEL[kind] }}</span>
          <span class="oa__src-count">{{ T.count(sourceOf(kind)?.itemCount ?? 0) }}</span>
          <span class="oa__badge" :class="sourceOf(kind)?.available ? 'is-ok' : 'is-fail'">
            {{ sourceOf(kind)?.available ? 'available' : T.unavailable }}
          </span>
          <span v-if="itemsOf(kind).length > 0" class="oa__toggle">{{ expanded.has(kind) ? T.collapse : T.expand }}</span>
        </button>
        <div class="oa__src-body">
          <!-- 失败/空态一行常显（不折叠）：失败要被看见；有条目才折叠明细 -->
          <p
            v-if="sourceOf(kind) && !sourceOf(kind)!.available"
            class="oa__fail"
            :data-testid="`org-agenda-src-${kind}-fail`"
          >
            {{ T.failPrefix }}：{{ sourceOf(kind)!.error ?? '原因未知' }}
          </p>
          <p
            v-else-if="itemsOf(kind).length === 0"
            class="oa__empty"
            :data-testid="`org-agenda-src-${kind}-empty`"
          >
            {{ T.empty }}
          </p>
          <ul v-else-if="expanded.has(kind)" class="oa__items">
            <li v-for="item in itemsOf(kind)" :key="item.agendaId" class="oa__item" :data-testid="`org-agenda-item-${item.agendaId}`">
              <p class="oa__q">{{ item.question }}</p>
              <p class="oa__meta">
                <span class="oa__kind">{{ KIND_LABEL[item.kind] ?? item.kind }}</span>
                <span v-if="item.riskTier === 'high'" class="oa__warn is-risk-high">{{ T.highRisk }}</span>
                <span v-if="item.reversibility === 'one-way'" class="oa__warn is-one-way">{{ T.oneWay }}</span>
                <span>· {{ item.owner ?? T.ownerUnknown }}</span>
                <span>· {{ fmtAge(item.age) }}</span>
                <span>· {{ T.evid(item.evidenceRefs.length) }}</span>
              </p>
              <p class="oa__ref">{{ T.guide }}：<code>{{ item.sourceRef }}</code><template v-if="item.outcomeId">（outcome {{ item.outcomeId }}）</template></p>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.oa { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.oa__bar { display: flex; align-items: center; justify-content: space-between; }
.oa__title { margin: 0; font-size: 13.5px; }
.oa__sub { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.oa__err { color: var(--error); margin: 0; font-size: 12px; }
.oa__src { border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.oa__src-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 10px; background: none; border: none; cursor: pointer; font-size: 12.5px; text-align: left;
  &:hover { background: var(--bg-secondary); }
}
.oa__src-name { font-weight: 600; }
.oa__src-count { color: var(--text-muted); font-size: 11.5px; }
.oa__badge {
  font-size: 10.5px; border-radius: 8px; padding: 0 6px; border: 1px solid var(--border-color);
  &.is-ok { color: var(--text-secondary); }
  /* 来源不可用=警示色（不用绿色）：失败要被看见 */
  &.is-fail { color: var(--warning); border-color: var(--warning); background: rgba(245, 158, 11, 0.1); }
}
.oa__toggle { margin-left: auto; color: var(--text-muted); font-size: 11px; }
.oa__src-body { border-top: 1px solid var(--border-color); padding: 6px 10px; }
.oa__fail { margin: 0; color: var(--warning); font-size: 12px; }
.oa__empty { margin: 0; color: var(--text-muted); font-size: 12px; }
.oa__items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.oa__item { border-left: 2px solid var(--border-color); padding-left: 8px; }
.oa__q { margin: 0; font-size: 12.5px; }
.oa__meta { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.oa__kind { border: 1px solid var(--border-color); border-radius: 8px; padding: 0 6px; }
.oa__warn {
  font-size: 10.5px; border-radius: 8px; padding: 0 6px;
  &.is-risk-high { color: var(--error); border: 1px solid var(--error); background: rgba(192, 57, 43, 0.08); }
  &.is-one-way { color: var(--warning); border: 1px solid var(--warning); }
}
.oa__ref { margin: 2px 0 0; font-size: 11.5px; color: var(--text-secondary); }
.oa__ref code { font-size: 11px; }
</style>
