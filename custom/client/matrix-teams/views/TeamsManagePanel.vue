<!-- overlay/custom/client/matrix-teams/views/TeamsManagePanel.vue -->
<!-- Teams 管理：注册房间建立/候选兜底 + 账号树（自声明 agent teams）+ leader 管理（邀请/leaders）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamRegistryStore } from '../stores/team-registry'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { agentTeamGlobalId, type AgentTeam } from '../protocol'
import AgentTeamEditor from '../components/AgentTeamEditor.vue'
import DutyAssignPanel from '../components/DutyAssignPanel.vue'
import DispatchList from '../components/DispatchList.vue'

const { t } = useI18n()
const registry = useTeamRegistryStore()
const matrixClientStore = useMatrixClientStore()

const matrixOnline = computed(() => matrixClientStore.authenticated && !!matrixClientStore.client)

// ── 建房/候选 ──
const roomName = ref('')
const inviteIds = ref('')
async function submitCreate(): Promise<void> {
  const ids = inviteIds.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  const ok = await registry.createRegistryRoom(roomName.value.trim() || 'Swarm Teams', ids)
  if (ok) { roomName.value = ''; inviteIds.value = '' }
}

// ── 账号树 ──
const selfUserId = computed(() => matrixClientStore.userId)
const selfAccount = computed(() => registry.accounts.find(a => a.userId === selfUserId.value) ?? null)
const selfTeams = computed<AgentTeam[]>(() => selfAccount.value?.agentTeams ?? [])
async function saveSelfTeams(teams: AgentTeam[]): Promise<void> {
  await registry.writeSelfAccount(teams)
}

// ── leader 管理 ──
const inviteInput = ref('')
async function submitInvite(): Promise<void> {
  const id = inviteInput.value.trim()
  if (!id) return
  if (await registry.inviteMember(id)) inviteInput.value = ''
}
const leaderAddInput = ref('')
async function addLeader(): Promise<void> {
  const id = leaderAddInput.value.trim()
  if (!id || registry.leaders.includes(id)) return
  if (await registry.writeLeaders([...registry.leaders, id])) leaderAddInput.value = ''
}
async function removeLeader(id: string): Promise<void> {
  await registry.writeLeaders(registry.leaders.filter(l => l !== id))
}

// 监听由 store 自身负责（setup 顶层挂 pinia 作用域）；面板只做一次发现。
onMounted(() => {
  void registry.detectRegistry()
})
</script>

