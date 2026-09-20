<!-- overlay/custom/client/ia2/components/SitDetailPanel.vue -->
<!-- v12.2 态势内联面板（2026-09-20 用户裁定：二级/三级功能整合同页，不来回跳转）：
     态势条五段（等我/任务/会话/循环/在线）点击后在态势条下方就地展开详情，
     全部操作不离开工作台——等我行上验收/打回/继续；任务行开看板抽屉；
     会话/循环行选中即中栏切换画布；在线三栏明细 + 管理台入口（覆盖层同页）。
     纯展示组件：数据全经 props，动作全 emit，装配方（WorkbenchView）聚合。 -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WaitItem } from '../adapters/waiting'
import type { FlowSessionRow, FlowLoopRow } from '../adapters/flow'

export type SitSegment = 'waiting' | 'tasks' | 'sessions' | 'loops' | 'online'

const props = defineProps<{
  segment: SitSegment
  waitItems: WaitItem[]
  tasks: Array<{ id: string; title: string; status: string; assignee: string | null; createdAt: number }>
  sessions: FlowSessionRow[]
  loops: FlowLoopRow[]
  accounts: Array<{ userId: string; displayName: string; agentTeams: Array<{ slug: string; name: string; profiles: unknown[] }> }>
  machines: Array<{ id: string; profile: string; title: string; status: string }>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-task', taskId: string): void
  (e: 'approve-task', taskId: string): void
  (e: 'reject-task', taskId: string): void
  (e: 'approve-run', item: WaitItem): void
  (e: 'approve-fleet', item: WaitItem): void
  (e: 'select-session', sel: { kind: 'room' | 'chat'; id: string }): void
  (e: 'select-loop', loopId: string): void
  (e: 'open-gov-people'): void
}>()

const { t } = useI18n()

const titleKey = computed(() => ({
  waiting: 'ia2.sit.waiting',
  tasks: 'ia2.sit.tasks',
  sessions: 'ia2.sit.sessions',
  loops: 'ia2.sit.loops',
  online: 'ia2.sit.online',
}[props.segment]))

/** 任务面板：开放态在前、创建时间倒序，封顶 60 行（全量看板走抽屉/管理台） */
const taskRows = computed(() =>
  [...props.tasks]
    .sort((a, b) => {
      const open = (x: { status: string }) => (x.status === 'done' || x.status === 'archived' ? 1 : 0)
      return open(a) - open(b) || b.createdAt - a.createdAt
    })
    .slice(0, 60))

const agentRows = computed(() => {
  const rows: Array<{ key: string; account: string; team: string; profiles: number }> = []
  for (const a of props.accounts) {
    for (const at of a.agentTeams) {
      rows.push({ key: `${a.userId}/${at.slug}`, account: a.displayName, team: at.name || at.slug, profiles: at.profiles.length })
    }
  }
  return rows
})

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
      <span class="sitp__count">{{ segment === 'waiting' ? waitItems.length : segment === 'tasks' ? tasks.length : segment === 'sessions' ? sessions.length : segment === 'loops' ? loops.length : (accounts.length + agentRows.length + machines.length) }}</span>
      <button type="button" class="sitp__close" data-testid="sit-panel-close" :title="t('ia2.sit.panelClose')" @click="emit('close')">×</button>
    </div>

    <div class="sitp__body">
      <!-- 等我：行上就地决策，不离开工作台 -->
      <template v-if="segment === 'waiting'">
        <div v-if="!waitItems.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <div v-for="w in waitItems" :key="w.id" class="sitp__row sitp__row--wait">
          <button type="button" class="sitp__main" :title="w.title" @click="w.taskId && emit('open-task', w.taskId)">
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
          </span>
        </div>
      </template>

      <!-- 任务：行点击开看板任务抽屉（同页抽屉，不跳看板页） -->
      <template v-else-if="segment === 'tasks'">
        <div v-if="!taskRows.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
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

      <!-- 会话：行选中即工作台左栏同款选择（中栏换画布，不换页） -->
      <template v-else-if="segment === 'sessions'">
        <div v-if="!sessions.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <button
          v-for="s in sessions" :key="`${s.kind}:${s.id}`" type="button" class="sitp__row"
          :data-testid="`sitp-session-${s.kind}-${s.id}`" :title="s.name"
          @click="emit('select-session', { kind: s.kind, id: s.id })"
        >
          <span class="sitp__name">{{ s.kind === 'room' ? '#' : '💬' }} {{ s.name }}</span>
          <span v-if="s.teamTag" class="sitp__tag">{{ s.teamTag }}</span>
          <span v-if="s.unread" class="sitp__badge">{{ s.unread }}</span>
          <span v-if="s.taskIds.length" class="sitp__sub">📋{{ s.taskIds.length }}</span>
        </button>
      </template>

      <!-- 循环：行选中即中栏切运行画布 -->
      <template v-else-if="segment === 'loops'">
        <div v-if="!loops.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <button
          v-for="l in loops" :key="l.id" type="button" class="sitp__row"
          :data-testid="`sitp-loop-${l.id}`" :title="l.name"
          @click="emit('select-loop', l.id)"
        >
          <span class="sitp__name">▶ {{ l.name }}</span>
          <span class="sitp__tag" :class="{ 'sitp__tag--blocked': l.blocked }">{{ t(`ia2.loop.status.${l.statusKey}`) }}</span>
          <span class="sitp__sub">{{ l.stageIndex + 1 }}/{{ l.stageTotal }} · {{ l.progressPct }}%</span>
        </button>
      </template>

      <!-- 在线：人/智能体/机器 三栏明细 + 管理台（覆盖层同页） -->
      <template v-else>
        <div class="sitp__cols">
          <div class="sitp__col">
            <div class="sitp__col-title">👤 {{ t('ia2.sit.panelPeople') }} {{ accounts.length }}</div>
            <div v-for="a in accounts" :key="a.userId" class="sitp__cell" :title="a.userId">{{ a.displayName }}</div>
          </div>
          <div class="sitp__col">
            <div class="sitp__col-title">🤖 {{ t('ia2.sit.panelAgents') }} {{ agentRows.length }}</div>
            <div v-for="r in agentRows" :key="r.key" class="sitp__cell" :title="r.account">{{ r.team }} <span class="sitp__sub">×{{ r.profiles }}</span></div>
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
