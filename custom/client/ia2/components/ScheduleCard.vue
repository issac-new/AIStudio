<!-- overlay/custom/client/ia2/components/ScheduleCard.vue -->
<!-- 今日日程卡：cockpit 待办的今日只读摘要（今日条数 + 下一条闹钟）。
     点击 emit open → 父级经 cockpit store 单例 openSchedule() 打开原弹窗
     （CockpitScheduleModal，弹窗本体由父级按 scheduleOpen 挂载，零复制）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { localDateStr, type TodayPlanTodoInput } from '../adapters/overview'

const props = withDefaults(defineProps<{
  todos: TodayPlanTodoInput[]
  /** 今日判定与"下一条"比较的锚（epoch ms）；缺省取当前时刻 */
  nowMs?: number
}>(), { nowMs: () => Date.now() })

const emit = defineEmits<{ (e: 'open'): void }>()

const { t } = useI18n()

const todayTodos = computed(() => {
  const today = localDateStr(new Date(props.nowMs))
  return props.todos.filter(td => td.date === today)
})

/** 下一条闹钟：今日待办中 remindAt ≥ 锚的最小值 */
const nextAlarm = computed(() => {
  let best: { at: number; title: string } | null = null
  for (const td of todayTodos.value) {
    if (typeof td.remindAt !== 'number' || !Number.isFinite(td.remindAt)) continue
    if (td.remindAt < props.nowMs) continue
    if (best === null || td.remindAt < best.at) best = { at: td.remindAt, title: td.title }
  }
  return best
})

const nextAlarmLabel = computed(() => {
  if (!nextAlarm.value) return ''
  const d = new Date(nextAlarm.value.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})
</script>

<template>
  <button type="button" class="ia-card" @click="emit('open')">
    <span class="ia-card__label">{{ t('ia2.overview.cardSchedule') }}</span>
    <span class="ia-card__num">{{ todayTodos.length }}</span>
    <span v-if="nextAlarm" class="ia-card__sub ia-card__sub--alarm">
      ⏰ {{ nextAlarmLabel }} {{ nextAlarm.title }}
    </span>
    <span v-else class="ia-card__sub">{{ t('ia2.overview.scheduleEmpty') }}</span>
  </button>
</template>
