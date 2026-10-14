// overlay[expcandidates] 经验候选提取器（纯函数，2026-10-14 阿里调研轮 B1）。
// 输入=看板 task_events 归一行；输出=三类候选（带指纹，入库侧按指纹幂等去重）。
import type { CandidateType, EvidenceItem, ExpCandidate } from './exp-types'

/** 归一事件行（task_events 读取面产出；payload 已解析） */
export interface ExtractEventRow {
  taskId: string
  kind: 'column_transition' | 'gate_blocked' | 'gate_warning' | string
  /** column_transition 的流入列 */
  to?: string
  /** gate 事件的失败项 [{gate, ok, reason, detail}] */
  failures?: Array<{ gate: string; reason: string; detail?: string }>
  at: number
  seq: number
}

export interface ExtractedCandidate {
  type: CandidateType
  statement: string
  fingerprint: string
  evidence: EvidenceItem[]
}

export interface ExtractOptions {
  /** 反模式阈值：同 gate:reason 拦截次数 ≥ 该值出候选 */
  antipatternMinCount?: number
  /** 较优路径：卡跨度 ≤ 中位跨度 × 该系数 出候选 */
  goodPathRatio?: number
  /** 流程签名：相同路径被 ≥ 该值张卡采用出候选 */
  sopMinCards?: number
}

const DEFAULTS = { antipatternMinCount: 2, goodPathRatio: 0.7, sopMinCards: 2 }

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 三类候选提取主函数。 */
export function extractCandidates(events: ExtractEventRow[], opts: ExtractOptions = {}): ExtractedCandidate[] {
  const cfg = { ...DEFAULTS, ...opts }
  const out: ExtractedCandidate[] = []

  // ── antipattern：gate:reason 计数 ──
  const gateGroups = new Map<string, { count: number; evidence: EvidenceItem[] }>()
  for (const ev of events) {
    if (ev.kind !== 'gate_blocked' && ev.kind !== 'gate_warning') continue
    for (const f of ev.failures ?? []) {
      const key = `${f.gate}:${f.reason}`
      const g = gateGroups.get(key) ?? { count: 0, evidence: [] }
      g.count += 1
      if (g.evidence.length < 5) {
        g.evidence.push({ taskId: ev.taskId, note: `${ev.kind} ${f.gate}/${f.reason}${f.detail ? `：${f.detail.slice(0, 80)}` : ''}`, at: ev.at })
      }
      gateGroups.set(key, g)
    }
  }
  for (const [key, g] of gateGroups) {
    if (g.count >= cfg.antipatternMinCount) {
      out.push({
        type: 'antipattern',
        statement: `拦截反模式：${key} 在窗口内出现 ${g.count} 次——同类任务先备齐该闸要求（${g.evidence[0]?.note.split('：').slice(1).join('：') || '见证据'}）再提交，避免同坑重踩`,
        fingerprint: `antipattern:${key}`,
        evidence: g.evidence,
      })
    }
  }

  // ── 按任务重组（路径/跨度/拦截性） ──
  const byTask = new Map<string, ExtractEventRow[]>()
  for (const ev of events) {
    const list = byTask.get(ev.taskId) ?? []
    list.push(ev)
    byTask.set(ev.taskId, list)
  }
  interface CardView { taskId: string; path: string[]; spanSec: number; blocked: boolean; firstAt: number }
  const cards: CardView[] = []
  for (const [taskId, list] of byTask) {
    list.sort((a, b) => a.at - b.at || a.seq - b.seq)
    const path = list.filter((e) => e.kind === 'column_transition' && e.to).map((e) => e.to as string)
    const blocked = list.some((e) => e.kind === 'gate_blocked' || e.kind === 'gate_warning')
    const spanSec = list.length >= 2 ? Math.max(0, list[list.length - 1].at - list[0].at) : 0
    cards.push({ taskId, path, spanSec, blocked, firstAt: list[0].at })
  }

  // ── good_path：零拦截且跨度 ≤ 中位 × ratio，路径 ≥3 段 ──
  const spanMedian = median(cards.filter((c) => c.path.length >= 3).map((c) => c.spanSec))
  if (spanMedian != null && spanMedian > 0) {
    for (const c of cards) {
      if (!c.blocked && c.path.length >= 3 && c.spanSec > 0 && c.spanSec <= spanMedian * cfg.goodPathRatio) {
        out.push({
          type: 'good_path',
          statement: `较优路径：任务 ${c.taskId} 零拦截走完 ${c.path.join('→')}（${Math.round(c.spanSec / 60)} 分钟，中位 ${Math.round(spanMedian / 60)} 分钟）——可提炼为同类任务执行参照`,
          fingerprint: `good_path:${c.path.join('>')}`,
          evidence: [{ taskId: c.taskId, note: `零拦截通过 ${c.path.length} 段`, at: c.firstAt }],
        })
      }
    }
  }

  // ── sop：路径签名成组（≥sopMinCards 且含零拦截样本） ──
  const pathGroups = new Map<string, CardView[]>()
  for (const c of cards) {
    if (c.path.length < 2) continue
    const sig = c.path.join('>')
    const arr = pathGroups.get(sig) ?? []
    arr.push(c)
    pathGroups.set(sig, arr)
  }
  for (const [sig, group] of pathGroups) {
    const clean = group.filter((c) => !c.blocked)
    if (group.length >= cfg.sopMinCards && clean.length >= 1) {
      out.push({
        type: 'sop',
        statement: `同类流程候选：路径 ${sig} 被 ${group.length} 张卡采用（${clean.length} 张零拦截）——高频且走得通的路径，可固化为流程模板`,
        fingerprint: `sop:${sig}`,
        evidence: clean.slice(0, 5).map((c) => ({ taskId: c.taskId, note: '零拦截样本', at: c.firstAt })),
      })
    }
  }

  // good_path 与 sop 可能重复陈述同一路径——保留两者（视角不同：单卡快 vs 成组稳），
  // 指纹带类型前缀天然不互撞。
  return out
}

/** 入库映射（新候选默认 candidate 态）。 */
export function toCandidate(item: ExtractedCandidate, id: string, now: string): ExpCandidate {
  return {
    id, type: item.type, statement: item.statement, fingerprint: item.fingerprint,
    evidence: item.evidence, status: 'candidate', createdAt: now, updatedAt: now, injectedRuns: [],
  }
}
