<!-- overlay/custom/client/ia2/components/SitDetailPanel.vue -->
<!-- v12.2 态势内联面板（2026-09-20 用户裁定：二级/三级功能整合同页，不来回跳转）：
     态势条段（等我/任务/在线）点击后在态势条下方就地展开详情，全部操作不离开
     工作台——等我行上验收/打回/继续（评审门行点击进评审区）；任务段=跨板
     未完成未归档全量+分状态统计，行点击开看板抽屉；在线三栏明细（R3 两级
     级联）+ 管理台入口（覆盖层同页）。
     v12.4（2026-09-20 用户裁定）：会话/循环段退役（chips 已删）；等我口径
     对齐 useDecisionRows（review 任务/中断运行/fleet 审批/评审门 = 待我决策
     的任务及会话）；任务口径改未完成未归档 + 分状态统计。
     纯展示组件：数据全经 props，动作全 emit，装配方聚合。 -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DecisionRow } from '../composables/useDecisionRows'

export type SitSegment = 'waiting' | 'tasks' | 'online'

/** 任务状态呈现序（9 值词表；工作流从分诊到归档） */
const STATUS_ORDER = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'] as const

const props = defineProps<{
  segment: SitSegment
  waitItems: DecisionRow[]
  tasks: Array<{ id: string; title: string; status: string; assignee: string | null; createdAt: number }>
  /** 分状态统计（开放态；装配方自 useSitCounts.tasks.byStatus 投影） */
  taskStats: Array<{ status: string; count: number }>
  accounts: Array<{ userId: string; displayName: string; agentTeams: Array<{ slug: string; name: string; profiles: unknown[] }> }>
  machines: Array<{ id: string; profile: string; title: string; status: string }>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-task', taskId: string): void
  (e: 'approve-task', taskId: string): void
  (e: 'reject-task', taskId: string): void
  (e: 'approve-run', item: DecisionRow): void
  (e: 'approve-fleet', item: DecisionRow): void
  (e: 'open-review'): void
  (e: 'open-gov-people'): void
}>()

const { t } = useI18n()

const titleKey = computed(() => ({
  waiting: 'ia2.sit.waiting',
  tasks: 'ia2.sit.tasks',
  online: 'ia2.sit.online',
}[props.segment]))

/** 任务面板：开放态（未完成未归档，props 已过滤）、创建时间倒序，封顶 60 行 */
const taskRows = computed(() =>
  [...props.tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60))

/** 分状态统计行：按工作流词表序呈现（装配方给什么状态都归位） */
const sortedStats = computed(() =>
  [...props.taskStats].sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number])
    const ib = STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  }))

const agentRows = computed(() => {
  const rows: Array<{ key: string; userId: string; account: string; team: string; profiles: number; profileNames: string[] }> = []
  for (const a of props.accounts) {
    for (const at of a.agentTeams) {
      rows.push({
        key: `${a.userId}/${at.slug}`, userId: a.userId, account: a.displayName,
        team: at.name || at.slug, profiles: at.profiles.length,
        profileNames: at.profiles.map(x => String(x)),
      })
    }
  }
  return rows
})

// ── R3 在线级联：选中人 → 智能体队过滤；展开队 → profile 明细 ──
const selUserId = ref<string | null>(null)
const openTeamKey = ref<string | null>(null)
const shownAgentRows = computed(() =>
  selUserId.value ? agentRows.value.filter(r => r.userId === selUserId.value) : agentRows.value)

function onPickPerson(userId: string): void {
  selUserId.value = selUserId.value === userId ? null : userId
  openTeamKey.value = null
}

