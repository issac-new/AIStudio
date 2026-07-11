// overlay/custom/server/loop/engine/loop-engine.ts
import type {
  LoopInstance, TaskContract, LoopEvent, LoopStage, LoopStats,
  VerificationRecord,
} from '../../../client/loop/types'
import type { LoopStateStore } from '../store/state-store'
import type { GithubConnector } from '../connectors/github-connector'
import type { LocalGitConnector } from '../connectors/local-git-connector'
import type { WebhookConnector } from '../connectors/webhook-connector'
import type { Verifier } from './verifier'
import type { SubagentDispatcher } from './subagent-dispatcher'
import type { WorktreeManager } from './worktree-manager'
import type { BudgetGuard } from './budget-guard'
import type { StuckDetector } from './stuck-detector'
import type { HookManager } from './hooks'

export interface LoopEngineDeps {
  store: LoopStateStore
  githubConnector?: GithubConnector
  localGitConnector?: LocalGitConnector
  webhookConnector?: WebhookConnector
  verifier: Verifier
  dispatcher: SubagentDispatcher
  worktreeManager: WorktreeManager
  budgetGuard: BudgetGuard
  stuckDetector: StuckDetector
  hookManager: HookManager
  emitEvent: (event: LoopEvent) => void
}

export class LoopEngine {
  constructor(private deps: LoopEngineDeps) {}

  async tick(loopId: string): Promise<void> {
    const loop = await this.deps.store.getLoop(loopId)
    if (!loop) throw new Error(`Loop not found: ${loopId}`)
    if (loop.status === 'running') return // already running

    // pre-tick hooks
    const preResult = await this.deps.hookManager.run('pre-tick', loop)
    if (preResult.decision === 'deny') return

    // budget check
    const budgetDecision = this.deps.budgetGuard.check(loop)
    if (!budgetDecision.allow) {
      await this.handleBudgetExceed(loop, budgetDecision.action!)
      return
    }

    // stuck check
    const stuckReason = await this.deps.stuckDetector.check(loop)
    if (stuckReason) {
      this.deps.emitEvent({ type: 'loop.stuck', loopId, reason: stuckReason, ts: new Date().toISOString() })
      await this.deps.stuckDetector.handleStuck(loop, stuckReason)
      return
    }

    await this.deps.store.updateLoop(loopId, {
      status: 'running',
      lastTickAt: new Date().toISOString(),
      stats: loop.stats,
    })
    loop.status = 'running'
    loop.stats.currentIteration++
    loop.stats.totalIterations++

    try {
      // Stage 1: Discovery
      const contracts = await this.runDiscovery(loop)
      if (contracts.length === 0) {
        await this.transition(loop, 'discovery', 'scheduling', 'no actionable items found')
      } else {
        // Stage 2: Handoff
        await this.transition(loop, 'discovery', 'handoff', `${contracts.length} items discovered`)
        const results = await this.runHandoff(loop, contracts)

        // Stage 3: Validation
        await this.transition(loop, 'handoff', 'validation', 'maker subagents completed')
        const validations = await this.runValidation(loop, results)

        // Stage 4: Persistence (for passed contracts)
        const passed = validations.filter(v => v.passed)
        if (passed.length > 0) {
          await this.transition(loop, 'validation', 'persistence', `${passed.length} contracts passed`)
          await this.runPersistence(loop, passed)
        }

        // Repair routing (for failed contracts)
        const failed = validations.filter(v => !v.passed)
        for (const f of failed) {
          await this.routeRepair(loop, f.contractId, f.failType)
        }

        if (passed.length > 0) {
          await this.transition(loop, 'persistence', 'scheduling', 'artifacts persisted')
        } else {
          await this.transition(loop, 'validation', 'scheduling', 'no contracts passed')
        }
      }

      // Stage 5: Scheduling — check stop condition
      const stopMet = await this.checkStopCondition(loop)
      if (stopMet) {
        this.deps.emitEvent({
          type: 'loop.completed', loopId,
          finalStats: loop.stats, ts: new Date().toISOString(),
        })
        await this.deps.store.updateLoop(loopId, {
          status: 'completed', stage: 'scheduling',
          nextTickAt: null,
        })
      } else {
        const nextTick = this.computeNextTick(loop)
        await this.deps.store.updateLoop(loopId, {
          status: 'idle', stage: 'scheduling', nextTickAt: nextTick,
          stats: loop.stats,
        })
      }
    } catch (err) {
      await this.deps.store.updateLoop(loopId, { status: 'failed' })
      throw err
    }

    // post-tick hook
    await this.deps.hookManager.run('post-tick', loop)

    // emit tick-complete
    const updated = await this.deps.store.getLoop(loopId)
    this.deps.emitEvent({
      type: 'loop.tick-complete', loopId,
      iteration: updated!.stats.currentIteration,
      stats: updated!.stats, ts: new Date().toISOString(),
    })
  }

  private async runDiscovery(loop: LoopInstance): Promise<TaskContract[]> {
    await this.transition(loop, loop.stage, 'discovery', 'tick start')
    const contracts: TaskContract[] = []
    if (this.deps.githubConnector) {
      contracts.push(...await this.deps.githubConnector.discover(loop))
    }
    if (this.deps.localGitConnector) {
      contracts.push(...await this.deps.localGitConnector.discover(loop))
    }
    if (this.deps.webhookConnector) {
      contracts.push(...await this.deps.webhookConnector.discover(loop))
    }
    for (const c of contracts) {
      await this.deps.store.appendContract(c)
      this.deps.emitEvent({ type: 'loop.task-discovered', loopId: loop.id, contract: c, ts: new Date().toISOString() })
    }
    return contracts
  }

