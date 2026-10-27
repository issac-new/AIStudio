// overlay/custom/client/ia2/composables/useDailyStageProgress.ts
// 日常工作六阶段进度单一事实源：只看跨板任务状态与组织配置信号，不读推演 run-state。
// 目标是“无推演运行时日常导航仍可用”；阶段点表达当前工作集中在哪，不假装
// 一个线性项目生命周期已经完成。
// 2026-10-27 日常阶段语义轮（Task 4）：done 的含义=「已流转」（后续阶段已有
// 工作），不是「已完成」——侧栏/阶段页/首页按已流转呈现，不画绿✓；五步状态
// 接线 daily-setup-signals 真实配置信号（org/accounts/agents），无信号=untracked。
import { computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { dailySetupSignals, dailySetupStepState, ensureDailySetupSignals } from './daily-setup-signals'
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
  // 交通灯红（2026-10-22 用户裁定红黄绿）：阶段桶内有阻塞任务 → 红优先于黄；
  // blocked 只出现在④桶（running/blocked），①组织配置不由此推导。
  const statuses = DAILY_STAGE_STATUSES[stage as 2 | 3 | 4 | 5 | 6] ?? []
  if (statuses.includes('blocked') && tasks.some((t: DailyTaskLike) => t.status === 'blocked')) return 'blocked'
  if (dailyStageCount(tasks, stage) > 0) return 'current'
  // 后续阶段已有工作 = 本阶段已流转（工作集中后移），不表示本阶段“已完成”——
  // 呈现层（侧栏/阶段页/首页）按已流转中性表达，不画绿✓；不写回任务。
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
  // 五步真实配置信号（2026-10-27 接线，单一实现=daily-setup-signals，不另起推导）：
  // org/accounts/agents 可判；teams/env 无稳定日常信号=null→untracked，不猜。
  const signals = computed(() => dailySetupSignals())

  onMounted(() => {
    void workspace.refreshAllBoards()
    void ensureDailySetupSignals()
  })

  return {
    tasks,
    signals,
    stageCount: (no: 1 | 2 | 3 | 4 | 5 | 6) => dailyStageCount(tasks.value, no),
    stageState: (no: 1 | 2 | 3 | 4 | 5 | 6) => dailyStageState(tasks.value, no),
    stepState: (step: SetupStep): SetupStepState => dailySetupStepState(step, signals.value),
  }
}
