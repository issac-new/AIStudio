<!-- overlay/custom/client/ia2/components/gov/GovDetailPanel.vue -->
<!-- v12 管理台 · 详情面板：随所选对象联动。任务=实时卡（指派/会话 chips 可跳）
+ 历史卡（↗运行·历史=RunTrace / ⌨ IDE 任务空间）；其余类型显示选中标识。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFlowStore } from '../../store/flow'
import { useWorkspaceStore } from '../../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { linkedTaskIdsOfSession } from '../../adapters/flow'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

const { t } = useI18n()
const router = useRouter()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()
const matrixRoom = useMatrixRoomStore()

const selectedTask = computed(() => {
  const id = flow.govSelectedId
  if (!id?.startsWith('task:')) return null
  return workspace.tasks.find(x => x.id === id.slice(5)) ?? null
})

const selectedRaw = computed(() => flow.govSelectedId ?? '')

/** 任务挂靠的会话（tenant 房间段命中谁 → 工作台可跳） */
const taskSession = computed(() => {
  const task = selectedTask.value
  if (!task) return null
  for (const room of (matrixRoom.sortedRooms ?? []) as Array<{ roomId: string; name?: string }>) {
    if (linkedTaskIdsOfSession({ kind: 'room', id: room.roomId }, [task]).length > 0) {
      return { kind: 'room' as const, id: room.roomId, name: room.name || room.roomId }
    }
  }
  return null
})

function gotoSession(): void {
  const s = taskSession.value
  if (!s) return
  flow.closeGov()
  void router.push({ name: 'ia2.commsRoom', params: { roomId: s.id } })
}

function gotoRunHistory(): void {
  const task = selectedTask.value
  flow.closeGov()
  cockpit.openRunTrace({ taskId: task?.id, sessionId: '' })
}

function gotoIde(): void {
  const task = selectedTask.value
  if (!task) return
  flow.closeGov()
  void router.push({ name: 'ide.shell', query: { task: task.id } })
}
</script>

<template>
  <div class="gdp" data-testid="gov-detail">
    <div class="gdp__head">{{ t('ia2.gov.detailTitle') }}<template v-if="selectedTask"> · #{{ selectedTask.id.slice(0, 8) }}</template></div>
    <div class="gdp__body">
      <template v-if="selectedTask">
        <div class="gdp__card">
          <div class="gdp__card-head">{{ t('ia2.gov.realtime') }}</div>
          <div class="gdp__row">
            <span class="gdp__k">{{ t('ia2.gov.task.colAssignee') }}</span>
            <span class="gdp__v">{{ selectedTask.assignee }}</span>
          </div>
          <div class="gdp__row">
            <span class="gdp__k">{{ t('ia2.gov.task.colStatus') }}</span>
            <span class="gdp__v">{{ t(`ia2.tdp.status.${selectedTask.status}`) }}</span>
          </div>
          <div class="gdp__row">
            <span class="gdp__k">{{ t('ia2.sit.sessions') }}</span>
            <button v-if="taskSession" type="button" class="gdp__link" data-testid="gov-detail-session" @click="gotoSession">
              {{ taskSession.name }} ↗
            </button>
            <span v-else class="gdp__v gdp__v--muted">{{ t('ia2.gov.noSession') }}</span>
          </div>
        </div>
        <div class="gdp__card">
          <div class="gdp__card-head">{{ t('ia2.gov.history') }}</div>
          <div class="gdp__acts">
            <button type="button" class="gdp__btn" data-testid="gov-detail-runhistory" @click="gotoRunHistory">
              ↗ {{ t('ia2.gov.runHistory') }}
            </button>
            <button type="button" class="gdp__btn" data-testid="gov-detail-ide" @click="gotoIde">
              ⌨ {{ t('ia2.gov.ideTask') }}
            </button>
          </div>
        </div>
      </template>
      <div v-else class="gdp__empty">
        {{ selectedRaw ? selectedRaw : t('ia2.gov.detailEmpty') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gdp { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gdp__head { padding: 10px 12px 6px; font-weight: 700; color: var(--text-primary); }
.gdp__body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; }
.gdp__card { border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.gdp__card-head { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.gdp__row { display: flex; align-items: center; justify-content: space-between; padding: 3px 0; gap: 8px; }
.gdp__k { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.gdp__v { color: var(--text-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gdp__v--muted { color: var(--text-muted); }
.gdp__link { border: none; background: none; color: var(--primary); font-size: 11px; cursor: pointer; &:hover { text-decoration: underline; } }
.gdp__acts { display: flex; flex-direction: column; gap: 6px; }
.gdp__btn {
  height: 26px; border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.gdp__empty { padding: 14px 6px; color: var(--text-muted); font-size: 11px; text-align: center; overflow: hidden; text-overflow: ellipsis; }
</style>
