// overlay/custom/client/ia2/composables/useDailyStageProgress.ts
// 日常工作六阶段进度单一事实源：只看跨板任务状态，不读推演 run-state。
// 目标是“无推演运行时日常导航仍可用”；阶段点表达当前工作集中在哪，不假装
// 一个线性项目生命周期已经完成。
import { computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import type { SetupStep, SetupStepState, StageState } from './useStageProgress'

interface DailyTaskLike { status: string }

/** 看板九态 → 日常阶段的工作 concentration 映射；①搭建是组织配置，不由任务状态推导。 */
export const DAILY_STAGE_STATUSES: Readonly<Record<2 | 3 | 4 | 5 | 6, readonly string[]>> = {
  2: ['triage', 'todo'],
  3: ['scheduled', 'ready'],
  4: ['running', 'blocked'],
  5: ['review'],
  6: ['done', 'archived'],
}

export function dailyStageCount(tasks: readonly DailyTaskLike[], stage: number): number {
  if (stage === 1) return tasks.length
  const statuses = DAILY_STAGE_STATUSES[stage as 2 | 3 | 4 | 5 | 6] ?? []
  return tasks.filter((t: DailyTaskLike) => statuses.includes(t.status)).length
}

export function dailyStageState(tasks: readonly DailyTaskLike[], stage: number): StageState {
  if (tasks.length === 0) return stage === 1 ? 'current' : 'pending'
  if (dailyStageCount(tasks, stage) > 0) return 'current'
  // 后续阶段已有工作 = 本阶段不再当前，按日常视图记 done；这只是导航状态，不写回任务。
  for (let no = stage + 1; no <= 6; no += 1) {
    if (dailyStageCount(tasks, no) > 0) return 'done'
  }
  return 'pending'
}

export function useDailyStageProgress() {
  const workspace = useWorkspaceStore()
  // 推演并入轮（2026-10-21）：观察面 sim 任务不参与日常阶段完成度——
  // 阶段进度仍是日常任务口径，sim 卡只做呈现（看板/工作台徽标）。
  const tasks = computed(() => (workspace.tasks ?? []).filter(t => t.source !== 'sim'))

  onMounted(() => { void workspace.refreshAllBoards() })

  return {
    tasks,
    stageCount: (no: 1 | 2 | 3 | 4 | 5 | 6) => dailyStageCount(tasks.value, no),
    stageState: (no: 1 | 2 | 3 | 4 | 5 | 6) => dailyStageState(tasks.value, no),
    // ①五步当前没有独立完成信号；不拿任务运行状态冒充组织配置完成。
    stepState: (_step: SetupStep): SetupStepState => 'current',
  }
}
