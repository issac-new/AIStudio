<!-- overlay/custom/client/ia2/components/flow/FlowNavPanel.vue -->
<!-- v12 左栏 · 工作流导航（2026-09-19 统一视图）：会话∪循环统一列表——
     过滤 chips（全部/会话/循环）+ 过滤框（名称/任务号）+ 会话分组（团队标签
     📋N 挂接徽章 + 未读红点）+ 循环分组（阶段进度条 + 状态 meta）+ 栏底
     ＋新会话/＋新循环/⚙管理。选中即换中栏（唯一导航轴，无透镜无二级导航）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { filterStreams, LOOP_STAGE_ORDER, type FlowFilter, type FlowLoopRow, type FlowSessionRow, type StreamSelection } from '../../adapters/flow'

const props = defineProps<{
  sessions: FlowSessionRow[]
  loops: FlowLoopRow[]
  selection: StreamSelection | null
}>()

const emit = defineEmits<{
  (e: 'select', sel: StreamSelection): void
  (e: 'create-room', name: string): void
  (e: 'new-loop'): void
  (e: 'open-gov'): void
}>()

const { t } = useI18n()
const filterKind = ref<FlowFilter['kind']>('all')
const query = ref('')
/** 栏底内联新建房间（Electron renderer 无 window.prompt，就地输入） */
const createOpen = ref(false)
const createName = ref('')

const shownSessions = computed(() =>
  filterStreams(props.sessions, { kind: filterKind.value === 'loop' ? 'loop' : filterKind.value, query: query.value })
    .filter(r => r.kind !== 'loop') as FlowSessionRow[])
const shownLoops = computed(() =>
  filterStreams(props.loops, { kind: filterKind.value === 'session' ? 'session' : filterKind.value, query: query.value })
    .filter(r => r.kind === 'loop') as FlowLoopRow[])

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

    <div class="flow-nav__scroll">
      <div v-if="shownSessions.length" class="flow-nav__sec">
        <div class="flow-nav__sec-head" data-testid="flow-group-sessions">
          {{ t('ia2.flow.groupSessions') }}<span class="flow-nav__sec-n">{{ shownSessions.length }}</span>
        </div>
        <button
          v-for="s in shownSessions"
          :key="`${s.kind}:${s.id}`"
          type="button"
          class="flow-nav__row"
          :class="{ 'flow-nav__row--on': selection?.kind === s.kind && selection.id === s.id }"
          :data-testid="`flow-session-${s.id}`"
          @click="emit('select', { kind: s.kind, id: s.id })"
        >
          <span class="flow-nav__name">{{ s.name }}</span>
          <span v-if="s.teamTag" class="flow-nav__teamtag">{{ s.teamTag }}</span>
          <span v-if="s.taskIds.length" class="flow-nav__cnt" :title="s.taskIds.join(', ')">📋{{ s.taskIds.length }}</span>
          <span v-if="s.unread" class="flow-nav__unr">{{ s.unread > 99 ? '99+' : s.unread }}</span>
        </button>
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
        >
          <div class="flow-nav__loop-top">
            <span class="flow-nav__name">{{ l.name }}</span>
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
      <button v-if="!createOpen" type="button" class="flow-nav__chip" data-testid="flow-new-session" @click="createOpen = true">
        ＋ {{ t('ia2.flow.newSession') }}
      </button>
      <button type="button" class="flow-nav__chip" data-testid="flow-new-loop" @click="emit('new-loop')">
        ＋ {{ t('ia2.flow.newLoop') }}
      </button>
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
.flow-nav__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 8px; }
.flow-nav__sec { margin-bottom: 8px; }
.flow-nav__sec-head {
  display: flex; align-items: center; gap: 5px; padding: 4px 4px 3px;
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted);
}
.flow-nav__sec-n { min-width: 14px; height: 14px; padding: 0 4px; border-radius: 7px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 9px; display: inline-flex; align-items: center; justify-content: center; }
.flow-nav__row {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 28px; padding: 0 8px;
  border: none; border-radius: 6px; background: transparent; color: var(--text-secondary);
  font-size: 12px; cursor: pointer; text-align: left;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.flow-nav__row--on { background: var(--bg-secondary); color: var(--text-primary); font-weight: 600; }
.flow-nav__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-nav__teamtag {
  flex-shrink: 0; padding: 0 5px; height: 16px; border-radius: 8px;
  background: rgba(59, 130, 246, .08); color: var(--primary);
  font-size: 10px; display: inline-flex; align-items: center;
}
.flow-nav__cnt { flex-shrink: 0; font-size: 10px; color: var(--text-muted); }
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
  display: flex; align-items: center; gap: 4px; padding: 8px 12px;
  border-top: 1px solid var(--border-color);
}
</style>
