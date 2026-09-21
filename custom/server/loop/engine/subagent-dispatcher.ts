// overlay/custom/server/loop/engine/subagent-dispatcher.ts
import type { TaskContract } from '../types'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DispatchReason } from './dispatch-reason'

const execFileAsync = promisify(execFile)

export interface SubagentDispatcherDeps {
  // Invoke hermes-agent with the given prompt + worktree
  invokeAgent?: (prompt: string, worktreePath: string, readPlan: string[], writeBoundary: string[]) => Promise<string>
  /** 决策原因回调（R6-A：分派「为什么没跑/为什么这么跑」透传到卡/会话旁 chip） */
  onDispatchReason?: (contractId: string, reason: DispatchReason) => void
  /** runtime 在线新鲜度探针（认领护栏）；返回 false 拦截并给 runtime_offline */
  isRuntimeHealthy?: () => boolean
}

export interface DispatchOutcome {
  ok: boolean
  reason: DispatchReason
}

export class SubagentDispatcher {
  private depth: number = 0
  private readonly maxDepth: number = 5

  constructor(private deps: SubagentDispatcherDeps = {}) {}

  /** 认领护栏 + 原因透传（multica agent.sql:743 / dispatch/reason.go:25 语义）：
   *  拦截（runtime_offline / max_depth_exceeded）→ 不发起调用并给 reason；
   *  放行 → 返回 handed_off。返回值供 LoopEngine 落 contract 状态与事件。 */
  async dispatchWithOutcome(contract: TaskContract, role: 'maker' | 'checker'): Promise<DispatchOutcome> {
    // 护栏①：runtime 在线新鲜度（认领前必查——离线不跑）
    if (this.deps.isRuntimeHealthy && !this.deps.isRuntimeHealthy()) {
      const reason: DispatchReason = { code: 'runtime_offline', detail: 'agent runtime unhealthy' }
      this.deps.onDispatchReason?.(contract.id, reason)
      return { ok: false, reason }
    }
    // 护栏②：嵌套深度（routa delegation-depth 语义，上限 maxDepth）
    if (this.depth >= this.maxDepth) {
      const reason: DispatchReason = { code: 'max_depth_exceeded', detail: `depth ${this.depth + 1} > ${this.maxDepth}` }
      this.deps.onDispatchReason?.(contract.id, reason)
      return { ok: false, reason }
    }
    this.depth++

    try {
      const worktreePath = contract.worktreeId ? `.loop/worktrees/${contract.worktreeId}` : process.cwd()
      const prompt = role === 'maker'
        ? `Goal: ${contract.source.summary}\nRead: ${contract.readPlan.requiredReads.join(', ')}\nWrite to: ${contract.writeBoundary.join(', ')}\nProduce: ${contract.resultTemplate.artifactType}`
        : `Review the work in this worktree. Verify against: ${JSON.stringify(contract.verificationIntent)}`

      if (this.deps.invokeAgent) {
        await this.deps.invokeAgent(prompt, worktreePath, contract.readPlan.requiredReads, contract.writeBoundary)
      } else {
        // Fallback: invoke hermes-agent CLI
        try {
          await execFileAsync('hermes', ['--prompt', prompt, '--cwd', worktreePath], { timeout: 300_000 })
        } catch (err) {
          // Agent invocation failure is non-fatal; verification will catch missing output
        }
      }
    } finally {
      this.depth--
    }
    const reason: DispatchReason = { code: 'handed_off' }
    this.deps.onDispatchReason?.(contract.id, reason)
    return { ok: true, reason }
  }

  /** 兼容旧签名（throw on depth）；内部转 dispatchWithOutcome 丢弃返回值 */
  async dispatch(contract: TaskContract, role: 'maker' | 'checker'): Promise<void> {
    const outcome = await this.dispatchWithOutcome(contract, role)
    if (!outcome.ok && outcome.reason.code === 'max_depth_exceeded') {
      throw new Error(`Max subagent depth (${this.maxDepth}) exceeded for contract ${contract.id}`)
    }
  }
}
