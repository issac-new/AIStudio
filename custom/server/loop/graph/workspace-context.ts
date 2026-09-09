// overlay/custom/server/loop/graph/workspace-context.ts
// P1 Task 5 — R2 Workspace 上下文注入
//
// 节点进入 workspace（派发 subagent）前，把目标/当前进度/图上下文物化为
// workspace 根的 GRAPH-CONTEXT.md；Claude Code 经 CLAUDE.md、Codex 经 AGENTS.md
// 追加 `@GRAPH-CONTEXT.md` 引用行消费。上游摘要由事件日志汇聚，节点作者不手拼。
// 失败不阻断派发（R5 工程化：上下文是增强不是依赖）。

import { promises as fs } from 'fs'
import { join } from 'path'
import type { EventLogStore } from './event-log-store'

export interface GraphContextInput {
  goal: string
  nodeId: string
  nodeLabel: string
  iteration: number
  upstreamSummary: string
  completionCriteria: string
  budgetLeft: { steps: number; cost?: number }
  runUrl: string
}

const CONTEXT_FILE = 'GRAPH-CONTEXT.md'
const REFERENCE_LINE = `@${CONTEXT_FILE}`
const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md'] as const

/** 幂等写 GRAPH-CONTEXT.md（覆写式，标注"自动生成勿手改"） */
export async function writeGraphContext(workspacePath: string, ctx: GraphContextInput): Promise<void> {
  const cost = ctx.budgetLeft.cost !== undefined ? ` / cost ${ctx.budgetLeft.cost}` : ''
  const content = [
    '# 任务上下文（自动生成，勿手改）',
    '',
    `- 目标（goal）：${ctx.goal}`,
    `- 当前节点：${ctx.nodeId}/${ctx.nodeLabel}，第 ${ctx.iteration} 轮迭代`,
    `- 上游产出：${ctx.upstreamSummary}`,
    `- 完成判定：${ctx.completionCriteria}`,
    `- 剩余预算：steps ${ctx.budgetLeft.steps}${cost}`,
    `- 图回放：${ctx.runUrl}`,
    '',
  ].join('\n')
  await fs.writeFile(join(workspacePath, CONTEXT_FILE), content, 'utf-8')
}

/** CLAUDE.md / AGENTS.md 追加 @GRAPH-CONTEXT.md 引用行（已有则跳过；缺文件则创建单行文件） */
export async function ensureAgentReference(workspacePath: string): Promise<void> {
  for (const file of AGENT_FILES) {
    const p = join(workspacePath, file)
    let content: string
    try {
      content = await fs.readFile(p, 'utf-8')
    } catch {
      content = ''
    }
    if (content.includes(REFERENCE_LINE)) continue
    const next = content.length === 0
      ? `${REFERENCE_LINE}\n`
      : `${content.endsWith('\n') ? content : `${content}\n`}${REFERENCE_LINE}\n`
    await fs.writeFile(p, next, 'utf-8')
  }
}

/** 从事件日志汇聚前驱节点 update 摘要：每节点最近一次 node.completed 的 updateKeys，截断 500 字符 */
export async function summarizeUpstream(
  eventLog: EventLogStore,
  runId: string,
  beforeNodeId: string,
): Promise<string> {
  const events = await eventLog.query(runId, { kind: 'node.completed', limit: 1000 })
  const latest = new Map<string, string[]>()
  for (const e of events) {
    if (!e.nodeId || e.nodeId === beforeNodeId) continue
    const keys = (e.payload?.updateKeys as string[] | undefined) ?? []
    latest.set(e.nodeId, keys)
  }
  const lines = [...latest.entries()].map(([nodeId, keys]) =>
    keys.length > 0 ? `${nodeId}(${keys.join(', ')})` : nodeId)
  return lines.join(' → ').slice(0, 500)
}
