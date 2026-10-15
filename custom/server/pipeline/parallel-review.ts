// overlay/custom/server/pipeline/parallel-review.ts
// 并行评审编排器（V8.35，2026-10-16 用户裁定"并行化落地产品能力"）：
// 会签型大评审（G5 发布准出类）自动拆解为 N 路交叉取证 + 单点终判。
// run20 实录：G5 fanfan 单档案串行 25min 未出判词 → 手工三路取证（wei 集成真值/
// qi 缺陷闭环/secops 安全条件，换域防自评）+fanfan 终判 → 10min 落判。
// 本件把该手法固化为产品编排：拆解模板→matrix 派发→子核回执收集→终判催办→超时升级。
// 开关：PARALLEL_REVIEW=off 旁路；随 pipeline 引擎启动（同 housekeeping 不需要——
// 由 REST /api/hermes/cluster-inspector/pipeline/review 触发一次性编排，状态持久化
// <home>/runtime/parallel-review-state.json，编排器每次触发后由巡检环接力收集）。

import { join } from 'node:path'

export interface ReviewLeg {
  /** 取证人档案名（matrix 后缀自动 -agent） */
  reviewer: string
  /** 取证面描述（派发词内嵌） */
  facet: string
  /** 回执前缀（收集判定） */
  receiptPrefix: string
  /** 回执行（收集到后填） */
  receipt?: string
  dispatchedAt?: number
  receiptAt?: number
}

export interface ReviewOrchestration {
  id: string
  /** 终判人（判词单源） */
  finalJudge: string
  /** 判词前缀（如 READY-GATE） */
  verdictPrefix: string
  legs: ReviewLeg[]
  createdAt: number
  /** done=终判行已收集 */
  status: 'dispatched' | 'collecting' | 'done'
  finalVerdict?: string
}

export interface OrchestratorDeps {
  home?: string
  /** 持久化路径注入（测试隔离；缺省 <home>/runtime/parallel-review-state.json） */
  stateFile?: string
  room?: string
  send?: (body: string, mentions: string[]) => Promise<string | undefined>
  now?: () => number
}

/** G5 发布准出拆解模板（run20 实录固化；扩展点：G2/安全复审同构接入） */
export function g5LegsTemplate(): Omit<ReviewLeg, 'dispatchedAt' | 'receiptAt'>[] {
  return [
    { reviewer: 'wei', facet: '集成真值：origin/feat/DEV-* 六条 tip、origin/integration 内容级与对象级状态、test/* 测试分支 tip——一句话状态附锚', receiptPrefix: 'G5-SUB-INT' },
    { reviewer: 'qi', facet: '缺陷闭环：DEF-* 卡全链状态与修复提交锚可查——已闭环数附锚', receiptPrefix: 'G5-SUB-DEF' },
    { reviewer: 'secops', facet: '安全条件：SECURITY-COND 条目逐条闭合态（已闭合/随发布跟踪）', receiptPrefix: 'G5-SUB-SEC' },
  ]
}

export class ParallelReviewOrchestrator {
  private stateFile: string | null = null
  private active: ReviewOrchestration | null = null
  constructor(private readonly deps: OrchestratorDeps = {}) {}

  private get room(): string { return this.deps.room ?? process.env.CLUSTER_INSPECTOR_NUDGE_ROOM ?? '' }
  private get now(): number { return this.deps.now?.() ?? Date.now() }

  private load(): void {
    if (!this.stateFile) return
    try {
      const { readFileSync } = require('node:fs') as typeof import('node:fs')
      this.active = JSON.parse(readFileSync(this.stateFile, 'utf-8')) as ReviewOrchestration | null
    } catch { this.active = null }
  }

  private persist(): void {
    if (!this.stateFile) return
    try {
      const { writeFileSync } = require('node:fs') as typeof import('node:fs')
      writeFileSync(this.stateFile, JSON.stringify(this.active, null, 1))
    } catch { /* fail-soft */ }
  }

  /** 发起编排：派发全部子核 + 预告终判人。已在进行=幂等返回当前态。 */
  async start(reviewId: string, finalJudge: string, verdictPrefix: string, legs: ReviewLeg[]): Promise<ReviewOrchestration | string> {
    if (process.env.PARALLEL_REVIEW === 'off') return 'off'
    this.initStateFile()
    this.load()
    if (this.active && this.active.status !== 'done') return this.active
    const send = this.deps.send
    if (!send || !this.room) return 'send-channel-unavailable'
    require('node:fs').appendFileSync('/tmp/pr-dbg.txt', `DBG2 legs=${legs?.length} send=${typeof send} active=${JSON.stringify(this.active)?.slice(0,60)}
`)
    const orch: ReviewOrchestration = {
      id: reviewId, finalJudge, verdictPrefix, legs, createdAt: this.now, status: 'dispatched',
    }
    for (const leg of legs) {
      require('node:fs').appendFileSync('/tmp/pr-dbg.txt', `DBG3 leg=${leg.reviewer}
`)
      leg.dispatchedAt = this.now
      await send(`【并行评审·${reviewId}】子核取证（5 分钟内回）：${leg.facet}。群回一行行首 ${leg.receiptPrefix} <结论一句话>。只取证不判——终判归 ${finalJudge}。`,
        [`@${leg.reviewer}-agent:matrix.test`])
    }
    await send(`【并行评审·${reviewId}】终判加速：${legs.map((l) => l.reviewer).join('/')} 三路取证已派出，全部 ${legs.map((l) => l.receiptPrefix).join('/')} 行落地后 5 分钟内出终判：行首 ${verdictPrefix}-PASS 或 ${verdictPrefix}-FAIL(缺项)。取证未到前可先核物料面。判词单源在你。`,
      [`@${finalJudge}-agent:matrix.test`])
    this.active = orch
    this.persist()
    return orch
  }

  /** 收集步（巡检环接力调用）：从房间消息扫子核回执/终判行。 */
  collect(roomLines: Array<{ body: string; ts: number }>): ReviewOrchestration | null {
    this.load()
    if (!this.active || this.active.status === 'done') return this.active
    for (const leg of this.active.legs) {
      if (leg.receipt) continue
      const hit = roomLines.find((l) => l.body.trimStart().startsWith(leg.receiptPrefix))
      if (hit) { leg.receipt = hit.body.slice(0, 200); leg.receiptAt = hit.ts }
    }
    const allLegs = this.active.legs.every((l) => l.receipt)
    const finalHit = roomLines.find((l) => l.body.trimStart().startsWith(`${this.active!.verdictPrefix}-PASS`) || l.body.trimStart().startsWith(`${this.active!.verdictPrefix}-FAIL`))
    if (finalHit) {
      this.active.finalVerdict = finalHit.body.slice(0, 200)
      this.active.status = 'done'
    } else if (allLegs) {
      this.active.status = 'collecting' // 全取证到齐——终判待出（催办由调用方 NUDGE 链负责点名 finalJudge）
    }
    this.persist()
    return this.active
  }

  status(): ReviewOrchestration | null { this.load(); return this.active }

  private initStateFile(): void {
    if (this.stateFile) return
    if (this.deps.stateFile) { this.stateFile = this.deps.stateFile; return }
    try {
      const home = this.deps.home ?? process.env.HERMES_HOME ?? require('node:os').homedir() + '/.hermes'
      const { mkdirSync } = require('node:fs') as typeof import('node:fs')
      mkdirSync(join(home, 'runtime'), { recursive: true })
      this.stateFile = join(home, 'runtime', 'parallel-review-state.json')
    } catch { /* fail-soft */ }
  }
}

export const parallelReview = new ParallelReviewOrchestrator()
