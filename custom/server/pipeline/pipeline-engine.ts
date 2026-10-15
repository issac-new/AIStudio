// overlay/custom/server/pipeline/pipeline-engine.ts
// 持续流水线引擎 v1（V8.33 四持续的产品化落地，2026-10-15 用户裁定）：
//   持续集成——分支 push origin 即触发域负责人评审合并令（不等全齐）
//   持续测试——分支落地即触发测试令（不等 devimpl_done）
//   状态机——dev → pushed → tested → merged（staged/released 留 v2）
//   持续改进——每跃迁耗时入账（dev_signal 完整版留 v2）
// 数据源=NUDGE_REPO 仓 git 只读查询（巡检官同源）；触发走 matrixSend（NUDGE 同链）。
// 开关：PIPELINE=off 关引擎；PIPELINE_TRIGGER=off 只报状态不发令（默认 off——run20
// 驱动在管，run21 起跑前开 on 实战）。持久化 <home>/runtime/pipeline-state.json。

import { join } from 'node:path'

export type PipelineStage = 'dev' | 'pushed' | 'tested' | 'merged'

export interface BranchFlow {
  branch: string
  stage: PipelineStage
  /** 各阶段进入时刻（epoch ms） */
  enteredAt: Record<string, number>
  domain: 'be' | 'fe'
  /** 本轮已派发的跃迁（节流键：`${branch}:${from}->${to}`），防重发 */
  dispatched: string[]
}

export interface PipelineDeps {
  repo?: string
  room?: string
  now?: () => number
  send?: (body: string, mentions: string[]) => Promise<string | undefined>
  log?: (msg: string) => void
}

const FE_BRANCH_RE = /(DEV-MP|cashier|fe)/i

function gitOk(repo: string, args: string[]): string | null {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    return execFileSync('git', ['-C', repo, ...args], { timeout: 10_000, encoding: 'utf-8' }) as string
  } catch { return null }
}

