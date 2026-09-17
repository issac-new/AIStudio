<!-- overlay/custom/client/ia2/views/scenes/ManageScene.vue -->
<!-- 管理场景（2026-09-16 多视图重构；2026-09-17 Task 5 加二级 tab）：
     顶部二级 tab（任务与值守 / Teams 管理）。值守 tab 为原视图——
     人员聚合条（assignee 在办分桶，点击按人筛选看板）+ 左看板主区
     （SwarmKanbanView 自武装内嵌，/app/tasks 同款先例）+ 右群栏目
     （任务↔群弱锚点列表 + 治理入口）。指派走看板既有 assignee 字段；
     建群在任务抽屉（Task 6 接线）。Teams tab 挂 TeamsManagePanel
     （Task 4，注册房间 + 成员账号树 + agent teams 声明）。 -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../store/workspace'
import { useKanbanStore } from '@/stores/hermes/kanban'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'
import { aggregateByAssignee, type RoomLike } from '../../adapters/manage'

const router = useRouter()
const { t } = useI18n()
const workspace = useWorkspaceStore()
const kanban = useKanbanStore()

// ── 二级 tab：任务与值守（原视图）/ Teams 管理（Task 5 挂载） ──
const TeamsManagePanel = defineAsyncComponent(() =>
  import('@/custom/matrix-teams/views/TeamsManagePanel.vue'))
const sceneTab = ref<'duty' | 'teams'>('duty')

// ── 人员聚合条（纯函数适配器，视图不自算） ──
const people = computed(() => aggregateByAssignee(workspace.tasks))
const activeAssignee = ref<string | null>(null)
function filterAssignee(name: string): void {
  if (name === '') return // 未指派桶非交互（评审 Important-1）：不可筛，'' 经上游 filterAssignee 归约 null 不可达
  const key = name === '' ? null : name
  const next = activeAssignee.value === key ? null : key
  activeAssignee.value = next
  kanban.setAssigneeFilter(next ?? undefined)
}
// 筛选态属本场景临时视图态：进入时快照外来的 store 筛选，离开时原样归还。
// 覆盖双写路径（chip 与内嵌看板工具条 handleAssigneeChange 直写 store）：
// 场景内改的筛选不外泄到 /app/tasks，用户原有筛选也不被清掉（2026-09-17 评审）。
const incomingFilter: string | null = kanban.filterAssignee ?? null
watch(() => kanban.filterAssignee, (v) => { activeAssignee.value = v ?? null })
onUnmounted(() => {
  kanban.setAssigneeFilter(incomingFilter ?? undefined)
})

// ── 群栏目（弱锚点群 = 群名以 '[' 前缀约定开头；matrix 不可用则整栏隐藏） ──
const rooms = ref<RoomLike[] | null>(null)
onMounted(async () => {
  try {
    const { useMatrixRoomStore } = await import('@/custom/matrix-chat/stores/matrix-room')
    rooms.value = (useMatrixRoomStore().sortedRooms as RoomLike[])
      .filter(r => (r.name ?? '').startsWith('['))
  } catch { rooms.value = null }
})
function openRoom(room: RoomLike): void {
  void router.push({ name: 'ia2.commsRoom', params: { roomId: room.roomId } })
}

const goBoard = () => void router.push({ path: '/app/tasks' })
const goTrace = () => void router.push({ path: '/app/tasks', query: { tab: 'trace' } })
</script>

