<!-- overlay/custom/client/ia2/components/flow/TaskDecisionPanel.vue -->
<!-- v12 右栏 · 任务与决策（2026-09-19 统一视图）：恒驻不随中栏选择消失。
     三节：等我（就地验收/打回/确认——动线④决策）· 挂接任务（改派/⌨/去处理）
     · 任务动态（混合事件流）。栏底 🕘 全部时间线。纯展示组件：数据经 props，
     动作经 emits，装配与真实 API 接线在 WorkbenchView。
     v13（2026-09-21 协作感知轮）：「等我」与「挂接任务」之间插入「需关注」
     节（multica 收件箱 severity 三档的 attention 档）——受阻任务/失败运行/
     停滞循环：不需点击但要人过目；行点击路由分派在 WorkbenchView。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DecisionRow } from '../../composables/useDecisionRows'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { FeedRow } from '../../adapters/flow'
import type { AttentionRow } from '../../adapters/activity'
import WaitQueue from './WaitQueue.vue'
import AttentionList from './AttentionList.vue'
import LinkedTaskList from './LinkedTaskList.vue'
import TaskFeed from './TaskFeed.vue'
import TaskFlowTimeline from './TaskFlowTimeline.vue'
import type { TaskFlowEvent } from '@/custom/matrix-chat/utils/task-flow'

const props = defineProps<{
  waitItems: DecisionRow[]
  linkedTasks: CockpitTask[]
  feedRows: FeedRow[]
  /** 需关注行（v13 attention 档；缺省为空——面板行为向后兼容） */
  attentionRows?: AttentionRow[]
  /** 挂接任务节头副注（当前对象名，如 release-pipeline / 应急指挥中心） */
  linkedContext?: string
  /** P4③ 当前群任务流转事件（缺省为空——不渲染该节，向后兼容） */
  flowEvents?: TaskFlowEvent[]
}>()

const emit = defineEmits<{
  (e: 'approve-task', taskId: string): void
  (e: 'reject-task', taskId: string): void
  (e: 'approve-run', item: DecisionRow): void
  (e: 'reject-run', item: DecisionRow): void
  (e: 'approve-fleet', item: DecisionRow): void
  (e: 'reject-fleet', item: DecisionRow): void
  (e: 'reassign', taskId: string): void
  (e: 'open-ide', taskId: string): void
  (e: 'handle-task', taskId: string): void
  (e: 'new-task'): void
  (e: 'all-timeline'): void
  (e: 'open-attention', row: AttentionRow): void
  (e: 'open-task', taskId: string): void
}>()

const { t } = useI18n()

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const feedWithTime = computed(() => props.feedRows.map(r => ({ ...r, time: fmtTime(r.ts) })))
</script>

<template>
  <div class="tdp" data-testid="tdp">
    <div class="tdp__head">{{ t('ia2.tdp.title') }}</div>

    <div class="tdp__scroll">
      <!-- UX 裁决 D（2026-10-03）：四分法并为二分——「待我处理」=等我+需关注，
           「上下文」=挂接任务+任务流转+任务动态。子列表 testid 原样保留。 -->
      <section class="tdp__sec">
        <div class="tdp__sec-head">
          <span class="tdp__sec-name">
            <svg class="tdp__sec-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {{ t('ia2.tdp.pendingTitle') }}<span v-if="waitItems.length + (attentionRows?.length ?? 0)" class="tdp__n">{{ waitItems.length + (attentionRows?.length ?? 0) }}</span>
          </span>
          <button type="button" class="tdp__link" data-testid="tdp-wait-all" @click="emit('all-timeline')">
            {{ t('ia2.tdp.all') }} ›
          </button>
        </div>
        <WaitQueue
          :items="waitItems"
          @approve-task="id => emit('approve-task', id)"
          @reject-task="id => emit('reject-task', id)"
          @approve-run="item => emit('approve-run', item)"
          @reject-run="item => emit('reject-run', item)"
          @approve-fleet="item => emit('approve-fleet', item)"
          @reject-fleet="item => emit('reject-fleet', item)"
        />
        <div v-if="attentionRows?.length" class="tdp__sub">
          <AttentionList :rows="attentionRows" @open="row => emit('open-attention', row)" />
        </div>
      </section>

      <section class="tdp__sec">
        <div class="tdp__sec-head">
          <span class="tdp__sec-name">
            <svg class="tdp__sec-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            {{ t('ia2.tdp.contextTitle') }}<template v-if="linkedContext"> · {{ linkedContext }}</template>
          </span>
          <button type="button" class="tdp__link" data-testid="tdp-new-task" @click="emit('new-task')">
            ＋ {{ t('ia2.tdp.newTask') }}
          </button>
        </div>
        <LinkedTaskList
          :tasks="linkedTasks"
          @reassign="id => emit('reassign', id)"
          @open-ide="id => emit('open-ide', id)"
          @handle-task="id => emit('handle-task', id)"
        />
        <!-- P4③ 当前群任务流转时间线（仅选中群且有任务型消息时渲染） -->
        <div v-if="flowEvents?.length" class="tdp__sub" data-testid="tdp-flow-sec">
          <TaskFlowTimeline :events="flowEvents" @open-task="id => emit('open-task', id)" />
        </div>
        <div class="tdp__sub">
          <TaskFeed :rows="feedWithTime" />
        </div>
      </section>
    </div>

    <div class="tdp__foot">
      <button type="button" class="tdp__chip" data-testid="tdp-timeline-all" @click="emit('all-timeline')">
        🕘 {{ t('ia2.tdp.allTimeline') }} ›
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tdp {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px;
}
.tdp__head { padding: 10px 12px 6px; font-weight: 700; color: var(--text-primary); }
.tdp__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px; }
.tdp__sec { margin-bottom: 10px; }
.tdp__sub { margin-top: 6px; }
/* 相邻子块发丝分隔（观察项 O-2）：挂接任务/任务流转/任务动态同节内的分组线 */
.tdp__sub + .tdp__sub { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
.tdp__sec-head {
  /* 分组头强化（观察项 O-2）：贴顶+同族淡底——滚动时组名常驻，节界一眼可辨；
     体量不变（同 10px 大写小标，仅加底与贴顶），守 D19 密度纪律 */
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 -4px; padding: 5px 6px;
  border-radius: 4px;
  background: var(--accent-bg, var(--hover-bg));
  font-size: 10px; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-muted);
}
.tdp__sec-name { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.tdp__sec-ico { flex-shrink: 0; opacity: .8; }
.tdp__n {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; margin-left: 5px; padding: 0 4px;
  border-radius: 8px; background: var(--error); color: var(--text-on-accent);
  font-size: 9px; font-weight: 700; text-transform: none;
}
.tdp__n--warn { background: var(--warning); }
.tdp__link { border: none; background: none; color: var(--text-muted); font-size: 10px; cursor: pointer; &:hover { color: var(--primary); } }
.tdp__foot {
  display: flex; align-items: center; padding: 8px 12px;
  border-top: 1px solid var(--border-color);
}
.tdp__chip {
  height: 22px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
