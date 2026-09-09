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
import type { LoopStateStore } from '../store/state-store'
import type { TaskContract } from '../types'

export interface GraphContextInput {
  goal: string
  nodeId: string
  nodeLabel: string
  iteration: number
  upstreamSummary: string
  completionCriteria: string
  /** steps 在 run 上下文外（如契约派发时刻）不可得，可省略——渲染时跳过 */
  budgetLeft: { steps?: number; cost?: number }
  runUrl: string
}

const CONTEXT_FILE = 'GRAPH-CONTEXT.md'
const REFERENCE_LINE = `@${CONTEXT_FILE}`
const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md'] as const

/** 幂等写 GRAPH-CONTEXT.md（覆写式，标注"自动生成勿手改"） */
export async function writeGraphContext(workspacePath: string, ctx: GraphContextInput): Promise<void> {
  const budgetBits: string[] = []
  if (ctx.budgetLeft.steps !== undefined) budgetBits.push(`steps ${ctx.budgetLeft.steps}`)
  if (ctx.budgetLeft.cost !== undefined) budgetBits.push(`cost ${ctx.budgetLeft.cost}`)
  const lines = [
    '# 任务上下文（自动生成，勿手改）',
    '',
    `- 目标（goal）：${ctx.goal}`,
    `- 当前节点：${ctx.nodeId}/${ctx.nodeLabel}，第 ${ctx.iteration} 轮迭代`,
    `- 上游产出：${ctx.upstreamSummary}`,
    `- 完成判定：${ctx.completionCriteria}`,
    ...(budgetBits.length > 0 ? [`- 剩余预算：${budgetBits.join(' / ')}`] : []),
    `- 图回放：${ctx.runUrl}`,
    '',
  ]
  await fs.writeFile(join(workspacePath, CONTEXT_FILE), lines.join('\n'), 'utf-8')
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

// ---------------------------------------------------------------------------
// 生产装配工厂（终审 Important 6）：patch 202 engineDeps.injectWorkspaceContext
// ---------------------------------------------------------------------------

/**
 * 生成 PhaseNodeDeps.injectWorkspaceContext：handoff 派发 subagent 前，把 loop
 * 台账 + 契约事实物化为 worktree 根的 GRAPH-CONTEXT.md，并给 CLAUDE.md/AGENTS.md
 * 追加引用行。run 级字段（nodeId/iteration/runUrl）在编译期契约上不可得，按可用
 * 事实填充：goal/预算差值取 loop 台账，上游摘要取契约 source，完成判定取
 * requiredFiles / 程序化验证命令。store 未就绪（lazyStore 早期访问抛错）时降级为
 * 契约自述，不阻断派发（handoff 节点还会兜一层 try/catch——上下文是增强不是依赖）。
 */
export function makeInjectWorkspaceContext(opts: {
  store: Pick<LoopStateStore, 'getLoop'>
  /** worktree 根目录，缺省 `.loop/worktrees`（与 verifier 同款 worktree 布局） */
  worktreeRoot?: string
}): (contract: TaskContract, worktreeId: string) => Promise<void> {
  const root = opts.worktreeRoot ?? '.loop/worktrees'
  return async (contract, worktreeId) => {
    let loop: Awaited<ReturnType<LoopStateStore['getLoop']>> = null
    try {
      loop = await opts.store.getLoop(contract.loopId)
    } catch { /* store 未就绪 → 契约自述降级 */ }
    const workspacePath = join(root, worktreeId)
    // worktree 目录尚不存在时先建（幂等）：注入顺序不应依赖 worktreeManager 的目录布局
    await fs.mkdir(workspacePath, { recursive: true })
    const progCommands = contract.verificationIntent.programmatic.map(p => p.command)
    await writeGraphContext(workspacePath, {
      goal: loop?.goal ?? contract.source.summary,
      nodeId: 'handoff',
      nodeLabel: `${loop?.name ?? contract.loopId}:handoff`,
      iteration: loop?.stats.currentIteration ?? 0,
      upstreamSummary: contract.source.summary,
      completionCriteria: contract.resultTemplate.requiredFiles.length > 0
        ? `required files: ${contract.resultTemplate.requiredFiles.join(', ')}`
        : (progCommands.length > 0 ? progCommands.join(' && ') : `complete contract ${contract.id}`),
      budgetLeft: {
        cost: loop ? Math.max(0, loop.budget.maxCostTotal - loop.stats.totalCost) : undefined,
      },
      runUrl: '',
    })
    await ensureAgentReference(workspacePath)
  }
}
