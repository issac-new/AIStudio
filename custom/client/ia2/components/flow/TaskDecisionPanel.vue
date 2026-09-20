<!-- overlay/custom/client/ia2/components/flow/TaskDecisionPanel.vue -->
<!-- v12 右栏 · 任务与决策（2026-09-19 统一视图）：恒驻不随中栏选择消失。
     三节：等我（就地验收/打回/确认——动线④决策）· 挂接任务（改派/⌨/去处理）
     · 任务动态（混合事件流）。栏底 🕘 全部时间线。纯展示组件：数据经 props，
     动作经 emits，装配与真实 API 接线在 WorkbenchView。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DecisionRow } from '../../composables/useDecisionRows'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { FeedRow } from '../../adapters/flow'
import WaitQueue from './WaitQueue.vue'
import LinkedTaskList from './LinkedTaskList.vue'
import TaskFeed from './TaskFeed.vue'

const props = defineProps<{
  waitItems: DecisionRow[]
  linkedTasks: CockpitTask[]
  feedRows: FeedRow[]
  /** 挂接任务节头副注（当前对象名，如 release-pipeline / 应急指挥中心） */
  linkedContext?: string
}>()

const emit = defineEmits<{
  (e: 'approve-task', taskId: string): void
  (e: 'reject-task', taskId: string): void
  (e: 'approve-run', item: DecisionRow): void
  (e: 'approve-fleet', item: DecisionRow): void
  (e: 'reassign', taskId: string): void
  (e: 'open-ide', taskId: string): void
  (e: 'handle-task', taskId: string): void
  (e: 'new-task'): void
  (e: 'all-timeline'): void
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
      <section class="tdp__sec">
        <div class="tdp__sec-head">
          <span>{{ t('ia2.tdp.waiting') }}<span v-if="waitItems.length" class="tdp__n">{{ waitItems.length }}</span></span>
          <button type="button" class="tdp__link" data-testid="tdp-wait-all" @click="emit('all-timeline')">
            {{ t('ia2.tdp.all') }} ›
          </button>
        </div>
        <WaitQueue
          :items="waitItems"
          @approve-task="id => emit('approve-task', id)"
          @reject-task="id => emit('reject-task', id)"
          @approve-run="item => emit('approve-run', item)"
          @approve-fleet="item => emit('approve-fleet', item)"
        />
      </section>

      <section class="tdp__sec">
        <div class="tdp__sec-head">
          <span>
            {{ t('ia2.tdp.linked') }}<template v-if="linkedContext"> · {{ linkedContext }}</template>
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
      </section>

      <section class="tdp__sec">
        <div class="tdp__sec-head">{{ t('ia2.tdp.feed') }}</div>
        <TaskFeed :rows="feedWithTime" />
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
.tdp__sec-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 4px 4px; font-size: 10px; text-transform: uppercase;
  letter-spacing: .04em; color: var(--text-muted);
}
.tdp__n {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; margin-left: 5px; padding: 0 4px;
  border-radius: 8px; background: var(--error); color: #fff;
  font-size: 9px; font-weight: 700; text-transform: none;
}
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
