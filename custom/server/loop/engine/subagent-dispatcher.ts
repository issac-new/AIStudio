// overlay/custom/server/loop/engine/subagent-dispatcher.ts
import type { TaskContract } from '../types'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface SubagentDispatcherDeps {
  // Invoke hermes-agent with the given prompt + worktree
  invokeAgent?: (prompt: string, worktreePath: string, readPlan: string[], writeBoundary: string[]) => Promise<string>
}

export class SubagentDispatcher {
  private depth: number = 0
  private readonly maxDepth: number = 5

  constructor(private deps: SubagentDispatcherDeps = {}) {}

  async dispatch(contract: TaskContract, role: 'maker' | 'checker'): Promise<void> {
    if (this.depth >= this.maxDepth) {
      throw new Error(`Max subagent depth (${this.maxDepth}) exceeded for contract ${contract.id}`)
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
  }
}
