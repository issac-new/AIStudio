<!-- overlay/custom/client/ia2/components/SitDetailPanel.vue -->
<!-- v12.2 态势内联面板（2026-09-20 用户裁定：二级/三级功能整合同页，不来回跳转）：
     态势条段（等我/任务/在线）点击后在态势条下方就地展开详情，全部操作不离开
     工作台——等我行上验收/打回/继续（评审门行点击进评审区）；任务段=跨板
     未完成未归档全量+分状态统计；在线段级联。
     v12.4：会话/循环段退役；等我口径对齐 useDecisionRows；任务口径改开放态。
     v12.5（2026-09-20 用户裁定）：任务行基本信息增强（板/优先级/指派人/创建），
     行点击经装配方跳转关联聊天会话或编码工作空间；在线段改可检索三级级联——
     matrix 账号 → 机器(IP/标题) + kanban 板名 → agent profile 清单。
     纯展示组件：数据全经 props，动作全 emit，装配方聚合。 -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DecisionRow } from '../composables/useDecisionRows'

export type SitSegment = 'waiting' | 'tasks' | 'online'

/** 任务状态呈现序（9 值词表；工作流从分诊到归档） */
const STATUS_ORDER = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'] as const

/** 任务行（v12.5 增强形状：板名/优先级/挂接会话/工作空间由装配方 join 原始任务） */
export interface SitTaskRow {
  id: string
  title: string
  status: string
  assignee: string | null
  createdAt: number
  boardName?: string
  priority?: string
}