function statusLabel(status: string): string {
  return t(`ia2.board.status.${status}`, status)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="sitp" :data-testid="`sit-panel-${segment}`">
    <div class="sitp__head">
      <span class="sitp__title">{{ t(titleKey) }}</span>
      <span class="sitp__count">{{ segment === 'waiting' ? waitItems.length : segment === 'tasks' ? tasks.length : (accounts.length + agentRows.length + machines.length) }}</span>
      <button type="button" class="sitp__close" data-testid="sit-panel-close" :title="t('ia2.sit.panelClose')" @click="emit('close')">×</button>
    </div>

    <div class="sitp__body">
      <!-- 等我：行上就地决策，不离开工作台；评审门行点击进评审区 -->
      <template v-if="segment === 'waiting'">
        <div v-if="!waitItems.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <div v-for="w in waitItems" :key="w.id" class="sitp__row sitp__row--wait">
          <button
            type="button" class="sitp__main" :title="w.title"
            @click="w.kind === 'gate-review' ? emit('open-review') : w.taskId && emit('open-task', w.taskId)"
          >
            <span class="sitp__name">{{ w.title }}</span>
            <span class="sitp__sub">{{ t(w.subKey) }}</span>
          </button>
          <span class="sitp__acts">
            <template v-if="w.kind === 'task-review' && w.taskId">
              <button type="button" class="sitp__act sitp__act--ok" data-testid="sitp-approve" @click="emit('approve-task', w.taskId)">{{ t('ia2.sit.actApprove') }}</button>
              <button type="button" class="sitp__act sitp__act--no" data-testid="sitp-reject" @click="emit('reject-task', w.taskId)">{{ t('ia2.sit.actReject') }}</button>
            </template>
            <button v-else-if="w.runId" type="button" class="sitp__act sitp__act--ok" data-testid="sitp-resume" @click="emit('approve-run', w)">{{ t('ia2.sit.actContinue') }}</button>
            <button v-else-if="w.sessionId && w.approvalId" type="button" class="sitp__act sitp__act--ok" data-testid="sitp-fleet-ok" @click="emit('approve-fleet', w)">{{ t('ia2.sit.actApprove') }}</button>
            <button v-else-if="w.kind === 'gate-review'" type="button" class="sitp__act sitp__act--ok" data-testid="sitp-gate-open" @click="emit('open-review')">{{ t('ia2.sit.actGoReview') }}</button>
          </span>
        </div>
      </template>

      <!-- 任务：分状态统计 + 行点击开看板任务抽屉（同页抽屉，不跳看板页） -->
      <template v-else-if="segment === 'tasks'">
        <div v-if="!taskRows.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <div v-if="sortedStats.length" class="sitp__stats" data-testid="sitp-task-stats">
          <span
            v-for="s in sortedStats" :key="s.status"
            class="sitp__stat" :class="`sitp__stat--${s.status}`"
            :data-testid="`sitp-stat-${s.status}`"
          >{{ statusLabel(s.status) }} {{ s.count }}</span>
        </div>
        <button
          v-for="task in taskRows" :key="task.id" type="button" class="sitp__row"
          :data-testid="`sitp-task-${task.id}`" :title="task.title"
          @click="emit('open-task', task.id)"
        >
          <span class="sitp__name">{{ task.title }}</span>
          <span class="sitp__tag" :class="`sitp__tag--${task.status}`">{{ statusLabel(task.status) }}</span>
          <span class="sitp__sub">{{ task.assignee ? `@${task.assignee}` : '—' }}</span>
        </button>
      </template>

      <!-- 在线（R3 级联）：点人过滤智能体队；点队展开 profile；机器静态 + 管理台 -->
      <template v-else>
        <div class="sitp__cols">
          <div class="sitp__col">
            <div class="sitp__col-title">👤 {{ t('ia2.sit.panelPeople') }} {{ accounts.length }}</div>
            <button
              v-for="a in accounts" :key="a.userId" type="button" class="sitp__cell sitp__cell--btn"
              :class="{ 'is-on': selUserId === a.userId }" :data-testid="`sitp-person-${a.userId}`"
              :title="a.userId" @click="onPickPerson(a.userId)"
            >{{ a.displayName }}</button>
          </div>
          <div class="sitp__col">
            <div class="sitp__col-title">🤖 {{ t('ia2.sit.panelAgents') }} {{ shownAgentRows.length }}</div>
            <template v-for="r in shownAgentRows" :key="r.key">
              <button
                type="button" class="sitp__cell sitp__cell--btn"
                :class="{ 'is-on': openTeamKey === r.key }" :data-testid="`sitp-team-${r.key}`"
                :title="r.account" @click="openTeamKey = openTeamKey === r.key ? null : r.key"
              >{{ r.team }} <span class="sitp__sub">×{{ r.profiles }}</span></button>
              <div v-if="openTeamKey === r.key" class="sitp__profiles" :data-testid="`sitp-profiles-${r.key}`">
                <span v-for="pn in r.profileNames" :key="pn" class="sitp__chip">{{ pn }}</span>
              </div>
            </template>
          </div>
          <div class="sitp__col">
            <div class="sitp__col-title">🖥 {{ t('ia2.sit.panelMachines') }} {{ machines.length }}</div>
            <div v-for="m in machines" :key="m.id" class="sitp__cell" :title="m.title">
              <span class="sitp__dot" :class="m.status === 'working' ? 'is-ok' : 'is-idle'" /> {{ m.profile }}
            </div>
          </div>
        </div>
        <button type="button" class="sitp__gov" data-testid="sitp-open-gov" @click="emit('open-gov-people')">
          ⚙ {{ t('ia2.sit.openManage') }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sitp {
  flex-shrink: 0; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-card); margin: 2px 2px 4px; overflow: hidden;
}
.sitp__head {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  border-bottom: 1px solid var(--border-color); background: var(--bg-secondary);
}
.sitp__title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.sitp__count { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.sitp__close {
  margin-left: auto; border: none; background: none; color: var(--text-muted);
  font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.sitp__body { max-height: 240px; overflow-y: auto; padding: 4px 6px; }
.sitp__empty { padding: 18px 0; text-align: center; color: var(--text-muted); font-size: 12px; }
.sitp__row {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px;
  border: none; border-radius: 5px; background: transparent; cursor: pointer;
  font-family: inherit; text-align: left;
  &:hover { background: var(--bg-secondary); }
}
.sitp__row--wait { padding-right: 2px; }
.sitp__main {
  display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0;
  padding: 2px 4px; border: none; background: transparent; cursor: pointer;
  font-family: inherit; text-align: left;
  &:hover .sitp__name { color: var(--primary, #3b82f6); }
}
.sitp__name {
  font-size: 12px; color: var(--text-primary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.sitp__sub { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.sitp__tag {
  flex-shrink: 0; font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary);
}
.sitp__tag--blocked { background: var(--error); color: #fff; }
.sitp__stats {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px 6px;
  border-bottom: 1px dashed var(--border-color); margin-bottom: 4px;
}
.sitp__stat {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.sitp__stat--blocked { background: var(--error); color: #fff; }
.sitp__stat--review { background: var(--warning); color: var(--text-primary); }
.sitp__stat--running { background: var(--primary, #3b82f6); color: #fff; }
.sitp__badge {
  flex-shrink: 0; min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px;
  background: var(--error); color: #fff; font-size: 9px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.sitp__acts { display: inline-flex; gap: 4px; flex-shrink: 0; }
.sitp__act {
  height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); font-size: 11px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.sitp__act--ok { color: var(--success); border-color: var(--success); }
.sitp__act--no { color: var(--error); border-color: var(--error); }
.sitp__cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 6px; }
.sitp__col { min-width: 0; }
.sitp__col-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); padding: 2px 4px 6px; }
.sitp__cell {
  font-size: 11px; color: var(--text-primary); padding: 3px 4px; border-radius: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 5px;
  &:hover { background: var(--bg-secondary); }
}
.sitp__cell--btn {
  width: 100%; border: none; background: transparent; cursor: pointer; font-family: inherit;
  text-align: left;
  &.is-on { background: var(--bg-secondary); color: var(--primary, #3b82f6); font-weight: 600; }
}
.sitp__profiles { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 4px 6px 14px; }
.sitp__chip {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-color);
}
.sitp__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sitp__dot.is-ok { background: var(--success); }
.sitp__dot.is-idle { background: var(--text-muted); }
.sitp__gov {
  display: block; margin: 4px auto 8px; height: 26px; padding: 0 14px;
  border: 1px solid var(--border-color); border-radius: 13px; background: var(--bg-card);
  color: var(--text-secondary); font-size: 12px; cursor: pointer; font-family: inherit;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
