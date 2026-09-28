<script setup lang="ts">
// IdePlanFloat — 任务计划浮窗：当前会话最新 TaskPlanSnapshot（对标 zcode
// 浮窗 todo 总览；消息流内联 TaskPlanCard 保留为历史轮次记录）。
// R3 计划工件评审化（antigravity 工件评审 + codex plan_implementation 三选一门语义）：
// 进度条（completed/total）+ 评审动作行（按提示词注入引导 agent 继续/清场/只留档）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import type { TaskPlanSnapshot } from '@/utils/task-plan'
import TaskPlanCard from '@/components/hermes/chat/TaskPlanCard.vue'
import IdeFloatPanel from './IdeFloatPanel.vue'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const ide = useIdeStore()
const chat = useChatStore()

/** 消息流末尾向前取最近一次计划快照（轮次定位由上游完成，此处只取最新） */
const latestPlan = computed<TaskPlanSnapshot | null>(() => {
  const messages = chat.activeSession?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const plan = messages[i].taskPlan
    if (plan) return plan
  }
  return null
})

// ── R3 评审化：进度与三选一门 ──
const progress = computed(() => {
  const plan = latestPlan.value
  if (!plan) return { done: 0, total: 0, pct: 0 }
  const total = plan.plan.length
  const done = plan.plan.filter((s) => s.status === 'completed').length
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
})

// 三选一门（codex plan_implementation：实现/清上下文实现/仅留档）：
// 只发引导提示词，是否执行由 agent 回合 + 审批门裁决（与 M3 同范式）。
const PLAN_ACTION_PROMPTS: Record<'implement' | 'fresh' | 'leave', string> = {
  implement: '请继续执行上述计划：按未完成步骤推进，保持当前会话上下文。',
  fresh: '请基于上述计划重新开始执行：忽略本轮中间产物，从头按步骤完整实施，先简述你将如何清理或避开既有半成品。',
  leave: '上述计划先不执行了，仅留档；不需要任何动作，确认收到即可。',
}

function planAction(kind: 'implement' | 'fresh' | 'leave'): void {
  void chat.sendMessage(PLAN_ACTION_PROMPTS[kind])
  ide.setChatFocus()
}
</script>

<template>
  <IdeFloatPanel :title="t('ide.float.planTitle')" testid="ide-float-plan" @close="ide.toggleFloat('plan')">
    <template v-if="latestPlan">
      <!-- R3 计划工件进度头 -->
      <div class="ide-plan-progress" data-testid="ide-plan-progress">
        <span class="ide-plan-progress__bar">
          <span class="ide-plan-progress__fill" :style="{ width: `${progress.pct}%` }" />
        </span>
        <span class="ide-plan-progress__text">{{ progress.done }}/{{ progress.total }}</span>
      </div>
      <TaskPlanCard :plan="latestPlan" />
      <!-- R3 三选一门（评审动作行） -->
      <div class="ide-plan-actions" data-testid="ide-plan-actions">
        <button type="button" class="ide-plan-action is-primary" data-testid="ide-plan-act-implement" @click="planAction('implement')">
          {{ t('ide.plan.actImplement') }}
        </button>
        <button type="button" class="ide-plan-action" data-testid="ide-plan-act-fresh" @click="planAction('fresh')">
          {{ t('ide.plan.actFresh') }}
        </button>
        <button type="button" class="ide-plan-action" data-testid="ide-plan-act-leave" @click="planAction('leave')">
          {{ t('ide.plan.actLeave') }}
        </button>
      </div>
    </template>
    <p v-else class="ide-float__empty" data-testid="ide-float-plan-empty">{{ t('ide.float.planEmpty') }}</p>
  </IdeFloatPanel>
</template>

<style scoped lang="scss">
.ide-plan-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ide-plan-progress__bar {
  flex: 1;
  height: 5px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 22%, transparent);
}

.ide-plan-progress__fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--success-color, #98c379);
  transition: width 0.3s ease;
}

.ide-plan-progress__text {
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, #9aa0aa);
}

.ide-plan-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #26292f);
}

.ide-plan-action {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 4px;
  background: none;
  color: var(--text-secondary, #b0b5be);
  cursor: pointer;

  &:hover { border-color: #61afef; color: #61afef; }

  &.is-primary {
    background: #61afef22;
    border-color: #61afef66;
    color: #61afef;

    &:hover { background: #61afef33; }
  }
}
</style>
