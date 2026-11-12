// overlay/commandtask 域：任务形态 slash 命令语义（antigravity A7 吸收，矩阵 §3.2 A7 余项）。
//
// antigravity 语义（slash 命令的任务形态——命令可派生成可派发任务）：
// - **命令→任务派生**：slash 命令带任务模板（title/goal/acceptance）即任务形态；
// - **参数映射**：命令参数填入任务模板槽位（{{arg}}）；
// - **门禁随行**：命令的 gate（如需审批）带入任务 gate；
// - **纯命令不派生**：无任务模板的 slash 命令保持命令形态。
// 衔接 cmdmeta（命令元数据）与 kanban 门禁（399）：本层=派生纯函数。
export interface SlashCommand {
  name: string
  /** 任务模板（缺省=纯命令不派生）。 */
  taskTemplate?: {
    title: string
    goal: string
    acceptance: string[]
  }
  /** 命令门禁（随任务带入）。 */
  requiresApproval?: boolean
}

export interface DerivedTask {
  title: string
  goal: string
  acceptance: string[]
  requiresApproval: boolean
  sourceCommand: string
}

/** 参数槽替换（{{arg}} 风格；缺参留原槽并标记）。 */
function fill(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => args[key] ?? m)
}

/** slash 命令→任务派生（A7 任务形态语义；无模板返回 null=纯命令）。 */
export function deriveTask(
  command: SlashCommand,
  args: Record<string, string>,
): DerivedTask | null {
  if (!command.taskTemplate) return null
  return {
    title: fill(command.taskTemplate.title, args),
    goal: fill(command.taskTemplate.goal, args),
    acceptance: command.taskTemplate.acceptance.map((a) => fill(a, args)),
    requiresApproval: command.requiresApproval ?? false,
    sourceCommand: command.name,
  }
}

/** 槽位完整性检查：派生后标题/目标不得残留未填槽。 */
export function hasUnfilledSlots(task: DerivedTask): boolean {
  return /\{\{\w+\}\}/.test(task.title + task.goal + task.acceptance.join(' '))
}
