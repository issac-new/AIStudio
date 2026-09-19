<!-- overlay/custom/client/ia2/components/gov/GovAgentSection.vue -->
<!-- v12 管理台 · 智能体区：fleet 实时会话（状态/队列/审批待办）∪ 编制 agentTeam
     档案。真实 API 有的动作才实装（fleet 审批=确认；其余为详情选中），不放
     假按钮（v12 规约）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { useFlowStore } from '../../store/flow'

const { t } = useI18n()
const cockpit = useCockpitStore()
const teamRegistry = useTeamRegistryStore()
const flow = useFlowStore()

const fleetRows = computed(() => (cockpit.fleetSessions ?? []).map(s => ({
  id: s.id, title: s.title, profile: s.profile,
  status: s.status, queue: s.queueLength, approvals: s.approvals?.length ?? 0,
  preview: s.lastPreview, activeAt: s.lastActiveAt,
})))

const teamRows = computed(() => (teamRegistry.accounts ?? []).flatMap(a =>
  a.agentTeams.map(at => ({
    key: `${a.userId}/${at.slug}`, owner: a.displayName, name: at.name,
    slug: at.slug, profiles: at.profiles.length,
  }))))

function approve(sessionId: string, approvalId: string): void {
  void cockpit.respondFleetApproval(sessionId, approvalId, 'once')
}

function detail(kind: 'fleet' | 'team', id: string): void {
  flow.govSelectedId = `${kind}:${id}`
}
</script>

<template>
  <div class="gas" data-testid="gov-agent-section">
    <div class="gas__head">
      <span class="gas__title">{{ t('ia2.gov.agent.title') }}</span>
      <span class="gas__sub">{{ t('ia2.gov.agent.sub') }}</span>
    </div>
    <div class="gas__list">
      <div class="gas__group">{{ t('ia2.gov.agent.fleetGroup') }} · {{ fleetRows.length }}</div>
      <div v-if="!fleetRows.length" class="gas__empty">{{ t('ia2.gov.agent.fleetEmpty') }}</div>
      <div
        v-for="f in fleetRows" :key="f.id" class="gas__row"
        :data-testid="`gov-agent-fleet-${f.id}`"
        :class="{ 'gas__row--sel': flow.govSelectedId === `fleet:${f.id}` }"
        @click="detail('fleet', f.id)"
      >
        <span class="gas__dot" :class="f.status === 'working' ? 'gas__dot--run' : 'gas__dot--idle'" />
        <span class="gas__body">
          <span class="gas__name">🤖 {{ f.title || f.id }} · {{ f.profile }}</span>
          <span class="gas__sub-line">
            {{ t(`ia2.gov.agent.fleetStatus.${f.status}`) }}<template v-if="f.queue"> · {{ t('ia2.gov.agent.queue') }} {{ f.queue }}</template><template v-if="f.approvals"> · ⧖ {{ f.approvals }}</template>
          </span>
        </span>
      </div>

      <div class="gas__group">{{ t('ia2.gov.agent.registryGroup') }} · {{ teamRows.length }}</div>
      <div v-if="!teamRows.length" class="gas__empty">{{ t('ia2.gov.agent.registryEmpty') }}</div>
      <div
        v-for="r in teamRows" :key="r.key" class="gas__row"
        :data-testid="`gov-agent-team-${r.key}`"
        :class="{ 'gas__row--sel': flow.govSelectedId === `team:${r.key}` }"
        @click="detail('team', r.key)"
      >
        <span class="gas__dot gas__dot--idle" />
        <span class="gas__body">
          <span class="gas__name">🤖 {{ r.name }} · {{ r.slug }}</span>
          <span class="gas__sub-line">{{ t('ia2.gov.agent.owner') }} {{ r.owner }} · {{ r.profiles }} {{ t('ia2.gov.people.profiles') }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gas { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gas__head { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border-color); }
.gas__title { font-weight: 700; }
.gas__sub { font-size: 10px; color: var(--text-muted); }
.gas__list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
.gas__group { padding: 8px 4px 4px; font-size: 10px; text-transform: uppercase; color: var(--text-muted); }
.gas__row {
  display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 6px; cursor: pointer;
  &:hover { background: var(--bg-secondary); }
}
.gas__row--sel { background: var(--bg-secondary); }
.gas__dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
.gas__dot--run { background: var(--primary); }
.gas__dot--idle { background: var(--text-muted); }
.gas__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.gas__name { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gas__sub-line { font-size: 10px; color: var(--text-muted); }
.gas__empty { padding: 10px 4px; color: var(--text-muted); font-size: 11px; }
</style>