/** 采集分支事实：origin 可见性 / testlog 在案 / 已并 integration */
export function collectFacts(repo: string): Map<string, { pushed: boolean; tested: boolean; merged: boolean }> {
  const facts = new Map<string, { pushed: boolean; tested: boolean; merged: boolean }>()
  const local = (gitOk(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/feat/DEV-*']) ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean)
  const remote = new Set((gitOk(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/feat/DEV-*']) ?? '')
    .split('\n').map((s) => s.trim().replace(/^origin\//, '')).filter(Boolean))
  const integ = gitOk(repo, ['rev-parse', '--short', 'origin/integration/RFD-001'])
    ?? gitOk(repo, ['rev-parse', '--short', 'origin/integration'])
  for (const b of new Set([...local, ...remote])) {
    const pushed = remote.has(b)
    const tested = pushed && !!(gitOk(repo, ['ls-tree', '-r', `origin/${b}`, '--name-only']) ?? '').includes('testlog.txt')
    const merged = !!(pushed && integ && gitOk(repo, ['merge-base', '--is-ancestor', `origin/${b}`, 'origin/integration/RFD-001']) !== null)
      || !!(pushed && gitOk(repo, ['merge-base', '--is-ancestor', `origin/${b}`, 'origin/integration']) !== null)
    facts.set(b, { pushed, tested, merged })
  }
  return facts
}

/** 状态推演：按事实把 flow 推到最高可达阶段 */
function advance(flow: BranchFlow, fact: { pushed: boolean; tested: boolean; merged: boolean }, now: number): PipelineStage {
  let stage = flow.stage
  const enter = (s: PipelineStage) => { if (!(s in flow.enteredAt)) flow.enteredAt[s] = now; stage = s }
  if (fact.merged) enter('merged')
  else if (fact.tested) enter('tested')
  else if (fact.pushed) enter('pushed')
  else enter('dev')
  return stage
}

export class PipelineEngine {
  private readonly flows = new Map<string, BranchFlow>()
  private stateFile: string | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private readonly deps: PipelineDeps = {}) {}

  private get repo(): string { return this.deps.repo ?? process.env.CLUSTER_INSPECTOR_NUDGE_REPO ?? '' }
  private get room(): string { return this.deps.room ?? process.env.CLUSTER_INSPECTOR_NUDGE_ROOM ?? '' }
  private log(msg: string): void { (this.deps.log ?? ((m: string) => { console.error(`[pipeline] ${m}`) }))(msg) }

  private persist(): void {
    if (!this.stateFile) return
    try {
      const { writeFileSync } = require('node:fs') as typeof import('node:fs')
      writeFileSync(this.stateFile, JSON.stringify({ version: 1, flows: [...this.flows.values()], ts: Date.now() }, null, 1))
    } catch { /* fail-soft */ }
  }

  /** 一轮：采集→推演→触发（幂等，触发节流在 dispatched 集合） */
  async runOnce(): Promise<{ flows: BranchFlow[]; actions: string[] }> {
    const now = this.deps.now?.() ?? Date.now()
    const actions: string[] = []
    if (!this.repo) return { flows: [...this.flows.values()], actions: ['repo-unset'] }
    const facts = collectFacts(this.repo)
    for (const [branch, fact] of facts) {
      const flow = this.flows.get(branch) ?? {
        branch, stage: 'dev' as PipelineStage, enteredAt: { dev: now },
        domain: (FE_BRANCH_RE.test(branch) ? 'fe' : 'be') as 'fe' | 'be', dispatched: [],
      }
      const prev = flow.stage
      flow.stage = advance(flow, fact, now)
      this.flows.set(branch, flow)
      // —— 滚动触发（PIPELINE_TRIGGER=on 才发令；节流=同跃迁只派 1 次）——
      if (process.env.PIPELINE_TRIGGER === 'on' && this.deps.send && this.room) {
        if (prev === 'pushed' && flow.stage === 'pushed' && fact.pushed && !fact.tested) {
          const key = `${branch}:pushed->test`
          if (!flow.dispatched.includes(key)) {
            flow.dispatched.push(key)
            const tester = flow.domain === 'fe' ? 'fei-agent' : 'qi-agent'
            await this.deps.send(`【流水线·持续测试】feat/${branch.replace('feat/', '')} 已落地 origin，请立即跑该分支测试并回 TEST-RESULT-${branch}`, [`@${tester}:matrix.test`])
            actions.push(`dispatch-test:${branch}`)
          }
        }
        if (fact.tested && !fact.merged) {
          const key = `${branch}:test->merge`
          if (!flow.dispatched.includes(key)) {
            flow.dispatched.push(key)
            const lead = flow.domain === 'fe' ? 'mei-agent' : 'wei-agent'
            await this.deps.send(`【流水线·持续集成】feat/${branch.replace('feat/', '')} 测试证据已就绪，请评审合并入 integration 并回 INTEGRATED-${branch}`, [`@${lead}:matrix.test`])
            actions.push(`dispatch-merge:${branch}`)
          }
        }
      }
    }
    this.persist()
    return { flows: [...this.flows.values()], actions }
  }

  start(intervalMs = 60_000): void {
    if (process.env.PIPELINE === 'off' || this.timer) return
    try {
      const home = process.env.HERMES_HOME || require('node:os').homedir() + '/.hermes'
      const { mkdirSync } = require('node:fs') as typeof import('node:fs')
      const dir = join(home, 'runtime')
      mkdirSync(dir, { recursive: true })
      this.stateFile = join(dir, 'pipeline-state.json')
    } catch { /* 持久化 fail-soft */ }
    this.log(`引擎启动（interval=${intervalMs}ms trigger=${process.env.PIPELINE_TRIGGER ?? 'off'}）`)
    this.timer = setInterval(() => { void this.runOnce().catch(() => { /* fail-soft */ }) }, intervalMs)
    this.timer.unref()
  }

  status(): { flows: BranchFlow[]; trigger: string; ts: number } {
    return { flows: [...this.flows.values()], trigger: process.env.PIPELINE_TRIGGER ?? 'off', ts: Date.now() }
  }
}

export const pipelineEngine = new PipelineEngine()
