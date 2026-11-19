// overlay/kanban 域：看板状态词表的消费面单一入口。
//
// 正本是 kernel `hermes_cli/kanban_workflow.py` 的 `DEFAULT_STATUSES`
// （= DEFAULT_WORKFLOW.columns 的键 ∪ {archived}）。kernel 用它派生
// `VALID_STATUSES` 与约 18 处流转 SQL 谓词，是唯一真正决定合法状态的地方。
//
// 本文件不新建正本：它是 overlay／配置／客户端共同引用的消费面常量，
// 与 kernel 的一致性由 `__tests__/kanban-status-contract.test.ts` 强制
// （解析 kanban_workflow.py 的 Column 键 + ARCHIVED，与本地集合求差集）。
// kernel 换血增删列时该测试即红，逼一次显式对齐。
//
// 为什么不在 vendor 侧改：vendor/** 是钉版基线，改它要走 patches/series 并在
// 换血时重生成；对账守门能以零补丁成本达到同样防漂移效果，且能同时约束
// runtime/roster/columns.yaml 与 team/shared/handoff-rules.yaml 两份配置。
//
// 用法约束：任何「列名」字面量（列编排键、交接规则 from/to、客户端转移表）
// 都必须可被本集合解释；出现集合外列名即视为配置缺陷，由守门测试拦截。

/**
 * 看板九态。顺序跟随 kernel DEFAULT_WORKFLOW 的列顺序，`archived` 置于末尾
 * （kernel 侧它是独立常量，不在 columns 里）。
 */
export const KANBAN_STATUSES = [
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done',
  'archived',
] as const

export type KanbanStatusName = (typeof KANBAN_STATUSES)[number]

const STATUS_SET: ReadonlySet<string> = new Set(KANBAN_STATUSES)

/** 列名是否属于看板词表（配置文件与客户端字面量的统一判定口）。 */
export function isKanbanStatus(v: unknown): v is KanbanStatusName {
  return typeof v === 'string' && STATUS_SET.has(v)
}

/**
 * 词表版本：kernel 增删列时由守门测试失败驱动本值 +1，供派单/投影面判断
 * 历史数据是否来自旧词表（当前无数值消费者，只作可观测标识）。
 */
export const KANBAN_STATUS_VOCAB_VERSION = 1

/**
 * 列编排可派发的目标列：用户能从界面把卡拖进去的列。
 * `running` 由 dispatcher 认领写出且 drag_target=False，拖不进去——把编排挂在
 * `running` 上只会在派发器自己改状态时自触发，故排除。
 * 该判定只用于配置校验提示，不改变 matchColumnTransition 的匹配语义。
 */
export const KANBAN_DRAGGABLE_STATUSES = [
  'triage',
  'todo',
  'ready',
  'blocked',
  'review',
  'done',
  'archived',
] as const satisfies readonly KanbanStatusName[]