<template>
  <section class="mscene" data-testid="scene-manage">
    <!-- 二级 tab 条 -->
    <div class="mscene__tabs" data-testid="mscene-tabs">
      <button type="button" class="mscene__tab" :class="{ 'mscene__tab--on': sceneTab === 'duty' }"
        data-testid="mscene-tab-duty" @click="sceneTab = 'duty'">{{ t('loopScenes.manage.tabDuty') }}</button>
      <button type="button" class="mscene__tab" :class="{ 'mscene__tab--on': sceneTab === 'teams' }"
        data-testid="mscene-tab-teams" @click="sceneTab = 'teams'">{{ t('loopScenes.manage.tabTeams') }}</button>
    </div>

    <template v-if="sceneTab === 'duty'">
    <!-- 人员聚合条 -->
    <div class="mscene__people" data-testid="mscene-people">
      <span class="mscene__people-label">{{ t('loopScenes.manage.people') }}</span>
      <button
        v-for="p in people"
        :key="p.name || '__none__'"
        type="button"
        class="mscene__person"
        :class="{ 'mscene__person--on': p.name !== '' && activeAssignee === p.name }"
        :data-testid="`mscene-person-${p.name || 'none'}`"
        :disabled="p.name === ''"
        @click="filterAssignee(p.name)"
      >
        <span class="mscene__person-name">{{ p.name || t('loopScenes.manage.unassigned') }}</span>
        <span class="mscene__person-count">{{ t('loopScenes.manage.openCount') }} {{ p.open }}</span>
        <span v-if="p.review" class="mscene__person-count mscene__person-count--warn">
          {{ t('kanban.columns.review') }} {{ p.review }}</span>
        <span v-if="p.blocked" class="mscene__person-count mscene__person-count--bad">
          {{ t('kanban.columns.blocked') }} {{ p.blocked }}</span>
      </button>
    </div>

    <div class="mscene__body">
      <!-- 左：看板主区（自武装内嵌） -->
      <main class="mscene__board">
        <SwarmKanbanView />
      </main>

      <!-- 右：群栏目 + 治理入口 -->
      <aside class="mscene__rail">
        <div class="mscene__rail-head">{{ t('loopScenes.manage.rooms') }}</div>
        <template v-if="rooms !== null">
          <div v-if="rooms.length === 0" class="mscene__rail-empty">{{ t('loopScenes.manage.noRooms') }}</div>
          <button
            v-for="r in rooms"
            :key="r.roomId"
            type="button"
            class="mscene__room"
            :data-testid="`mscene-room-${r.roomId}`"
            :title="r.name ?? r.roomId"
            @click="openRoom(r)"
          >{{ r.name ?? r.roomId }}</button>
        </template>

        <div class="mscene__rail-links">
          <button type="button" class="mscene__link" data-testid="mscene-goto-board" @click="goBoard">
            {{ t('loopScenes.manage.gotoBoard') }} ›</button>
          <button type="button" class="mscene__link" data-testid="mscene-goto-trace" @click="goTrace">
            {{ t('loopScenes.manage.trace') }} ›</button>
        </div>
      </aside>
    </div>
    </template>
    <TeamsManagePanel v-else />
  </section>
</template>

<style scoped>
.mscene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.mscene__tabs { flex: 0 0 auto; display: flex; gap: 6px; }
.mscene__tab { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: var(--radius-standard); padding: 3px 14px; cursor: pointer; font-size: 12px; font-family: inherit; }
.mscene__tab--on { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); font-weight: 600; }
.mscene__people {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary));
}
.mscene__people-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.mscene__person {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; cursor: pointer; font-size: 12px; font-family: inherit;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
}
.mscene__person:hover { border-color: var(--color-primary, #3b82f6); }
.mscene__person--on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); }
.mscene__person-name { font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mscene__person-count { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.mscene__person--on .mscene__person-count { color: inherit; }
.mscene__person-count--warn { color: var(--color-warning, #f59e0b); }
.mscene__person-count--bad { color: var(--color-danger, #e11d48); }
.mscene__person--on .mscene__person-count--warn, .mscene__person--on .mscene__person-count--bad { color: inherit; }
.mscene__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.mscene__board { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.mscene__rail {
  flex: 0 0 240px; min-height: 0; overflow-y: auto;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.mscene__rail-head { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.mscene__rail-empty { font-size: 12px; color: var(--text-secondary); }
.mscene__room {
  border: none; background: transparent; text-align: left; cursor: pointer;
  padding: 6px 8px; border-radius: var(--radius-standard); font-size: 12.5px; font-family: inherit;
  color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mscene__room:hover { background: var(--bg-hover, var(--bg-card)); color: var(--color-primary, #3b82f6); }
.mscene__rail-links { margin-top: auto; border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.mscene__link { border: none; background: none; padding: 2px 0; text-align: left; cursor: pointer; font-size: 12px; font-family: inherit; color: var(--color-primary, #3b82f6); }
</style>