  private async runHandoff(loop: LoopInstance, contracts: TaskContract[]): Promise<Array<{ contractId: string; worktreeId: string }>> {
    const results: Array<{ contractId: string; worktreeId: string }> = []
    for (const c of contracts) {
      const worktreeId = await this.deps.worktreeManager.create(c)
      await this.deps.dispatcher.dispatch(c, 'maker')
      await this.deps.store.updateContract(c.id, { status: 'in-progress', worktreeId })
      this.deps.emitEvent({
        type: 'loop.task-handed-off', loopId: loop.id,
        contractId: c.id, worktreeId, ts: new Date().toISOString(),
      })
      results.push({ contractId: c.id, worktreeId })
    }
    return results
  }

  private async runValidation(loop: LoopInstance, results: Array<{ contractId: string; worktreeId: string }>): Promise<Array<{ contractId: string; passed: boolean; failType?: string }>> {
    const validations: Array<{ contractId: string; passed: boolean; failType?: string }> = []
    for (const r of results) {
      const contract = await this.deps.store.getContract(r.contractId)
      if (!contract) continue
      const record = await this.deps.verifier.verify(contract, loop)
      await this.deps.store.appendVerification(record)
      this.deps.emitEvent({
        type: 'loop.verification-complete', contractId: r.contractId,
        passed: record.overall === 'passed', ts: new Date().toISOString(),
      })
      if (record.overall === 'passed') {
        validations.push({ contractId: r.contractId, passed: true })
      } else {
        const failType = this.determineFailType(record)
        validations.push({ contractId: r.contractId, passed: false, failType })
      }
    }
    return validations
  }

  private async runPersistence(loop: LoopInstance, passed: Array<{ contractId: string; passed: boolean }>): Promise<void> {
    for (const p of passed) {
      const contract = await this.deps.store.getContract(p.contractId)
      if (!contract) continue
      const artifact = `PR for ${contract.id}`
      this.deps.emitEvent({
        type: 'loop.persisted', loopId: loop.id,
        contractId: p.contractId, artifact, ts: new Date().toISOString(),
      })
      loop.stats.tasksCompleted++
    }
  }

  private async routeRepair(loop: LoopInstance, contractId: string, failType?: string): Promise<void> {
    const contract = await this.deps.store.getContract(contractId)
    if (!contract) return
    const attempts = contract.attempts + 1
    if (attempts >= contract.maxAttempts) {
      await this.deps.store.updateContract(contractId, { status: 'escalated', attempts })
      loop.stats.tasksBlocked++
      return
    }
    if (failType === 'task-plan') {
      // Route back to discovery for contract regeneration
      await this.deps.store.updateContract(contractId, { status: 'queued', attempts })
    } else {
      // Route back to handoff for code repair
      await this.deps.store.updateContract(contractId, { status: 'queued', attempts })
    }
  }

  private determineFailType(record: VerificationRecord): string {
    const progFailed = record.results.programmatic.some(p => !p.passed)
    if (progFailed) return 'programmatic'
    if (record.results.judge && !record.results.judge.passed) return 'judge'
    if (record.results.human && record.results.human.decision !== 'approved') return 'human'
    return 'unknown'
  }

  private async checkStopCondition(loop: LoopInstance): Promise<boolean> {
    // Delegates to an independent small model (implemented in verifier or a dedicated checker)
    // For now, a simple heuristic: if no contracts are queued/in-progress, consider done
    const contracts = await this.deps.store.queryContracts(loop.id, {
      status: ['queued', 'in-progress', 'submitted', 'verifying'],
    })
    return contracts.length === 0
  }

  private computeNextTick(loop: LoopInstance): string {
    if (loop.schedule.mode === 'manual') return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    if (loop.schedule.mode === 'cron' && loop.schedule.cron) {
      try {
        // cron-parser is an optional dep (added in Task 7); fall back if absent
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const parser = require('cron-parser')
        const interval = parser.parseExpression(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    }
    return new Date(Date.now() + 60 * 60 * 1000).toISOString()
  }

  private async transition(loop: LoopInstance, from: LoopStage, to: LoopStage, reason: string): Promise<void> {
    this.deps.emitEvent({
      type: 'loop.stage-transition', loopId: loop.id,
      from, to, reason, ts: new Date().toISOString(),
    })
    await this.deps.store.updateLoop(loop.id, { stage: to })
    loop.stage = to
  }

  private async handleBudgetExceed(loop: LoopInstance, action: string): Promise<void> {
    if (action === 'throw') {
      await this.deps.store.updateLoop(loop.id, { status: 'paused' })
    } else if (action === 'kill') {
      await this.deps.store.updateLoop(loop.id, { status: 'failed' })
    }
    this.deps.emitEvent({
      type: 'loop.budget-warning', loopId: loop.id,
      spent: loop.stats.totalCost, limit: loop.budget.maxCostTotal,
      ts: new Date().toISOString(),
    })
  }
}
