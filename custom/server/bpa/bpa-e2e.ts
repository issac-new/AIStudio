/**
 * 流程间关系面（bpa e2e）：文章三要素之末「谁驱动谁、谁支撑谁、输入输出怎么
 * 衔接」的机器化——端到端链路枚举 + 孤岛/环路检测。
 * 误区对照（文章 §7.4）：「客户从下订单到收货的完整链路被切成五段，谁都不对
 * 全程负责」→ 路径枚举让完整链路一眼可见；环路与孤岛就地显形。
 * 边语义：X → Y 当且仅当 Y ∈ X.supports（等价 X ∈ Y.drivers，两视图合并去重）。
 */
import type { BpaNode } from './bpa-types'

export interface E2ePath {
  /** 路径步骤（L3 编号，起点→终点序） */
  steps: string[]
  /** 逐跳交接物：hop i 的 output→input（缺交接物的跳记 null） */
  handoffs: Array<string | null>
}

export interface E2eReport {
  paths: E2ePath[]
  /** 有链路引用但不在任何 端到端 路径上的 L3（中途断头：只有入没有出或反之且非终点语义） */
  strandedL3: string[]
  /** 完全无链路引用的 L3（与治理规则 ORPHAN_L3 同口径） */
  unlinkedL3: string[]
  /** 参与环路的 L3（驱动/支撑成环——链路永远走不到终点） */
  cycleL3: string[]
}

const MAX_DEPTH = 12
const MAX_PATHS = 60

/** L3 邻接：id → 下游 id 有序表（supports/drivers 双视图合并，引用悬空跳过）。 */
export function downstreamAdjacency(l3s: BpaNode[]): Map<string, string[]> {
  const ids = new Set(l3s.map((n) => n.id))
  const adj = new Map<string, string[]>(l3s.map((n) => [n.id, []]))
  for (const n of l3s) {
    for (const s of n.supports ?? []) {
      if (ids.has(s) && !adj.get(n.id)!.includes(s)) adj.get(n.id)!.push(s)
    }
    for (const d of n.drivers ?? []) {
      // n 的上游 d 驱动 n：边 d → n
      if (ids.has(d) && !adj.get(d)!.includes(n.id)) adj.get(d)!.push(n.id)
    }
  }
  return adj
}

function handoffBetween(from: BpaNode, to: BpaNode): string | null {
  const outs = from.outputs ?? []
  const ins = to.inputs ?? []
  const hit = outs.find((o) => ins.includes(o))
  return hit ?? null
}

export function enumerateE2E(nodes: BpaNode[]): E2eReport {
  const l3s = nodes.filter((n) => n.level === 3)
  const byId = new Map(l3s.map((n) => [n.id, n]))
  const adj = downstreamAdjacency(l3s)
  const hasIncoming = new Set<string>()
  for (const [, outs] of adj) for (const o of outs) hasIncoming.add(o)

  // 起点=无上游；终点=无下游。无环保证 DFS 有界（环路节点单独报告）。
  // 环检测：DFS 三色标记
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>(l3s.map((n) => [n.id, WHITE]))
  const cycleL3 = new Set<string>()
  const dfsCycle = (u: string, stack: string[]): void => {
    color.set(u, GRAY)
    for (const v of adj.get(u) ?? []) {
      if (!byId.has(v)) continue
      if (color.get(v) === GRAY) {
        const from = stack.indexOf(v)
        for (const w of stack.slice(from >= 0 ? from : 0)) cycleL3.add(w)
        cycleL3.add(v)
      } else if (color.get(v) === WHITE) dfsCycle(v, [...stack, v])
    }
    color.set(u, BLACK)
  }
  for (const n of l3s) if (color.get(n.id) === WHITE) dfsCycle(n.id, [n.id])

  const paths: E2ePath[] = []
  const onAnyPath = new Set<string>()
  const dfsPath = (u: string, steps: string[]): void => {
    if (paths.length >= MAX_PATHS) return
    const outs = (adj.get(u) ?? []).filter((v) => byId.has(v) && !cycleL3.has(v))
    if (outs.length === 0) {
      if (steps.length >= 2) {
        const handoffs: Array<string | null> = []
        for (let i = 0; i + 1 < steps.length; i++) {
          const f = byId.get(steps[i])!, t = byId.get(steps[i + 1])!
          handoffs.push(handoffBetween(f, t))
        }
        paths.push({ steps: [...steps], handoffs })
        for (const s of steps) onAnyPath.add(s)
      }
      return
    }
    if (steps.length >= MAX_DEPTH) return
    for (const v of outs) {
      if (steps.includes(v)) continue // 双保险（成环数据已被滤，防重复边成环）
      dfsPath(v, [...steps, v])
    }
  }
  for (const n of l3s) {
    if (!hasIncoming.has(n.id) && !cycleL3.has(n.id)) dfsPath(n.id, [n.id])
  }

  // 链路归属按邻接度数判（supports/drivers 是同一边的两个视图，单看本节点字段会漏反向）
  const unlinkedL3 = l3s.filter((n) => (adj.get(n.id)?.length ?? 0) === 0 && !hasIncoming.has(n.id)).map((n) => n.id)
  const strandedL3 = l3s
    .filter((n) => ((adj.get(n.id)?.length ?? 0) > 0 || hasIncoming.has(n.id)) && !onAnyPath.has(n.id) && !cycleL3.has(n.id))
    .map((n) => n.id)

  return {
    paths: paths.sort((a, b) => b.steps.length - a.steps.length),
    strandedL3,
    unlinkedL3,
    cycleL3: [...cycleL3],
  }
}
