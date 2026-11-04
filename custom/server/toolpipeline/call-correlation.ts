// overlay/toolpipeline 域：工具调用关联上下文（2026-11-04 W1 执法轮）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》08 节——一次执行应能沿
// 「traceId/taskId/runId/stepId/workflowVersion/promptVersion/approvalId」还原
// 全链。上游 AgentToolContext 只带 sessionId/userId/profileId/runId，其余字段
// 没有天然通道；本模块提供进程内 ambient 关联（设置后审计行与幂等键自动携带），
// 生产注入点（graph 执行器/派单链）后续接线，先保证通道与字段面存在。
//
// 语义：全进程单槽（同一时刻只有一个执行流在跑工具调用的场景成立）；
// 异步并发下 later-write wins——审计字段是尽力而为的关联面，不是强一致事务。

export interface ToolCallCorrelation {
  traceId?: string
  taskId?: string
  stepId?: string
  workflowVersion?: string
  promptVersion?: string
  inputRef?: string
  outputRef?: string
  approvalId?: string
  retryCount?: number
}

let current: ToolCallCorrelation = {}

/** 设置当前执行流的关联上下文（浅合并；传 undefined 值即清除该键）。 */
export function setToolCallCorrelation(partial: ToolCallCorrelation): void {
  const next: ToolCallCorrelation = { ...current }
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null) delete (next as Record<string, unknown>)[k]
    else (next as Record<string, unknown>)[k] = v
  }
  current = next
}

/** 读取当前关联快照（只读副本）。 */
export function getToolCallCorrelation(): Readonly<ToolCallCorrelation> {
  return { ...current }
}

/** 清空（执行流收尾调用，防串槽）。 */
export function clearToolCallCorrelation(): void {
  current = {}
}