<template>
  <div class="tmp" data-testid="teams-panel">
    <div v-if="!matrixOnline" class="tmp__offline">{{ t('teams.matrixOffline') }}</div>

    <div v-else-if="!registry.registryRoomId" class="tmp__setup" data-testid="teams-setup">
      <div class="tmp__hint">{{ t('teams.registry.none') }}</div>
      <input v-model="roomName" class="tmp__input" data-testid="teams-create-name"
        :placeholder="t('teams.registry.setName')" />
      <input v-model="inviteIds" class="tmp__input" data-testid="teams-create-invite"
        :placeholder="t('teams.registry.inviteIds')" />
      <button type="button" class="tmp__primary" data-testid="teams-create-submit"
        @click="submitCreate">{{ t('teams.registry.create') }}</button>

      <div v-if="registry.registryCandidateRooms().length" class="tmp__cands">
        <div class="tmp__hint">{{ t('teams.registry.candidates') }}</div>
        <button v-for="c in registry.registryCandidateRooms()" :key="c.roomId" type="button"
          class="tmp__cand" :data-testid="`teams-candidate-${c.roomId}`"
          @click="registry.setRegistryRoom(c.roomId)">
          {{ c.name }} · {{ t('teams.registry.useThis') }}</button>
      </div>
    </div>

    <template v-else>
      <header class="tmp__head">
        <span class="tmp__title">{{ t('teams.title') }}</span>
        <span class="tmp__room" :title="registry.registryRoomId">{{ t('teams.registry.room') }}: {{ registry.registryRoomId }}</span>
      </header>

      <div class="tmp__body">
        <section class="tmp__accounts" data-testid="teams-accounts">
          <div class="tmp__sec">{{ t('teams.accounts') }}</div>
          <div v-if="registry.accounts.length === 0" class="tmp__empty">{{ t('teams.accounts.empty') }}</div>
          <div v-for="a in registry.accounts" :key="a.userId" class="tmp__account"
            :data-testid="`teams-account-${a.userId}`">
            <div class="tmp__account-line1">
              <span class="tmp__account-name">{{ a.displayName }}</span>
              <span class="tmp__account-id">{{ a.userId }}</span>
              <span v-if="a.isLeader" class="tmp__leader" data-testid="teams-leader-badge">
                {{ t('teams.leader.badge') }}</span>
            </div>
            <div v-for="tm in a.agentTeams" :key="tm.slug" class="tmp__team">
              <span class="tmp__team-id">{{ agentTeamGlobalId(a.userId, tm.slug) }}</span>
              <span class="tmp__team-name">{{ tm.name }}</span>
              <span class="tmp__team-profiles">{{ tm.profiles.join(', ') }}</span>
            </div>
          </div>
          <div v-for="u in registry.undeclared" :key="u" class="tmp__undeclared"
            :data-testid="`teams-undeclared-${u}`">{{ u }}</div>
        </section>

        <aside class="tmp__side">
          <section class="tmp__self">
            <div class="tmp__sec">{{ t('teams.self.hint') }}</div>
            <AgentTeamEditor :initial="selfTeams" @save="saveSelfTeams" />
          </section>

          <section v-if="registry.isLeader" class="tmp__admin" data-testid="teams-admin">
            <div class="tmp__sec">{{ t('teams.leader.manage') }}</div>
            <div class="tmp__invite-row">
              <input v-model="inviteInput" class="tmp__input" data-testid="teams-invite-input"
                placeholder="@user:server" />
              <button type="button" data-testid="teams-invite-submit"
                @click="submitInvite">{{ t('teams.invite.button') }}</button>
            </div>
            <div class="tmp__leaders">
              <span v-for="l in registry.leaders" :key="l" class="tmp__leader-chip">
                {{ l }}
                <button v-if="registry.leaders.length > 1" type="button" class="tmp__leader-x"
                  :data-testid="`teams-leader-remove-${l}`" @click="removeLeader(l)">✕</button>
              </span>
            </div>
            <div class="tmp__invite-row">
              <input v-model="leaderAddInput" class="tmp__input" data-testid="teams-leader-add-input"
                placeholder="@user:server" />
              <button type="button" data-testid="teams-leader-add"
                @click="addLeader">{{ t('teams.leader.add') }}</button>
            </div>
          </section>

          <section class="tmp__duty">
            <DutyAssignPanel />
          </section>

          <section class="tmp__dispatch">
            <DispatchList />
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tmp { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.tmp__offline, .tmp__empty { font-size: 12px; color: var(--text-secondary); padding: 8px; }
.tmp__setup { display: flex; flex-direction: column; gap: 8px; max-width: 420px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-standard); }
.tmp__hint { font-size: 12px; color: var(--text-secondary); }
.tmp__input { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 4px 8px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.tmp__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 4px 14px; cursor: pointer; font-family: inherit; }
.tmp__cands { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.tmp__cand { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: var(--radius-standard); padding: 4px 10px; cursor: pointer; font-family: inherit; text-align: left; }
.tmp__head { display: flex; align-items: baseline; gap: 10px; }
.tmp__title { font-size: 14px; font-weight: 600; }
.tmp__room { font-size: 11px; color: var(--text-secondary); }
.tmp__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.tmp__accounts { flex: 1 1 auto; min-width: 0; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tmp__side { flex: 0 0 360px; display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.tmp__self, .tmp__admin, .tmp__duty, .tmp__dispatch { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tmp__sec { font-size: 12px; font-weight: 600; }
.tmp__account { display: flex; flex-direction: column; gap: 3px; }
.tmp__account-line1 { display: flex; align-items: center; gap: 8px; }
.tmp__account-name { font-weight: 600; font-size: 13px; }
.tmp__account-id { font-size: 11px; color: var(--text-secondary); }
.tmp__leader { font-size: 10px; border: 1px solid var(--color-warning, #f59e0b); color: var(--color-warning, #f59e0b); border-radius: 999px; padding: 0 6px; }
.tmp__team { display: flex; gap: 8px; font-size: 12px; padding-left: 10px; }
.tmp__team-id { color: var(--color-primary, #3b82f6); font-size: 11px; }
.tmp__team-profiles { color: var(--text-secondary); font-size: 11px; }
.tmp__undeclared { font-size: 11px; color: var(--text-secondary); opacity: 0.7; }
.tmp__invite-row { display: flex; gap: 6px; }
.tmp__leaders { display: flex; flex-wrap: wrap; gap: 4px; }
.tmp__leader-chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.tmp__leader-x { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; padding: 0; }
</style>
