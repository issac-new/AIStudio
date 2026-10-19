// overlay/custom/client/ia2/stage-task-filter.ts
// 阶段 → 任务状态映射（2026-10-19 P2-9 续批，用户裁定先定映射）。
//
// 依据 26 步流程与看板状态词表（triage/todo/scheduled/ready/running/
// blocked/review/done/archived 九态，见 kanban_db.py DEFAULT_STATUSES）：
// 阶段页内嵌的看板只显示「本阶段在办」的卡，全量入口仍是「常用 · 看板」。
// 映射固定在此文件，阶段页、看板组件与守门测试同源。
// 注（2026-10-19 闸门收口 #3）：原 ④ 映射含 `in_progress`，但九态枚举无此值、全树
// 无状态写入点——纯幽灵值，已从权威映射剔除（filterTasksByStatuses 通用匹配能力不受影响）。
export const STAGE_BOARD_STATUSES: Readonly<Record<3 | 4, readonly string[]>> = {
  // ③ 分析设计：任务分解、系统分析、G2、排期——卡在待分类/待办/已排期/可开工
  3: ['triage', 'todo', 'scheduled', 'ready'],
  // ④ 开发：编码、联调、测试、缺陷修复——卡在进行中/阻塞/待验收
  4: ['running', 'blocked', 'review'],
}

export const STAGE_BOARD_STATUS_LABELS: Readonly<Record<3 | 4, { zh: string; en: string }>> = {
  3: { zh: '待分类 / 待办 / 已排期 / 可开工', en: 'Triage / To do / Scheduled / Ready' },
  4: { zh: '进行中 / 阻塞 / 待验收', en: 'In progress / Blocked / Review' },
}

/** 阶段对应的可见状态；无阶段视图的阶段（1/2/5/6）返回空数组=不额外过滤。 */
export function stageBoardStatuses(stage: number): readonly string[] {
  return (STAGE_BOARD_STATUSES as Record<number, readonly string[] | undefined>)[stage] ?? []
}

/** 阶段视图说明文案（页头横幅用）；无映射返回空串。 */
export function stageBoardStatusLabel(stage: number, zh: boolean): string {
  const label = (STAGE_BOARD_STATUS_LABELS as Record<number, { zh: string; en: string } | undefined>)[stage]
  return label ? (zh ? label.zh : label.en) : ''
}
