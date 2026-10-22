// overlay/custom/client/ia2/badge-count.ts
// 待办徽标计数核（2026-10-22 侧栏待办徽标轮）：从 useSideNavBadges 抽出的纯函数——
// composable 传递依赖 @/router（模块级 createWebHashHistory，node 环境即炸，2026-10-18
// 全量 mock 击穿坑同源），守门测试只碰本纯模块。
import { stageBoardStatuses } from './stage-task-filter'

/** 按状态计数：statuses 为空=0（阶段①②⑤⑥无看板态映射，不造数字） */
export function countByStatuses(tasks: readonly { status: string }[], statuses: readonly string[]): number {
  if (!statuses.length) return 0
  const want = new Set(statuses)
  let n = 0
  for (const t of tasks) if (want.has(t.status)) n += 1
  return n
}

/** 阶段在办数（③④ 有看板态映射；①②⑤⑥ 恒 0） */
export function stageTaskCount(tasks: readonly { status: string }[], stage: number): number {
  return countByStatuses(tasks, stageBoardStatuses(stage))
}

/** 受阻任务数（看板徽标口径，与注意力条同源同口径） */
export function blockedTaskCount(tasks: readonly { status: string }[]): number {
  return countByStatuses(tasks, ['blocked'])
}
