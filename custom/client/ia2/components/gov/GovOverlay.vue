<!-- overlay/custom/client/ia2/components/gov/GovOverlay.vue -->
<!-- v12 ⚙管理台（2026-09-19 统一视图）：全局覆盖层（非工作视图，不占场景条）。
     三栏：资源导航（五区+实时计数）| 分区列表（行上操作）| 详情面板（跳运行
     历史/IDE）。动线⑥：状态栏/左栏 ⚙ → 此处；实时徽章进列表，详情跳历史。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFlowStore, GOV_SECTIONS, type GovSection } from '../../store/flow'
import { useWorkspaceStore } from '../../store/workspace'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useChatStore } from '@/stores/hermes/chat'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useReviewCenterStore } from '@/custom/matrix-teams/stores/review-center'
import GovTaskSection from './GovTaskSection.vue'
import GovSessionSection from './GovSessionSection.vue'
import GovPeopleSection from './GovPeopleSection.vue'
import GovAgentSection from './GovAgentSection.vue'
import GovTeamSection from './GovTeamSection.vue'
import GovReviewSection from './GovReviewSection.vue'
import GovDetailPanel from './GovDetailPanel.vue'

const { t } = useI18n()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const matrixRoom = useMatrixRoomStore()
const chatStore = useChatStore()
const teamRegistry = useTeamRegistryStore()
const cockpit = useCockpitStore()
const reviewCenter = useReviewCenterStore()

// ── 五区实时计数（徽章进列表）──

const counts = computed<Record<GovSection, number>>(() => ({
  task: workspace.tasks.length,
  session: sessionRows.value.length,
  people: teamRegistry.accounts?.length ?? 0,
  agent: (cockpit.fleetSessions?.length ?? 0) + agentTeamsFlat.value.length,
  team: cockpit.teams?.length ?? 0,
  review: reviewCenter.pendingReviews.length,
}))

// ── 会话区行（房间∪agent 会话，同工作台左栏口径）──

const sessionRows = computed(() => {
  const now = Date.now()
  const rooms = (matrixRoom.sortedRooms ?? []) as Array<{ roomId: string; name?: string }>
  return [
    ...rooms.map((r, i) => {
      let members = 0
      try { members = matrixRoom.getRoomMemberList?.(r.roomId)?.defaults?.length ?? 0 } catch { /* client 未就绪 */ }
      return {
        kind: 'room' as const, id: r.roomId, name: r.name || r.roomId,
        members, lastActivityAt: now - i * 1000,
      }
    }),
    ...(chatStore.sessions ?? []).map(s => ({
      kind: 'chat' as const, id: s.id, name: s.title || s.id,
      members: 1, lastActivityAt: s.updatedAt ?? null,
    })),
  ]
})

const agentTeamsFlat = computed(() =>
  (teamRegistry.accounts ?? []).flatMap(a =>
    a.agentTeams.map(at => ({ owner: a.displayName, userId: a.userId, slug: at.slug, name: at.name, profiles: at.profiles }))))

function setSection(section: GovSection): void {
  flow.govSection = section
  flow.govSelectedId = null
}
</script>

<template>
  <div class="gov" data-testid="gov-overlay">
    <div class="gov__backdrop" data-testid="gov-backdrop" @click="flow.closeGov()" />
    <div class="gov__panel">
      <div class="gov__left">
        <div class="gov__nav-head">
          <span>{{ t('ia2.gov.title') }}</span>
          <button type="button" class="gov__back" data-testid="gov-back" @click="flow.closeGov()">
            ⇠ {{ t('ia2.gov.back') }}
          </button>
        </div>
        <button
          v-for="s in GOV_SECTIONS" :key="s"
          type="button" class="gov__nav"
          :class="{ 'gov__nav--on': flow.govSection === s }"
          :data-testid="`gov-nav-${s}`"
          @click="setSection(s)"
        >{{ t(`ia2.gov.section.${s}`) }}<span v-if="counts[s]" class="gov__nav-n">{{ counts[s] }}</span></button>
        <div class="gov__nav-note">{{ t('ia2.gov.note') }}</div>
      </div>

      <div class="gov__center">
        <GovTaskSection v-if="flow.govSection === 'task'" :tasks="workspace.tasks" />
        <GovSessionSection v-else-if="flow.govSection === 'session'" :sessions="sessionRows" />
        <GovPeopleSection v-else-if="flow.govSection === 'people'" />
        <GovAgentSection v-else-if="flow.govSection === 'agent'" />
        <GovTeamSection v-else-if="flow.govSection === 'team'" />
        <GovReviewSection v-else />
      </div>

      <div class="gov__right">
        <GovDetailPanel />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gov { position: fixed; inset: 0; z-index: 60; }
.gov__backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .38); }
.gov__panel {
  position: absolute; inset: 24px 32px; display: grid;
  grid-template-columns: 250px minmax(320px, 1fr) 240px; gap: 10px;
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: 0 12px 48px rgba(0, 0, 0, .22);
  overflow: hidden;
}
.gov__left {
  display: flex; flex-direction: column; padding: 10px 8px;
  border-right: 1px solid var(--border-color); background: var(--bg-card);
}
.gov__nav-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2px 8px 10px; font-weight: 700; font-size: 13px; color: var(--text-primary);
}
.gov__back {
  border: none; background: none; color: var(--text-muted); font-size: 11px;
  cursor: pointer; &:hover { color: var(--primary); }
}
.gov__nav {
  display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px;
  border: none; border-radius: 6px; background: transparent; text-align: left;
  color: var(--text-secondary); font-size: 12px; cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.gov__nav--on { background: var(--bg-secondary); color: var(--text-primary); font-weight: 600; }
.gov__nav-n {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 9px; display: inline-flex; align-items: center; justify-content: center;
}
.gov__nav--on .gov__nav-n { background: var(--primary); color: #fff; }
.gov__nav-note { margin-top: auto; padding: 8px 8px 2px; font-size: 10px; color: var(--text-muted); }
.gov__center { min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.gov__right {
  border-left: 1px solid var(--border-color); background: var(--bg-card);
  min-width: 0; overflow: hidden;
}
</style>
