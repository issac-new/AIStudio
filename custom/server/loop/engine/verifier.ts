// overlay/custom/server/loop/engine/verifier.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, statSync } from 'fs'
import { resolve } from 'path'
import type {
  TaskContract, LoopInstance, VerificationRecord, AutonomyLevel,
} from '../types'

const execFileAsync = promisify(execFile)

export interface VerifierDeps {
  // Judge: call an independent model (different model family from maker)
  callJudge?: (model: string, diff: string, rubric: string) => Promise<{ score: number; reasoning: string }>
  // Human: notify and await approval
  requestHumanApproval?: (contractId: string, approvers: string[]) => Promise<'approved' | 'rejected' | 'changes-requested' | 'pending'>
}

export class Verifier {
  constructor(private deps: VerifierDeps = {}) {}

  async verify(contract: TaskContract, loop: LoopInstance): Promise<VerificationRecord> {
    const level = loop.autonomyLevel
    const spec = contract.verificationIntent

    // --- Programmatic ---
    const progResults: Array<{ command: string; exitCode: number; stdout: string; passed: boolean }> = []
    let progFailed = false
    for (const check of spec.programmatic) {
      const result = await this.runProgrammatic(check, contract.worktreeId)
      progResults.push(result)
      if (!result.passed) progFailed = true
    }

    // Short-circuit: L1/L2/L3 all short-circuit Judge if Programmatic fails
    if (progFailed) {
      return {
        contractId: contract.id,
        results: { programmatic: progResults, judge: null, human: null },
        overall: 'failed',
        finalResponseGuard: false,
      }
    }

    // --- Judge (skip if not configured) ---
    let judgeResult: VerificationRecord['results']['judge'] = null
    if (spec.judge && this.deps.callJudge) {
      // Judge only sees the diff, not maker's reasoning trace
      const diff = await this.getWorktreeDiff(contract.worktreeId)
      const jr = await this.deps.callJudge(spec.judge.model, diff, spec.judge.rubric)
      judgeResult = {
        model: spec.judge.model,
        score: jr.score,
        reasoning: jr.reasoning,
        passed: jr.score >= spec.judge.minScore,
      }
    }

    const judgeFailed = judgeResult && !judgeResult.passed

    // --- Human gate ---
    let humanResult: VerificationRecord['results']['human'] = null
    if (spec.human) {
      const needsHuman = this.needsHumanGate(level, spec.human.gate, progFailed, !!judgeFailed)
      if (needsHuman && this.deps.requestHumanApproval) {
        const decision = await this.deps.requestHumanApproval(contract.id, spec.human.approvers)
        if (decision === 'pending') {
          return {
            contractId: contract.id,
            results: { programmatic: progResults, judge: judgeResult, human: null },
            overall: 'pending',
            finalResponseGuard: true,
          }
        }
        humanResult = {
          approver: spec.human.approvers[0] ?? 'unknown',
          decision,
          comment: '',
          timestamp: new Date().toISOString(),
        }
      }
    }

    // --- Determine overall ---
    const allPassed = !progFailed && (!judgeResult || judgeResult.passed)
      && (!humanResult || humanResult.decision === 'approved')

    // --- finalResponseGuard ---
    const guardPassed = await this.finalResponseGuard(contract)

    return {
      contractId: contract.id,
      results: { programmatic: progResults, judge: judgeResult, human: humanResult },
      overall: allPassed && guardPassed ? 'passed' : 'failed',
      finalResponseGuard: guardPassed,
    }
  }

  private needsHumanGate(level: AutonomyLevel, gate: 'always' | 'on-fail', progFailed: boolean, judgeFailed: boolean): boolean {
    if (gate === 'always') return true
    // gate = 'on-fail'
    if (level === 'L3') return progFailed || judgeFailed  // L3 only escalates on fail
    return true  // L1/L2 always need human even on pass
  }

  private async runProgrammatic(
    check: { command: string; expectedExitCode: number; timeout: number },
    worktreeId: string | null,
  ): Promise<{ command: string; exitCode: number; stdout: string; passed: boolean }> {
    const cwd = worktreeId ? `.loop/worktrees/${worktreeId}` : process.cwd()
    try {
      const { stdout } = await execFileAsync(check.command.split(' ')[0], check.command.split(' ').slice(1), {
        cwd,
        timeout: check.timeout,
        maxBuffer: 1024 * 1024,
      })
      const stdoutTrimmed = stdout.length > 10240 ? stdout.slice(-10240) + `\n... (${stdout.length} bytes total)` : stdout
      return { command: check.command, exitCode: 0, stdout: stdoutTrimmed, passed: true }
    } catch (err: any) {
      const stdout = err.stdout ?? err.message ?? ''
      return { command: check.command, exitCode: err.code ?? 1, stdout, passed: false }
    }
  }

  private async getWorktreeDiff(worktreeId: string | null): Promise<string> {
    if (!worktreeId) return ''
    try {
      const { stdout } = await execFileAsync('git', ['diff'], { cwd: `.loop/worktrees/${worktreeId}` })
      return stdout
    } catch { return '' }
  }

  private async finalResponseGuard(contract: TaskContract): Promise<boolean> {
    // Trivially passes when no required files were declared (nothing to verify).
    if (contract.resultTemplate.requiredFiles.length === 0) return true
    // Check requiredFiles exist and are non-empty
    if (!contract.worktreeId) return false
    const wtPath = `.loop/worktrees/${contract.worktreeId}`
    for (const f of contract.resultTemplate.requiredFiles) {
      const p = resolve(wtPath, f)
      if (!existsSync(p)) return false
      if (statSync(p).size === 0) return false
    }
    return true
  }
}
