<!-- overlay/custom/client/ia2/components/flow/FlowNavPanel.vue -->
<!-- v12 左栏 · 工作流导航（2026-09-19 统一视图）：过滤 chips（全部/会话/循环）
     + 过滤框（名称/任务号）+ 循环分组（阶段进度条 + 状态 meta）+ 栏底动作。
     v12.3 R4a（2026-09-20 用户裁定）：会话区按类型聚类三小节（房间/群聊/会话，
     群聊随 R4b 三聊天合一入列）；📋N 挂接徽章点击就地展开任务簇（任务 chip
     点击→看板预选）；行双击 → IDE 工作台编码动线（携带首个挂接任务，动线⑤）。
     单击语义不变：选中即换中栏（唯一导航轴，无透镜无二级导航）。
     v13（2026-09-21 协作感知轮）：循环行加运行中活动脉冲（multica「agent 活动
     指示器」的循环面投影）——loopActivity[loopId].running>0 时行右上 ●N 呼吸点，
     title 提示运行数；awaiting 档已有 awaitingYou 表达，不重复投影。
     v14（2026-09-29 统一聊天轮，用户裁定「不再区分」）：房间/群聊/会话三小节
     并为单一「聊天」列表——按最近活动降序混排，行首 kind 小图标区分类型，
     未读/消歧/任务簇/双击语义原样保留；群聊行 hover ✕ 删除（补偿被隐藏的
     画布内侧栏管理入口）；栏底「＋新聊天」三分型菜单（agent 单聊/agent 群聊/
     matrix 房间），matrix 房间沿用内联输入。正本 docs/comm-collab-v14-unified-chat.md §4。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { filterStreams, LOOP_STAGE_ORDER, sortFlowRows, type FlowFilter, type FlowLoopRow, type FlowSessionRow, type FlowSortMode, type StreamSelection } from '../../adapters/flow'
import { duplicateNames as collectDuplicateNames, shortRoomId } from '@/custom/matrix-chat/utils/room-disambig'
import { useMsgSurfaceText } from '../../i18n-msg-surface'
import type { LoopActivity } from '../../adapters/activity'
import type { AgentRosterRow } from '../../adapters/agents'
import InboxNavEntry from '../InboxNavEntry.vue'
import GovernanceNavEntry from '../GovernanceNavEntry.vue'
import AccountsNavEntry from '../AccountsNavEntry.vue'
import IaOverviewEntry from '../IaOverviewEntry.vue'

const props = defineProps<{
  sessions: FlowSessionRow[]
  loops: FlowLoopRow[]
  selection: StreamSelection | null
  /** 循环活动索引（v13：runs 聚合的运行中/待确认计数；可选向后兼容） */
  loopActivity?: Record<string, LoopActivity>
  /** R7-C agent 名册（multica roster：在线/忙闲/在跑；可选向后兼容） */
  agents?: AgentRosterRow[]
}>()

const emit = defineEmits<{
  (e: 'select', sel: StreamSelection): void
  (e: 'create-room', name: string): void
  (e: 'new-loop'): void
  (e: 'open-gov'): void
  /** 任务簇 chip 点击 → 看板预选（R4a） */
  (e: 'open-task', taskId: string): void
  /** 行/任务 chip 双击 → IDE 工作台（taskId 空则裸进，R4a 动线⑤） */
  (e: 'jump-ide', taskId: string | null): void
  /** v14：「＋新聊天」→ agent 单聊（/app/s/chat 新会话态） */
  (e: 'new-chat'): void
  /** v14：「＋新聊天」→ agent 群聊（WorkbenchView 开 CreateRoomForm 抽屉） */
  (e: 'create-group'): void
  /** v14：群聊行 hover ✕ → store.deleteGroup（补偿被隐藏侧栏的删除入口） */
  (e: 'delete-group', roomId: string): void
}>()

const { t } = useI18n()
const tx = useMsgSurfaceText()
/** 排序档 hover 文案（msg-surface 本地字典，漂移期模式） */
function sortTitle(m: FlowSortMode): string {
  return m === 'recent' ? tx.value.sortRecent : m === 'unread' ? tx.value.sortUnread : tx.value.sortAlpha
}
const filterKind = ref<FlowFilter['kind']>('all')
const query = ref('')
/** 栏底内联新建房间（Electron renderer 无 window.prompt，就地输入） */
const createOpen = ref(false)
const createName = ref('')
/** v14「＋新聊天」三分型菜单开合 */
const newMenuOpen = ref(false)
/** 任务簇展开态（会话行键 → 展开；徽章点击切换，不触发行选中） */
const openCluster = ref<string | null>(null)

