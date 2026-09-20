<script setup lang="ts">
// IdePlanFloat — 任务计划浮窗：当前会话最新 TaskPlanSnapshot（对标 zcode
// 浮窗 todo 总览；消息流内联 TaskPlanCard 保留为历史轮次记录）。
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
</script>

<template>
  <IdeFloatPanel :title="t('ide.float.planTitle')" testid="ide-float-plan" @close="ide.toggleFloat('plan')">
    <TaskPlanCard v-if="latestPlan" :plan="latestPlan" />
    <p v-else class="ide-float__empty" data-testid="ide-float-plan-empty">{{ t('ide.float.planEmpty') }}</p>
  </IdeFloatPanel>
</template>
