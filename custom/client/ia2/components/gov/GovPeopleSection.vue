<!-- overlay/custom/client/ia2/components/gov/GovPeopleSection.vue -->
<!-- v12 管理台 · 员工区：team-registry 编制账户（在办负载=其名下智能体 profile
     的进行中任务数）+ 行上操作（任务→看板按指派过滤的深链面；会话→其值守房间）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useWorkspaceStore } from '../../store/workspace'

const { t } = useI18n()
const router = useRouter()
const teamRegistry = useTeamRegistryStore()
const matrixRoom = useMatrixRoomStore()
const workspace = useWorkspaceStore()

const rows = computed(() => (teamRegistry.accounts ?? []).map(a => {
  const profiles = a.agentTeams.flatMap(at => at.profiles)
  const open = workspace.tasks.filter(x =>
    x.status !== 'done' && x.status !== 'archived' && profiles.includes(x.assignee)).length
  // 其值守的房间（duty assignee=本账户）
  const dutyRooms = Object.entries(teamRegistry.duties ?? {})
    .filter(([, d]) => d.assigneeKind === 'account' && d.assigneeId === a.userId)
    .map(([roomId]) => roomId)
  return { account: a, profiles, open, dutyRooms }
}))

function goTasks(assignees: string[]): void {
  // 看板深链面：首个 profile 预选（多 profile 取主；空则裸看板）
  void router.push({ name: 'ia2.board', query: assignees[0] ? { task: '' } : {} })
}

function goDutyRoom(roomId: string): void {
  void router.push({ name: 'ia2.commsRoom', params: { roomId } })
}

function roomName(roomId: string): string {
  const room = (matrixRoom.sortedRooms ?? []).find((r: { roomId: string }) => r.roomId === roomId)
  return room?.name || roomId
}
</script>

<template>
  <div class="gps" data-testid="gov-people-section">
    <div class="gps__head">
      <span class="gps__title">{{ t('ia2.gov.people.title') }}</span>
      <span class="gps__sub">{{ t('ia2.gov.people.sub') }}</span>
    </div>
    <div class="gps__list" data-testid="gov-people-rows">
      <div v-if="!rows.length" class="gps__empty">{{ t('ia2.gov.people.empty') }}</div>
      <div v-for="r in rows" :key="r.account.userId" class="gps__row" :data-testid="`gov-people-${r.account.userId}`">
        <span class="gps__body">
          <span class="gps__name">👤 {{ r.account.displayName }}<template v-if="r.account.isLeader"> · {{ t('ia2.gov.people.leader') }}</template></span>
          <span class="gps__sub-line">
            {{ r.profiles.length }} {{ t('ia2.gov.people.profiles') }} · {{ r.open }} {{ t('ia2.gov.people.open') }}
            <template v-if="r.dutyRooms.length">
              · {{ t('ia2.part.duty') }}
              <button v-for="roomId in r.dutyRooms" :key="roomId" type="button" class="gps__room" @click="goDutyRoom(roomId)">
                {{ roomName(roomId) }}
              </button>
            </template>
          </span>
        </span>
        <span class="gps__ops">
          <button type="button" class="gps__op" :disabled="!r.profiles.length" @click="goTasks(r.profiles)">
            {{ t('ia2.gov.people.tasks') }}
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gps { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gps__head { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border-color); }
.gps__title { font-weight: 700; }
.gps__sub { font-size: 10px; color: var(--text-muted); }
.gps__list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
.gps__row {
  display: flex; align-items: center; gap: 8px; padding: 7px 6px; border-radius: 6px;
  &:hover { background: var(--bg-secondary); }
}
.gps__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.gps__name { font-size: 12px; color: var(--text-primary); }
.gps__sub-line { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.gps__room {
  border: none; background: none; color: var(--primary); font-size: 10px; cursor: pointer;
  padding: 0; &:hover { text-decoration: underline; }
}
.gps__ops { flex-shrink: 0; }
.gps__op {
  height: 22px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  &:disabled { opacity: .4; cursor: not-allowed; }
  &:hover:not(:disabled) { color: var(--text-primary); border-color: var(--text-muted); }
}
.gps__empty { padding: 16px; color: var(--text-muted); text-align: center; font-size: 11px; }
</style>