const shownSessions = computed(() =>
  filterStreams(props.sessions, { kind: filterKind.value === 'loop' ? 'loop' : filterKind.value, query: query.value })
    .filter(r => r.kind !== 'loop') as FlowSessionRow[])
const shownLoops = computed(() =>
  filterStreams(props.loops, { kind: filterKind.value === 'session' ? 'session' : filterKind.value, query: query.value })
    .filter(r => r.kind === 'loop') as FlowLoopRow[])

/** 同名消歧（推演审计二轮 U5b）：工作台房间列与 matrix-chat 列是两套渲染，
 *  多轮推演同名群在这套列表同样无法分辨——同名行尾缀短 ID（与 utils/room-disambig 同源）。 */
const dupNames = computed(() =>
  collectDuplicateNames((props.sessions as Array<{ name: string }>).map(r => r.name)))

/** v14 单一「聊天」列表：三类混排按 lastActivityAt 降序（无活动时间者沉底，
 *  sort 稳定保序）。kind 图标替代旧三小节分节（R4a 聚类退役）。
 *  2026-10-01 吸收二期·房间列表卫生：排序器三档（活跃/未读/名称，
 *  element-web skip-list sorters 范式），选择持久化 localStorage。 */
const SORT_MODE_KEY = 'ia2.flow.sortMode'
const sortMode = ref<FlowSortMode>(
  (['recent', 'unread', 'alpha'] as const).find(m => m === localStorage.getItem(SORT_MODE_KEY)) ?? 'recent',
)
watch(sortMode, (m) => localStorage.setItem(SORT_MODE_KEY, m))
const chatRows = computed<FlowSessionRow[]>(() => {
  const base = [...shownSessions.value].sort((a, b) => {
    const at = a.lastActivityAt ?? 0
    const bt = b.lastActivityAt ?? 0
    return bt - at
  })
  return sortMode.value === 'recent' ? base : sortFlowRows(base, sortMode.value)
})

const KIND_ICONS: Record<FlowSessionRow['kind'], string> = { room: '#', group: '👥', chat: '💬' }
const KIND_LABEL_KEYS: Record<FlowSessionRow['kind'], string> = {
  room: 'ia2.flow.clusterRooms',
  group: 'ia2.flow.clusterGroups',
  chat: 'ia2.flow.clusterChats',
}

function toggleCluster(rowKey: string): void {
  openCluster.value = openCluster.value === rowKey ? null : rowKey
}

/** 循环行活动摘要（v13：无索引/无计数时返回 null，行不渲染脉冲） */
function activityOf(l: FlowLoopRow): LoopActivity | null {
  return props.loopActivity?.[l.id] ?? null
}

