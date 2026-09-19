<!-- overlay/custom/client/ia2/components/gov/GovStatsSection.vue -->
<!-- v12 管理台 · 统计与催办区（M-F）：项目/阶段/人员/Agent 负载与阻塞 + 逾期催办清单。
     单一事实源 = matrix-teams/stats.ts 纯投影（事件流计算，不落第二份聚合状态）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskLinkageStore } from '@/custom/matrix-teams/stores/task-linkage'
import { useTaskDispatchStore } from '@/custom/matrix-teams/stores/task-dispatch'
import { projectStats } from '@/custom/matrix-teams/stats'

const { t } = useI18n()
const linkage = useTaskLinkageStore()
const dispatch = useTaskDispatchStore()

const stats = computed(() => projectStats(linkage.cards ?? [], dispatch.localAgents ?? []))

function shortUser(mxId: string): string {
  return mxId.startsWith('@') ? mxId.slice(1).split(':')[0] : mxId
}
</script>

<template>
  <div class="gss" data-testid="gov-stats-section">
    <div class="gss__head">
      <span class="gss__title">{{ t('ia2.gov.stats.title') }}</span>
      <span class="gss__sub">{{ stats.total }} {{ t('ia2.gov.stats.totalUnit') }} · {{ stats.blocked }} {{ t('ia2.gov.stats.blockedUnit') }}</span>
    </div>
    <div class="gss__body">
      <div class="gss__card" data-testid="gov-stats-overdue">
        <div class="gss__card-head">{{ t('ia2.gov.stats.overdue') }}（{{ stats.overdue.length }}）</div>
        <div v-if="!stats.overdue.length" class="gss__empty">{{ t('ia2.gov.stats.overdueEmpty') }}</div>
        <div v-for="r in stats.overdue" :key="r.taskId" class="gss__row gss__row--over" :data-testid="`gov-reminder-${r.taskId}`">
          <span class="gss__name">{{ r.title }}</span>
          <span class="gss__meta">{{ shortUser(r.assignee) }} · {{ new Date(r.dueAt).toLocaleDateString() }}</span>
          <span class="gss__badge">{{ t(`ia2.taskCard.status.${r.status}`) }}</span>
        </div>
      </div>
      <div class="gss__grid">
        <div class="gss__card">
          <div class="gss__card-head">{{ t('ia2.gov.stats.byCase') }}</div>
          <div v-if="!stats.byCase.length" class="gss__empty">{{ t('ia2.gov.stats.empty') }}</div>
          <div v-for="c in stats.byCase" :key="c.caseId" class="gss__row" :data-testid="`gov-stats-case-${c.caseId}`">
            <span class="gss__name">{{ c.caseId }}</span>
            <span class="gss__meta">{{ c.done }}/{{ c.total }}</span>
          </div>
        </div>
        <div class="gss__card">
          <div class="gss__card-head">{{ t('ia2.gov.stats.byPhase') }}</div>
          <div v-if="!stats.byPhase.length" class="gss__empty">{{ t('ia2.gov.stats.empty') }}</div>
          <div v-for="p in stats.byPhase" :key="p.phase" class="gss__row" :data-testid="`gov-stats-phase-${p.phase}`">
            <span class="gss__name">{{ p.phase }}</span>
            <span class="gss__meta">{{ p.done }}/{{ p.total }}</span>
          </div>
        </div>
        <div class="gss__card">
          <div class="gss__card-head">{{ t('ia2.gov.stats.byAssignee') }}</div>
          <div v-if="!stats.byAssignee.length" class="gss__empty">{{ t('ia2.gov.stats.empty') }}</div>
          <div v-for="a in stats.byAssignee" :key="a.account" class="gss__row" :data-testid="`gov-stats-assignee-${a.account}`">
            <span class="gss__name">{{ shortUser(a.account) }}</span>
            <span class="gss__meta">{{ t('ia2.gov.stats.open') }} {{ a.open }} · ⛔ {{ a.blocked }}</span>
          </div>
        </div>
        <div class="gss__card">
          <div class="gss__card-head">{{ t('ia2.gov.stats.byAgent') }}</div>
          <div v-if="!stats.byAgent.length" class="gss__empty">{{ t('ia2.gov.stats.empty') }}</div>
          <div v-for="a in stats.byAgent" :key="a.agentId" class="gss__row" :data-testid="`gov-stats-agent-${a.agentId}`">
            <span class="gss__name">{{ a.agentId }}</span>
            <span class="gss__meta">▶ {{ a.running }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gss { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gss__head { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border-color); }
.gss__title { font-weight: 700; }
.gss__sub { font-size: 10px; color: var(--text-muted); }
.gss__body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.gss__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gss__card { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 8px 10px; }
.gss__card-head { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.gss__row { display: flex; align-items: center; gap: 8px; padding: 4px 2px; }
.gss__row--over .gss__name { color: var(--error, #e05656); font-weight: 700; }
.gss__name { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gss__meta { margin-left: auto; font-size: 10px; color: var(--text-muted); flex: none; }
.gss__badge { padding: 0 6px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 10px; flex: none; }
.gss__empty { padding: 8px 4px; color: var(--text-muted); font-size: 11px; }
</style>
