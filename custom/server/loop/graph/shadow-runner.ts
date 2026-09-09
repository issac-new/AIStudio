// overlay/custom/server/loop/graph/shadow-runner.ts
// P1 Task 7 — 双跑（shadow）：legacy 为主，新引擎异步同输入执行、不写任何对外
// 副作用（dryRun deps）、事件写独立 shadow 日志，供 graph-shadow-report 对比一致率。

import { promises as fs } from 'fs'
import type { LoopInstance, LoopEvent } from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { GraphService } from './graph-service'
import type { EventLogStore, GraphLogEvent } from './event-log-store'
import type { CompileDeps } from './graph-compiler'
import { compileLoopToDef } from './graph-compiler'
import { appendContractsById } from './phase-nodes'
import { loopEventsToGraphEvents } from './loop-to-graph'
import { EVENT_KIND_MAP } from './graph-runtime'

export interface ShadowRunnerOpts {
  /** shadow 专用 GraphService（绑定 shadowEventLog） */
  graphService: GraphService
  eventLog: EventLogStore
  store: LoopStateStore
  /** engineDeps 由装配层注入；ShadowRunner 强制 dryRun=true（双跑护栏） */
  engineDeps: CompileDeps
  /** 对比报告 jsonl 路径（缺省不落盘，仅内存） */
  reportPath?: string
  intervalMs?: number
  log?: (msg: string) => void
}

export class ShadowRunner {
  private timer: NodeJS.Timeout | null = null
  private ticking = new Set<string>()
  private readonly dryDeps: CompileDeps
  private readonly log: (msg: string) => void

  constructor(private opts: ShadowRunnerOpts) {
    this.dryDeps = { ...opts.engineDeps, dryRun: true }
    this.log = opts.log ?? (() => {})
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.poll() }, this.opts.intervalMs ?? 30_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 与 RunSpawner.poll 同判据的到期扫描；shadow 只读 loop 状态，绝不写回 */
  async poll(): Promise<void> {
    const loops = await this.opts.store.listLoops()
    const now = Date.now()
    for (const loop of loops) {
      if (loop.status !== 'idle') continue
      if (!loop.nextTickAt) continue
      if (new Date(loop.nextTickAt).getTime() > now) continue
      if (this.ticking.has(loop.id)) continue
      this.ticking.add(loop.id)
      try {
        await this.runShadow(loop)
      } catch (err) {
        this.log(`shadow run failed for ${loop.id}: ${err instanceof Error ? err.message : err}`)
      } finally {
        this.ticking.delete(loop.id)
      }
    }
  }

  /** 同输入跑新引擎（dryRun），事件进 shadow 日志，报告追加一条 */
  async runShadow(loop: LoopInstance): Promise<{ runId: string } | null> {
    const def = compileLoopToDef(loop, this.dryDeps, { appendById: appendContractsById })
    this.opts.graphService.registerGraph(def)
    const { runId, instance } = await this.opts.graphService.startRun(def.id)
    const entry = {
      ts: new Date().toISOString(),
      loopId: loop.id, runId, graphId: def.id,
      status: instance.status,
      stopMet: instance.state.stopMet ?? null,
    }
    if (this.opts.reportPath) {
      await fs.appendFile(this.opts.reportPath, `${JSON.stringify(entry)}\n`, 'utf-8').catch(() => {})
    }
    return { runId }
  }
}

// ---------------------------------------------------------------------------
// 序列对比（E2E 验收 + graph-shadow-report.mjs 共用规则）
// ---------------------------------------------------------------------------

/** legacy 事件可比词汇表：五阶段节点级 node.completed（时间戳外的全部差异忽略）。
 *  排除项及理由：stage-transition=阶段记账（与任务级事件重复锚定）；
 *  run.started/run.completed=生命周期边界（legacy 的 created/completed 在 tick 之外，
 *  且 legacy tick 不必然 completed——stopMet 语义两代不同）；gate/stop-check=R3/P1 新能力。 */
const COMPARABLE_KINDS = new Set(['node.completed'])
const LEGACY_NODE_IDS = new Set(['discovery', 'handoff', 'validation', 'persistence'])

function kindOfGraphEvent(type: string): string {
  return (EVENT_KIND_MAP as Record<string, string>)[type] ?? type
}

/** legacy LoopEvent 序列 → 可比 kind 序列（经 loop-to-graph 投影 + kind 归一 + 词汇表过滤） */
export function legacyComparableKinds(events: LoopEvent[], loopId: string): string[] {
  return loopEventsToGraphEvents(
      events.filter(e => e.type !== 'loop.stage-transition'), loopId)
    .map(e => kindOfGraphEvent(e.type))
    .filter(k => COMPARABLE_KINDS.has(k))
}

/** 新引擎日志事件 → 可比 kind 序列（node.completed 带 nodeId 锚定，与 legacy 投影同键） */
export function shadowComparableKinds(events: GraphLogEvent[]): string[] {
  return events
    .filter(e => COMPARABLE_KINDS.has(e.kind))
    .filter(e => e.kind !== 'node.completed' || (e.nodeId && LEGACY_NODE_IDS.has(e.nodeId)))
    .map(e => (e.kind === 'node.completed' && e.nodeId ? `node.completed:${e.nodeId}` : e.kind))
}

/** 双序列一致率（0-1）。legacy 侧 node.completed 也带 nodeId 对齐。 */
export function compareEventSequences(
  legacyEvents: LoopEvent[],
  shadowEvents: GraphLogEvent[],
  loopId: string,
): { matchRate: number; legacy: string[]; shadow: string[] } {
  const legacy = loopEventsToGraphEvents(
      legacyEvents.filter(e => e.type !== 'loop.stage-transition'), loopId)
    .filter(e => COMPARABLE_KINDS.has(kindOfGraphEvent(e.type)))
    .map(e => {
      const kind = kindOfGraphEvent(e.type)
      return kind === 'node.completed' && 'nodeId' in e ? `node.completed:${e.nodeId}` : kind
    })
  const shadow = shadowComparableKinds(shadowEvents)
  const len = Math.max(legacy.length, shadow.length)
  if (len === 0) return { matchRate: 1, legacy, shadow }
  let matches = 0
  for (let i = 0; i < len; i++) {
    if (legacy[i] === shadow[i]) matches++
  }
  return { matchRate: matches / len, legacy, shadow }
}
