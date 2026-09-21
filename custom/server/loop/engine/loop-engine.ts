// overlay/custom/server/loop/engine/loop-engine.ts
import cronParser from 'cron-parser'
import type {
  LoopInstance, TaskContract, LoopEvent, LoopStage, LoopStats,
  VerificationRecord,
} from '../types'
import { isJudgeFailed } from '../types'
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
  emitEvent: (event: LoopEvent) => void | Promise<void>
}

export class LoopEngine {
  /** 本次 tick 的验证记录缓存（供 gateHumanReview 读 human 判定链） */
  private lastValidationRecords = new Map<string, VerificationRecord>()
  /** R7-D 看板并发闸（routa kanban-session-queue 语义）：同 board 同刻只跑 1 个
   *  handoff——board 维度互斥，其余 contract 留 queued 发 board_concurrency_full，
   *  下轮 reconcile。静态跨实例共享（进程内 loop 引擎多单例场景安全）。 */
  private static boardHandoffBusy = new Set<string>()

  constructor(private deps: LoopEngineDeps) {}

  /** R7-D board 并发 key：tenant 首段 slug（与 graph defaultKanbanBoardResolver
   *  同口径的轻量 slug，独立实现避免 graph↔engine 循环依赖）；无 tenant → loop.id
   *  兜底（该 loop 独立互斥，不跨 loop 干扰）。 */
  private boardKey(loop: LoopInstance): string {
    const tenant = loop.tenant
    if (tenant && typeof tenant === 'string') {
      const first = tenant.split(':')[0] ?? ''
      const slug = first.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
      if (slug.length >= 2) return slug
    }
    return loop.id
  }

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
        // R6-B 人机分工门禁（multica task.go:5996）：agent 验证过线只到 in_review，
        // done/persistence 须人审 approved 或无争议放行——先过 gate 再持久化。
        const passedRaw = validations.filter(v => v.passed)
        const passed = passedRaw.length > 0
          ? await this.gateHumanReview(loop, passedRaw, this.lastValidationRecords)
          : []
        if (passed.length > 0) {
          await this.transition(loop, 'validation', 'persistence', `${passed.length} contracts passed`)
          await this.runPersistence(loop, passed)
        }

        // Repair routing (for failed contracts)
        const failed = validations.filter(v => !v.passed)
        for (const f of failed) {
          await this.routeRepair(loop, f.contractId, f.failType)
        }

        if (passed.length > 0 || passedRaw.some((p) => validations.find((v) => v.contractId === p.contractId)?.passed)) {
          // 有 contract 过了门禁（persistence）或停 in_review（待人审）→ scheduling
          await this.transition(loop, passed.length > 0 ? 'persistence' : 'validation', 'scheduling', passed.length > 0 ? 'artifacts persisted' : `${passedRaw.length - passed.length} awaiting human review`)
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
      // R7-D 看板并发闸（routa kanban-session-queue 语义）：同 board 同刻只跑 1 个
      // handoff——占不到闸的 contract 留 queued 发 board_concurrency_full，下轮 reconcile。
      const boardKey = this.boardKey(loop)
      if (LoopEngine.boardHandoffBusy.has(boardKey)) {
        await this.deps.store.updateContract(c.id, {
          status: 'queued',
          dispatchReason: 'board_concurrency_full',
          dispatchReasonDetail: `board ${boardKey} busy`,
        } as never)
        this.deps.emitEvent({
          type: 'loop.dispatch-blocked', loopId: loop.id,
          contractId: c.id, reason: 'board_concurrency_full', detail: `board ${boardKey} busy`,
          ts: new Date().toISOString(),
        } as never)
        continue
      }
      LoopEngine.boardHandoffBusy.add(boardKey)
      try {
        const worktreeId = await this.deps.worktreeManager.create(c)
        // R6-A：dispatchWithOutcome 带认领护栏 + reason 透传（multica/routa 语义）。
        // 拦截（runtime_offline/max_depth_exceeded）→ 不进 in-progress，contract 留
        // queued 并落 dispatch reason 到 contract，事件原样透传（卡/会话旁 chip 数据源）。
        const outcome = await this.deps.dispatcher.dispatchWithOutcome(c, 'maker')
        if (!outcome.ok) {
          await this.deps.store.updateContract(c.id, {
            status: 'queued',
            dispatchReason: outcome.reason.code,
            dispatchReasonDetail: outcome.reason.detail ?? null,
          } as never)
          this.deps.emitEvent({
            type: 'loop.dispatch-blocked', loopId: loop.id,
            contractId: c.id, reason: outcome.reason.code, detail: outcome.reason.detail ?? '',
            ts: new Date().toISOString(),
          } as never)
          continue
        }
        await this.deps.store.updateContract(c.id, { status: 'in-progress', worktreeId, dispatchReason: 'handed_off' } as never)
        this.deps.emitEvent({
          type: 'loop.task-handed-off', loopId: loop.id,
          contractId: c.id, worktreeId, ts: new Date().toISOString(),
        })
        results.push({ contractId: c.id, worktreeId })
      } finally {
        LoopEngine.boardHandoffBusy.delete(boardKey)
      }
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
      this.lastValidationRecords.set(r.contractId, record)
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

  /** R6-B 人机分工状态门禁（multica task.go:5996 语义）：
   *  验证过线的 contract，agent 只能推到 in_review（待验收），done 留给人或
   *  PR 合并——persistence 前必须经人工门禁（verifier 的 requestHumanApproval
   *  已含 human 判定链；此处把「无 human spec 的 contract 也强制停在 in_review」
   *  兜住，失败永不自动动 in_review/blocked）。
   *  返回可进 persistence 的子集（human decision approved 或显式无需人审）。 */
  private async gateHumanReview(
    loop: LoopInstance,
    passed: Array<{ contractId: string; passed: boolean }>,
    records: Map<string, VerificationRecord>,
  ): Promise<Array<{ contractId: string; passed: boolean }>> {
    const ready: Array<{ contractId: string; passed: boolean }> = []
    for (const p of passed) {
      const contract = await this.deps.store.getContract(p.contractId)
      if (!contract) continue
      const record = records.get(p.contractId)
      const humanDecision = record?.results?.human?.decision
      // human spec 已有 approved/rejected 判定链（verifier 走 requestHumanApproval）：
      // approved → 直接进 persistence；rejected/changes-requested → 视为失败走 repair。
      if (humanDecision === 'approved') {
        ready.push(p)
        continue
      }
      if (humanDecision === 'rejected' || humanDecision === 'changes-requested') {
        await this.routeRepair(loop, p.contractId, 'human')
        continue
      }
      // 无 human spec（人未表态）：强制停 in_review（验收权在人），发门禁事件，
      // 不进 persistence——人后续经 /api/loop/contracts/:id/approve 放行。
      await this.deps.store.updateContract(p.contractId, { status: 'submitted' } as never)
      this.deps.emitEvent({
        type: 'loop.dispatch-blocked', loopId: loop.id,
        contractId: p.contractId, reason: 'gate_pending_human',
        detail: 'agent verified passed; awaiting human review before done',
        ts: new Date().toISOString(),
      } as never)
    }
    return ready
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
    // isJudgeFailed：新记录认 status==='failed'（pending/skipped 不算），旧记录回退 passed 布尔
    if (isJudgeFailed(record.results.judge)) return 'judge'
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
        const interval = cronParser.CronExpressionParser.parse(loop.schedule.cron, { tz: loop.schedule.timezone })
        return interval.next().toISOString()
      } catch {
        return new Date(Date.now() + 3600_000).toISOString()
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