/** 阶段进度条分段调：已完成绿 / 当前调（run蓝·err红） / 未至灰 */
function stageTones(l: FlowLoopRow): string[] {
  return Array.from({ length: l.stageTotal }, (_, i) =>
    i < l.stageIndex ? 'done' : i === l.stageIndex ? l.stageTone : 'todo')
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨'

function submitCreateRoom(): void {
  const name = createName.value.trim()
  if (!name) return
  emit('create-room', name)
  createName.value = ''
  createOpen.value = false
}
</script>

<template>
  <div class="flow-nav" data-testid="flow-nav">
    <div class="flow-nav__head">{{ t('ia2.flow.title') }}</div>
    <!-- P5 驾驶舱概览入口（#/app/overview 三卡 landing） -->
    <IaOverviewEntry />
    <!-- P1 审批收件箱入口（待审计数徽标；自含轮询） -->
    <InboxNavEntry />
    <!-- 治理中心入口（六闸工件+待裁决徽标；自含轮询） -->
    <GovernanceNavEntry />
    <AccountsNavEntry />

    <div class="flow-nav__filters" data-testid="flow-filters">
      <button
        v-for="fk in (['all', 'session', 'loop'] as const)"
        :key="fk"
        type="button"
        class="flow-nav__chip"
        :class="{ 'flow-nav__chip--on': filterKind === fk }"
        :data-testid="`flow-filter-${fk}`"
        @click="filterKind = fk"
      >{{ t(`ia2.flow.filter.${fk}`) }}</button>
    </div>
    <input
      v-model="query"
      class="flow-nav__search"
      type="text"
      data-testid="flow-search"
      :placeholder="t('ia2.flow.searchPlaceholder')"
    >
    <!-- 排序器（房间列表卫生）：活跃/未读/名称三档，选择持久化 -->
    <div class="flow-nav__sorts" data-testid="flow-sorts">
      <button
        v-for="sm in (['recent', 'unread', 'alpha'] as const)"
        :key="sm"
        type="button"
        class="flow-nav__sort"
        :class="{ 'flow-nav__sort--on': sortMode === sm }"
        :data-testid="`flow-sort-${sm}`"
        :title="sortTitle(sm)"
        @click="sortMode = sm"
      >{{ sm === 'recent' ? '🕐' : sm === 'unread' ? '🔴' : '🔤' }}</button>
    </div>

    <div class="flow-nav__scroll">
      <!-- v14 单一「聊天」列表（三小节退役；行 testid 沿用 flow-session-*） -->
      <div v-show="chatRows.length" class="flow-nav__sec" data-testid="flow-cluster-chat-all">
        <div class="flow-nav__sec-head" data-testid="flow-group-chats">
          {{ t('ia2.flow.chatSection') }}<span class="flow-nav__sec-n">{{ chatRows.length }}</span>
        </div>
        <template v-for="s in chatRows" :key="`${s.kind}:${s.id}`">
          <button
            type="button"
            class="flow-nav__row"
            :class="{ 'flow-nav__row--on': selection?.kind === s.kind && selection.id === s.id }"
            :data-testid="`flow-session-${s.id}`"
            :data-kind="s.kind"
            @click="emit('select', { kind: s.kind, id: s.id })"
            @dblclick="emit('jump-ide', s.taskIds[0] ?? null)"
          >
            <span
              class="flow-nav__kind"
              :class="`flow-nav__kind--${s.kind}`"
              :title="t(KIND_LABEL_KEYS[s.kind])"
            >{{ KIND_ICONS[s.kind] }}</span>
            <span class="flow-nav__name">{{ s.name }}</span>
            <span
              v-if="dupNames.has(s.name)"
              class="flow-nav__suffix"
              :title="`${s.id}${s.lastActivityAt ? ' · ' + new Date(s.lastActivityAt).toLocaleString() : ''}`"
              data-testid="flow-dup-suffix"
            >#{{ shortRoomId(s.id) }}</span>
            <span v-if="s.teamTag" class="flow-nav__teamtag">{{ s.teamTag }}</span>
            <span
              v-if="s.taskIds.length"
              class="flow-nav__cnt flow-nav__cnt--btn"
              :title="s.taskIds.join(', ')"
              @click.stop="toggleCluster(`${s.kind}:${s.id}`)"
            >📋{{ s.taskIds.length }}{{ openCluster === `${s.kind}:${s.id}` ? ' ▴' : ' ▾' }}</span>
            <span v-if="s.unread" class="flow-nav__unr">{{ s.unread > 99 ? '99+' : s.unread }}</span>
            <span
              v-if="s.kind === 'group'"
              class="flow-nav__del"
              :data-testid="`flow-del-group-${s.id}`"
              :title="t('ia2.flow.deleteGroup')"
              @click.stop="emit('delete-group', s.id)"
            >✕</span>
          </button>
          <!-- 任务簇（R4a）：挂接任务 chip 就地展开；chip 点击→看板预选，双击→IDE -->
          <div
            v-if="openCluster === `${s.kind}:${s.id}`"
            class="flow-nav__cluster" :data-testid="`flow-cluster-tasks-${s.id}`"
          >
            <button
              v-for="tid in s.taskIds" :key="tid" type="button" class="flow-nav__task"
              :data-testid="`flow-task-${tid}`"
              @click="emit('open-task', tid)"
              @dblclick.stop="emit('jump-ide', tid)"
            >#{{ tid.slice(0, 8) }}</button>
          </div>
        </template>
      </div>

      <div v-if="shownLoops.length" class="flow-nav__sec">
        <div class="flow-nav__sec-head" data-testid="flow-group-loops">
          {{ t('ia2.flow.groupLoops') }}<span class="flow-nav__sec-n">{{ shownLoops.length }}</span>
        </div>
        <button
          v-for="l in shownLoops"
          :key="l.id"
          type="button"
          class="flow-nav__loop"
          :class="{
            'flow-nav__row--on': selection?.kind === 'loop' && selection.id === l.id,
            'flow-nav__loop--err': l.stageTone === 'err',
          }"
          :data-testid="`flow-loop-${l.id}`"
          @click="emit('select', { kind: 'loop', id: l.id })"
          @dblclick="emit('jump-ide', null)"
        >
          <div class="flow-nav__loop-top">
            <span class="flow-nav__name">{{ l.name }}</span>
            <span
              v-if="activityOf(l)?.running"
              class="flow-nav__pulse" :data-testid="`flow-pulse-${l.id}`"
              :title="t('ia2.act.running', { n: activityOf(l)!.running })"
            >●{{ activityOf(l)!.running }}</span>
            <span class="flow-nav__pct">{{ l.progressPct }}%</span>
          </div>
          <div class="flow-nav__stagebar">
            <i
              v-for="(tone, i) in stageTones(l)"
              :key="i"
              class="flow-nav__seg"
              :class="`flow-nav__seg--${tone}`"
            />
          </div>
          <div class="flow-nav__loop-meta">
            <span class="flow-nav__stage-idx">{{ CIRCLED[l.stageIndex] ?? l.stageIndex + 1 }}</span>
            <span class="flow-nav__stage-name">{{ t(`ia2.loop.stage.${LOOP_STAGE_ORDER[l.stageIndex]}`) }}</span>
            <span class="flow-nav__dot">·</span>
            <span
              class="flow-nav__status"
              :class="{ 'flow-nav__status--warn': l.awaitingYou, 'flow-nav__status--err': l.blocked }"
            >{{ t(`ia2.loop.status.${l.statusKey}`) }}</span>
          </div>
        </button>
      </div>

      <!-- R7-C agent 名册（multica roster：在线/忙闲/在跑） -->
      <div v-if="props.agents && props.agents.length" class="flow-nav__sec" data-testid="flow-agents-sec">
        <div class="flow-nav__sec-head" data-testid="flow-group-agents">
          {{ t('ia2.flow.groupAgents') }}<span class="flow-nav__sec-n">{{ props.agents.length }}</span>
        </div>
        <div
          v-for="a in props.agents"
          :key="a.name"
          class="flow-nav__agent"
          :class="`flow-nav__agent--${a.busyState}`"
          :data-testid="`flow-agent-${a.name}`"
        >
          <span class="flow-nav__agent-dot" :class="`is-${a.busyState}`" />
          <span class="flow-nav__agent-name">{{ a.name }}</span>
          <span v-if="a.activeTask" class="flow-nav__agent-task" :title="a.activeTask">{{ a.activeTask }}</span>
          <span v-else-if="a.sessionCount" class="flow-nav__agent-sess" :title="t('ia2.agents.sessions', { n: a.sessionCount })">◉{{ a.sessionCount }}</span>
        </div>
      </div>

      <div v-if="!shownSessions.length && !shownLoops.length" class="flow-nav__empty" data-testid="flow-empty">
        {{ t('ia2.flow.empty') }}
      </div>
    </div>

    <div v-if="createOpen" class="flow-nav__create">
      <input
        v-model="createName"
        type="text"
        class="flow-nav__create-input"
        data-testid="flow-create-input"
        :placeholder="t('ia2.flow.createPlaceholder')"
        @keyup.enter="submitCreateRoom"
      >
      <button type="button" class="flow-nav__chip flow-nav__chip--on" data-testid="flow-create-ok" @click="submitCreateRoom">
        {{ t('ia2.flow.createOk') }}
      </button>
    </div>

    <div class="flow-nav__foot">
      <!-- v14「＋新聊天」三分型：agent 单聊 / agent 群聊 / matrix 房间（内联输入） -->
      <div v-if="newMenuOpen && !createOpen" class="flow-nav__newmenu" data-testid="flow-new-menu">
        <button type="button" class="flow-nav__newmenu-item" data-testid="flow-new-chat-agent" @click="newMenuOpen = false; emit('new-chat')">
          💬 {{ t('ia2.flow.newAgentChat') }}
        </button>
        <button type="button" class="flow-nav__newmenu-item" data-testid="flow-new-chat-group" @click="newMenuOpen = false; emit('create-group')">
          👥 {{ t('ia2.flow.newGroupChat') }}
        </button>
        <button type="button" class="flow-nav__newmenu-item" data-testid="flow-new-chat-room" @click="newMenuOpen = false; createOpen = true">
          # {{ t('ia2.flow.newMatrixRoom') }}
        </button>
      </div>
      <button v-if="!createOpen" type="button" class="flow-nav__chip" data-testid="flow-new-session" @click="newMenuOpen = !newMenuOpen">
        ＋ {{ t('ia2.flow.newChat') }}
      </button>
      <!-- S5（补遗⑤）：/app/eng 编排页退役——＋新循环入口随之摘除（守门 workbench-flow
           断言 flow-new-loop 不存在；循环创建走脚本/运行中心，恢复路由即回生）。 -->

      <button type="button" class="flow-nav__chip flow-nav__chip--gov" data-testid="flow-gov" @click="emit('open-gov')">
        ⚙ {{ t('ia2.flow.manage') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.flow-nav {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px;
}
.flow-nav__head { padding: 10px 12px 6px; font-weight: 700; font-size: 12px; color: var(--text-primary); }
.flow-nav__filters { display: flex; gap: 4px; padding: 0 12px 6px; }
.flow-nav__chip {
  height: 22px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.flow-nav__chip--on { border-color: var(--primary); color: var(--primary); font-weight: 600; }
.flow-nav__chip--gov { margin-left: auto; }
.flow-nav__search {
  height: 24px; margin: 0 12px 6px; padding: 0 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-secondary); color: var(--text-primary); font-size: 11px; outline: none;
  &:focus { border-color: var(--primary); }
}
.flow-nav__sorts { display: flex; gap: 4px; margin: 0 12px 6px; }
.flow-nav__sort {
  height: 20px; padding: 0 7px; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.flow-nav__sort--on { border-color: var(--primary); background: var(--bg-secondary); }
.flow-nav__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 8px; }
.flow-nav__sec { margin-bottom: 8px; }
.flow-nav__sec-head {
  display: flex; align-items: center; gap: 5px; padding: 4px 4px 3px;
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted);
}
.flow-nav__sec-n { min-width: 14px; height: 14px; padding: 0 4px; border-radius: 7px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 9px; display: inline-flex; align-items: center; justify-content: center; }

/* R7-C agent 名册 */
.flow-nav__agent {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 2px 6px; border-radius: 5px; font-size: 11px; color: var(--text-primary);
}
.flow-nav__agent-dot {
  flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
  &.is-busy { background: #4cc9f0; }
  &.is-online { background: var(--success-color, #98c379); }
  &.is-idle { background: var(--text-muted, #9aa0aa); }
  &.is-offline { background: #e06c75; }
}
.flow-nav__agent-name { flex-shrink: 0; font-family: ui-monospace, monospace; font-size: 10px; }
.flow-nav__agent-task {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 10px; color: var(--text-muted);
}
.flow-nav__agent-sess { flex-shrink: 0; font-size: 9px; color: var(--text-muted); }
.flow-nav__row {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 28px; padding: 0 8px;
  border: none; border-radius: 6px; background: transparent; color: var(--text-secondary);
  font-size: 12px; cursor: pointer; text-align: left;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.flow-nav__row--on { background: var(--bg-secondary); color: var(--text-primary); font-weight: 600; }
.flow-nav__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-nav__suffix {
  flex-shrink: 0; font-size: 10.5px; color: var(--text-muted, #878c99);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .75;
}
.flow-nav__teamtag {
  flex-shrink: 0; padding: 0 5px; height: 16px; border-radius: 8px;
  background: rgba(59, 130, 246, .08); color: var(--primary);
  font-size: 10px; display: inline-flex; align-items: center;
}
.flow-nav__cnt { flex-shrink: 0; font-size: 10px; color: var(--text-muted); }
.flow-nav__cnt--btn { cursor: pointer; border-radius: 6px; padding: 1px 4px; &:hover { background: var(--bg-secondary); color: var(--text-primary); } }
.flow-nav__cluster { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 8px 6px 20px; }
.flow-nav__task {
  height: 18px; padding: 0 7px; border: 1px solid var(--border-color); border-radius: 9px;
  background: var(--bg-secondary); color: var(--text-secondary); font-size: 10px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--primary); border-color: var(--primary); }
}
.flow-nav__unr {
  flex-shrink: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--error); color: #fff; font-size: 9px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.flow-nav__loop {
  display: block; width: 100%; margin: 2px 0; padding: 7px 8px;
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-secondary); cursor: pointer; text-align: left;
  &:hover { border-color: var(--text-muted); }
}
.flow-nav__row--on.flow-nav__loop { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.flow-nav__loop--err { border-color: rgba(198, 40, 40, .45); }
.flow-nav__loop-top { display: flex; align-items: center; gap: 6px; }
/* v13 运行脉冲：呼吸动画的存在感点（仅 running>0 渲染） */
.flow-nav__pulse {
  flex-shrink: 0; padding: 0 5px; height: 15px; border-radius: 8px;
  background: rgba(34, 197, 94, .12); color: var(--success);
  font-size: 9px; font-weight: 700; font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; gap: 2px;
  animation: flow-nav-breath 2s ease-in-out infinite;
}
@keyframes flow-nav-breath {
  0%, 100% { opacity: 1; }
  50% { opacity: .45; }
}
.flow-nav__pct { flex-shrink: 0; font-size: 10px; font-variant-numeric: tabular-nums; color: var(--text-muted); }
.flow-nav__stagebar { display: flex; gap: 2px; margin: 5px 0 4px; }
.flow-nav__seg { flex: 1; height: 3px; border-radius: 2px; background: var(--border-color); }
.flow-nav__seg--done { background: var(--success); }
.flow-nav__seg--run { background: var(--primary); }
.flow-nav__seg--err { background: var(--error); }
.flow-nav__loop-meta { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-muted); }
.flow-nav__stage-idx { color: var(--text-secondary); }
.flow-nav__status--warn { color: var(--warning); font-weight: 600; }
.flow-nav__status--err { color: var(--error); font-weight: 600; }
.flow-nav__empty { padding: 16px 10px; font-size: 11px; color: var(--text-muted); text-align: center; }
.flow-nav__create { display: flex; gap: 4px; padding: 0 12px 6px; }
.flow-nav__create-input {
  flex: 1; min-width: 0; height: 24px; padding: 0 8px;
  border: 1px solid var(--primary); border-radius: 6px;
  background: var(--bg-secondary); color: var(--text-primary); font-size: 11px; outline: none;
}
.flow-nav__foot {
  position: relative;
  display: flex; align-items: center; gap: 4px; padding: 8px 12px;
  border-top: 1px solid var(--border-color);
}
/* v14「＋新聊天」三分型菜单：foot 上方浮出 */
.flow-nav__newmenu {
  position: absolute; bottom: calc(100% + 4px); left: 8px; z-index: 30;
  display: flex; flex-direction: column; gap: 2px; min-width: 148px;
  padding: 4px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card); box-shadow: 0 6px 18px rgba(0, 0, 0, .18);
}
.flow-nav__newmenu-item {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 26px; padding: 0 8px;
  border: none; border-radius: 6px; background: transparent; color: var(--text-secondary);
  font-size: 11px; cursor: pointer; text-align: left; white-space: nowrap;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
/* v14 单一聊天列表：kind 图标 + 群聊行 hover 删除 */
.flow-nav__kind {
  flex-shrink: 0; width: 14px; text-align: center;
  font-size: 10px; color: var(--text-muted);
  &.flow-nav__kind--room { color: var(--primary); }
  &.flow-nav__kind--group { font-size: 9px; }
}
.flow-nav__del {
  display: none; flex-shrink: 0; width: 16px; height: 16px;
  align-items: center; justify-content: center;
  border-radius: 4px; color: var(--text-muted); font-size: 10px; cursor: pointer;
  &:hover { color: var(--error); background: color-mix(in srgb, var(--error) 12%, transparent); }
}
.flow-nav__row:hover .flow-nav__del { display: inline-flex; }
</style>
