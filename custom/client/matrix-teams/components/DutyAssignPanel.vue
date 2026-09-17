<!-- overlay/custom/client/matrix-teams/components/DutyAssignPanel.vue -->
<!-- 群聊值守：leader 选房间 + 目标（账号或 agent team）→ 覆盖写 duty state；列表可清除。 -->
<!-- i18n 键 teams.duty.* 由 Task 7 的 locale 注入提供；接线（挂载到 TeamsManagePanel）同样在 Task 7。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamRegistryStore } from '../stores/team-registry'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { agentTeamGlobalId } from '../protocol'

const { t } = useI18n()
const registry = useTeamRegistryStore()
const roomStore = useMatrixRoomStore()

const selectedRoom = ref('')
const selectedTarget = ref('')
// writeDuty 失败提示（终审 backlog）：返回 false 时展示；文案优先 store.lastError
// （SDK 异常明细），门禁型失败（非 leader/未配置房间）无明细时用固定 i18n 文案。
const assignFailed = ref(false)
const rooms = computed(() => roomStore.sortedRooms.map(r => ({ roomId: r.roomId, name: r.name ?? r.roomId })))
// kind 随 target 携带（Task 6 评审遗留：不做 '/' 字符串嗅探——Matrix ID 本身
// 不含 '/' 但协议形态不该由字符串形状反推，判定只认枚举）。
const targets = computed(() => registry.accounts.flatMap(a => [
  { id: a.userId, kind: 'account' as const, label: a.displayName },
  ...a.agentTeams.map(tm => ({ id: agentTeamGlobalId(a.userId, tm.slug), kind: 'agentTeam' as const, label: `${a.displayName}/${tm.slug}` })),
]))
const dutyRows = computed(() => Object.entries(registry.duties)
  .map(([roomId, d]) => ({ roomId, ...d })))

async function assign(): Promise<void> {
  const target = targets.value.find(t => t.id === selectedTarget.value)
  if (!selectedRoom.value || !target) return
  const room = rooms.value.find(r => r.roomId === selectedRoom.value)
  if (await registry.writeDuty(selectedRoom.value, {
    assigneeKind: target.kind,
    assigneeId: target.id,
    roomName: room?.name,
  })) {
    selectedRoom.value = ''; selectedTarget.value = ''
    assignFailed.value = false
  } else {
    assignFailed.value = true
  }
}

onMounted(() => { void registry.detectRegistry() })
</script>

<template>
  <div class="dap" data-testid="duty-panel">
    <div class="dap__sec">{{ t('teams.duty.title') }}</div>
    <div v-if="registry.isLeader" class="dap__form">
      <select v-model="selectedRoom" class="dap__select" data-testid="duty-room-select"
        :aria-label="t('teams.duty.chooseRoom')">
        <option value="">{{ t('teams.duty.chooseRoom') }}</option>
        <option v-for="r in rooms" :key="r.roomId" :value="r.roomId">{{ r.name }}</option>
      </select>
      <select v-model="selectedTarget" class="dap__select" data-testid="duty-target-select"
        :aria-label="t('teams.duty.to')">
        <option value="">{{ t('teams.duty.to') }}</option>
        <option v-for="tg in targets" :key="tg.id" :value="tg.id">{{ tg.label }}</option>
      </select>
      <button type="button" class="dap__primary" data-testid="duty-assign"
        @click="assign">{{ t('teams.duty.assign') }}</button>
      <div v-if="assignFailed" class="dap__error" data-testid="duty-error" role="alert">
        {{ registry.lastError || t('teams.duty.assignFailed') }}</div>
    </div>
    <div class="dap__list" data-testid="duty-list">
      <div v-for="row in dutyRows" :key="row.roomId" class="dap__row">
        <span class="dap__room">{{ row.roomName ?? row.roomId }}</span>
        <span class="dap__assignee">{{ row.assigneeId }}</span>
        <span class="dap__by">{{ row.updatedBy }}</span>
        <button v-if="registry.isLeader" type="button" class="dap__clear" data-testid="duty-clear"
          @click="registry.clearDuty(row.roomId)">{{ t('teams.duty.clear') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dap { display: flex; flex-direction: column; gap: 8px; }
.dap__sec { font-size: 12px; font-weight: 600; }
.dap__form { display: flex; gap: 6px; flex-wrap: wrap; }
.dap__select { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 6px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); max-width: 180px; }
.dap__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; font-family: inherit; }
.dap__list { display: flex; flex-direction: column; gap: 4px; }
.dap__row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dap__room { font-weight: 600; }
.dap__assignee { color: var(--color-primary, #3b82f6); }
.dap__by { color: var(--text-secondary); font-size: 11px; }
.dap__error { color: var(--color-danger, #e11d48); font-size: 12px; }
.dap__clear { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; }
</style>