const props = defineProps<{
  segment: SitSegment
  waitItems: DecisionRow[]
  tasks: SitTaskRow[]
  /** 分状态统计（开放态；装配方自 useSitCounts.tasks.byStatus 投影） */
  taskStats: Array<{ status: string; count: number }>
  accounts: Array<{ userId: string; displayName: string; isLeader?: boolean; agentTeams: Array<{ slug: string; name: string; profiles: unknown[] }> }>
  machines: Array<{ id: string; profile: string; title: string; status: string }>
  /** v12.5 在线级联：看板清单（开放任务数）+ 团队（profiles↔boards 关联） */
  boards: Array<{ slug: string; name: string; open: number }>
  teams: Array<{ name: string; profiles: string[]; boards: string[] }>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-task', taskId: string): void
  /** v12.5 任务段行点击：跳转关联聊天会话 / 编码工作空间（与等我看板预选分流） */
  (e: 'jump-task', taskId: string): void
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

/** 创建时刻紧凑标签（2h / 3d；无时刻不显示） */
function createdLabel(ts: number): string {
  if (!ts) return ''
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// ── 在线三级级联（v12.5）：账号 → 机器 + kanban 板 → profile 清单 ──

const onlineQuery = ref('')

interface OnlineNode {
  key: string
  kind: 'account' | 'machine' | 'board'
  label: string
  sub?: string
  status?: string
  count?: number
  profiles: string[]
}

interface OnlineTreeRow {
  account: { userId: string; displayName: string; isLeader: boolean; profiles: string[] }
  machines: OnlineNode[]
  boards: OnlineNode[]
}

/** 账号 → {机器(fleet profile 命中), 看板(teams profiles↔boards 与账号 profiles 交集)} */
const onlineTree = computed<OnlineTreeRow[]>(() => {
  const rows: OnlineTreeRow[] = []
  for (const a of props.accounts) {
    const profiles: string[] = []
    for (const at of a.agentTeams) for (const p of at.profiles) profiles.push(String(p))
    const profileSet = new Set(profiles)
    const machines = props.machines
      .filter(m => profileSet.has(m.profile))
      .map(m => ({ key: `m:${m.id}`, kind: 'machine' as const, label: m.title || m.profile, sub: m.profile, status: m.status, profiles: [] }))
    const boardSlugs = new Set<string>()
    for (const team of props.teams) {
      if (!team.profiles.some(p => profileSet.has(p))) continue
      for (const slug of team.boards) boardSlugs.add(slug)
    }
    const boards = props.boards
      .filter(b => boardSlugs.has(b.slug))
      .map(b => {
        const profs = new Set<string>()
        for (const team of props.teams) {
          if (!team.boards.includes(b.slug)) continue
          for (const p of team.profiles) if (profileSet.has(p)) profs.add(p)
        }
        return { key: `b:${b.slug}`, kind: 'board' as const, label: b.name, count: b.open, profiles: [...profs] }
      })
    rows.push({
      account: { userId: a.userId, displayName: a.displayName, isLeader: a.isLeader ?? false, profiles },
      machines, boards,
    })
  }
  return rows
})

/** 检索命中（账号/机器/看板/profile 文本任一命中即保留该账号子树，节点级再过滤） */
function nodeHitsQuery(n: OnlineNode, q: string): boolean {
  return !q
    || n.label.toLowerCase().includes(q)
    || (n.sub ?? '').toLowerCase().includes(q)
    || n.profiles.some(p => p.toLowerCase().includes(q))
}

const filteredOnlineTree = computed(() => {
  const q = onlineQuery.value.trim().toLowerCase()
  if (!q) return onlineTree.value
  return onlineTree.value
    .map(row => ({
      ...row,
      machines: row.machines.filter(m => nodeHitsQuery(m, q)),
      boards: row.boards.filter(b => nodeHitsQuery(b, q)),
    }))
    .filter(row =>
      row.account.displayName.toLowerCase().includes(q)
      || row.account.userId.toLowerCase().includes(q)
      || row.account.profiles.some(p => p.toLowerCase().includes(q))
      || row.machines.length > 0
      || row.boards.length > 0)
})

const expandedAccounts = ref<Set<string>>(new Set())
const expandedBoards = ref<Set<string>>(new Set())

function toggleAccount(userId: string): void {
  const next = new Set(expandedAccounts.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  expandedAccounts.value = next
}

function toggleBoard(key: string): void {
  const next = new Set(expandedBoards.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedBoards.value = next
}

/** 有检索词时自动全展开（可检索优先于手动展开态） */
const autoExpand = computed(() => onlineQuery.value.trim() !== '')

function accountOpen(userId: string): boolean {
  return autoExpand.value || expandedAccounts.value.has(userId)
}

function boardOpen(key: string): boolean {
  return autoExpand.value || expandedBoards.value.has(key)
}

const onlineCount = computed(() => {
  let n = props.accounts.length + props.machines.length
  for (const row of onlineTree.value) n += row.boards.length
  return n
})

function statusLabel(status: string): string {
  // v12.7：状态词与 tdp/态势条共用 ia2.tdp.status.*（原 ia2.board.status.* 键
  // 在词表中不存在——裸键渲染存量缺陷，本轮回修）
  return t(`ia2.tdp.status.${status}`, status)
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
      <span class="sitp__count">{{ segment === 'waiting' ? waitItems.length : segment === 'tasks' ? tasks.length : onlineCount }}</span>
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

      <!-- 任务：分状态统计 + 基本信息行（板/优先级/指派/创建）；行点击经装配方
           跳转关联聊天会话或编码工作空间（v12.5 用户裁定） -->
      <template v-else-if="segment === 'tasks'">
        <div v-if="!taskRows.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <div v-if="taskStats.length" class="sitp__stats" data-testid="sitp-task-stats">
          <span
            v-for="s in sortedStats" :key="s.status"
            class="sitp__stat" :class="`sitp__stat--${s.status}`"
            :data-testid="`sitp-stat-${s.status}`"
          >{{ statusLabel(s.status) }} {{ s.count }}</span>
        </div>
        <button
          v-for="task in taskRows" :key="task.id" type="button" class="sitp__row sitp__row--task"
          :data-testid="`sitp-task-${task.id}`" :title="t('ia2.sit.taskJumpHint')"
          @click="emit('jump-task', task.id)"
        >
          <span class="sitp__main">
            <span class="sitp__name">{{ task.title }}</span>
            <span class="sitp__sub">
              <span v-if="task.boardName" class="sitp__tag sitp__tag--board">{{ task.boardName }}</span>
              <span v-if="task.priority" class="sitp__tag" :class="`sitp__tag--${task.priority.toLowerCase()}`">{{ task.priority }}</span>
              <span class="sitp__meta">{{ task.assignee ? `@${task.assignee}` : '—' }}<template v-if="createdLabel(task.createdAt)"> · {{ createdLabel(task.createdAt) }}</template></span>
            </span>
          </span>
          <span class="sitp__tag" :class="`sitp__tag--${task.status}`">{{ statusLabel(task.status) }}</span>
        </button>
      </template>

      <!-- 在线（v12.5 三级级联）：matrix 账号 → 机器(IP/标题) + kanban 板 →
           agent profile 清单；顶部检索框跨层过滤 -->
      <template v-else>
        <div class="sitp__search">
          <input
            v-model="onlineQuery" type="text" class="sitp__search-input"
            :placeholder="t('ia2.sit.onlineSearchPh')" data-testid="sitp-online-search"
          >
          <span v-if="onlineQuery" class="sitp__search-clear" data-testid="sitp-online-search-clear" @click="onlineQuery = ''">×</span>
        </div>
        <div v-if="!filteredOnlineTree.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
        <div v-for="row in filteredOnlineTree" :key="row.account.userId" class="sitp__acct">
          <button
            type="button" class="sitp__acct-head"
            :data-testid="`sitp-acct-${row.account.userId}`"
            :title="row.account.userId"
            @click="toggleAccount(row.account.userId)"
          >
            <span class="sitp__caret">{{ accountOpen(row.account.userId) ? '▾' : '▸' }}</span>
            <span class="sitp__dot sitp__dot--ok" />
            <span class="sitp__acct-name"><template v-if="row.account.isLeader">★ </template>{{ row.account.displayName }}</span>
            <span class="sitp__acct-sub">{{ row.machines.length }}{{ t('ia2.sit.panelMachines') }} · {{ row.boards.length }}{{ t('ia2.sit.panelBoards') }} · {{ row.account.profiles.length }} profile</span>
          </button>
          <div v-if="accountOpen(row.account.userId)" class="sitp__acct-body">
            <div v-if="!row.machines.length && !row.boards.length" class="sitp__empty">{{ t('ia2.sit.empty') }}</div>
            <div
              v-for="m in row.machines" :key="m.key"
              class="sitp__node" :data-testid="`sitp-machine-${m.key}`" :title="m.sub ?? ''"
            >
              <span class="sitp__dot" :class="m.status === 'working' ? 'is-ok' : 'is-idle'" />
              <span class="sitp__node-label">{{ m.label }}</span>
              <span class="sitp__node-sub">{{ m.sub }}</span>
            </div>
            <button
              v-for="b in row.boards" :key="b.key"
              type="button" class="sitp__node sitp__node--btn"
              :class="{ 'is-open': boardOpen(b.key) }"
              :data-testid="`sitp-board-${b.key}`"
              @click="toggleBoard(b.key)"
            >
              <span class="sitp__caret">{{ boardOpen(b.key) ? '▾' : '▸' }}</span>
              <span class="sitp__node-label">📋 {{ b.label }}</span>
              <span class="sitp__node-sub sitp__node-n">{{ b.count }}</span>
            </button>
            <div v-for="b in row.boards" :key="`${b.key}:profiles`">
              <div v-if="boardOpen(b.key) && b.profiles.length" class="sitp__profiles" :data-testid="`sitp-board-profiles-${b.key}`">
                <span v-for="p in b.profiles" :key="p" class="sitp__chip">{{ p }}</span>
              </div>
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
.sitp__body { max-height: 280px; overflow-y: auto; padding: 4px 6px; }
.sitp__empty { padding: 14px 0; text-align: center; color: var(--text-muted); font-size: 12px; }
.sitp__row {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px;
  border: none; border-radius: 5px; background: transparent; cursor: pointer;
  font-family: inherit; text-align: left;
  &:hover { background: var(--bg-secondary); }
}
.sitp__row--wait { padding-right: 2px; }
.sitp__row--task { align-items: flex-start; }
.sitp__main {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
  padding: 2px 4px; border: none; background: transparent; cursor: pointer;
  font-family: inherit; text-align: left;
  &:hover .sitp__name { color: var(--primary, #3b82f6); }
}
.sitp__name {
  font-size: 12px; color: var(--text-primary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.sitp__sub { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.sitp__meta { white-space: nowrap; }
.sitp__tag {
  flex-shrink: 0; font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-secondary);
}
.sitp__tag--board { background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-color); }
.sitp__tag--p0 { background: var(--error); color: #fff; }
.sitp__tag--p1 { background: var(--warning); color: var(--text-primary); }
.sitp__tag--p2 { background: var(--primary, #3b82f6); color: #fff; }
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
.sitp__acts { display: inline-flex; gap: 4px; flex-shrink: 0; }
.sitp__act {
  height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary); font-size: 11px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.sitp__act--ok { color: var(--success); border-color: var(--success); }
.sitp__act--no { color: var(--error); border-color: var(--error); }
.sitp__search { position: relative; padding: 4px 4px 6px; }
.sitp__search-input {
  width: 100%; height: 24px; padding: 0 22px 0 8px;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-secondary); color: var(--text-primary);
  font-size: 11px; font-family: inherit; outline: none;
  &::placeholder { color: var(--text-muted); }
  &:focus { border-color: var(--primary, #3b82f6); }
}
.sitp__search-clear {
  position: absolute; right: 10px; top: 9px; cursor: pointer;
  color: var(--text-muted); font-size: 12px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.sitp__acct { border-bottom: 1px dashed var(--border-color); padding: 2px 0; &:last-of-type { border-bottom: none; } }
.sitp__acct-head {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 6px;
  border: none; border-radius: 5px; background: transparent; cursor: pointer;
  font-family: inherit; text-align: left;
  &:hover { background: var(--bg-secondary); }
}
.sitp__caret { font-size: 9px; color: var(--text-muted); flex-shrink: 0; }
.sitp__acct-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.sitp__acct-sub { font-size: 10px; color: var(--text-muted); margin-left: auto; white-space: nowrap; }
.sitp__acct-body { padding: 0 6px 4px 16px; }
.sitp__node {
  display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px;
  font-size: 11px; color: var(--text-primary);
}
.sitp__node--btn {
  width: 100%; border: none; background: transparent; cursor: pointer; font-family: inherit;
  text-align: left;
  &:hover { background: var(--bg-secondary); }
  &.is-open { background: var(--bg-secondary); }
}
.sitp__node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sitp__node-sub { font-size: 10px; color: var(--text-muted); margin-left: auto; white-space: nowrap; }
.sitp__node-n { font-variant-numeric: tabular-nums; }
.sitp__profiles { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 4px 6px 18px; }
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
