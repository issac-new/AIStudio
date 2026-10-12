// overlay/custom/server/tokens/runtime-ledger.ts
// 运行时效率机制账本（SoL-Pi 效能轮）：消费 hermes-agent 侧四类机制写入的
// efficiency/ledger.jsonl（tools/efficiency_ledger.py 追加的 JSONL 审计线）：
//   observation_archive 大观察归档（ObservationPack）、obs_recall 分页召回、
//   action_fusion 写后即验（then_run）、evidence_reduce 日志精简（收据制）。
// 本层只做读取与聚合投影；写侧在运行时，读侧在 studio——单一事实源=账本文件。
import { readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface LedgerEvent {
  ts: number
  kind: string
  tool?: string
  ref?: string
  outcome?: string
  exit_code?: number
  chars_original?: number
  chars_inline?: number
  chars_receipt?: number
  lines?: number
  duration_s?: number
  session_id?: string | null
  archive?: string
  command?: string
  [k: string]: unknown
}

export interface MechanismStats {
  count: number
  /** 归档/精简场景：原始字符数 - 进入上下文的字符数（正数=省）。 */
  charsSaved: number
  ran?: number
  skippedGuard?: number
  execError?: number
  failedRuns?: number
  reduced?: number
  passthrough?: number
  linesServed?: number
}

export interface RuntimeLedgerSummary {
  ok: boolean
  files: string[]
  totalEvents: number
  lastEventTs: number | null
  mechanisms: Record<'observation_archive' | 'obs_recall' | 'action_fusion' | 'evidence_reduce', MechanismStats>
  recent: LedgerEvent[]
  sessions: { sessionId: string; events: number }[]
}

/** 候选账本文件：默认 home + 多路 profile home（get_hermes_home 的 profile 覆盖形态）。 */
export function ledgerCandidateFiles(): string[] {
  const root = join(homedir(), '.hermes')
  const files = [join(root, 'efficiency', 'ledger.jsonl')]
  try {
    for (const dir of [join(root, 'profiles'), join(root, 'hermes-agent', 'profiles')]) {
      for (const name of readdirSync(dir)) {
        try {
          if (statSync(join(dir, name)).isDirectory()) {
            files.push(join(dir, name, 'efficiency', 'ledger.jsonl'))
          }
        } catch { /* 非目录跳过 */ }
      }
    }
  } catch { /* 无 profiles 目录：默认 home 单文件 */ }
  return files
}

/** 解析 JSONL 行（坏行跳过不炸——账本写入端 best-effort，读端同样容错）。 */
export function parseLedgerLines(text: string): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const ev = JSON.parse(s)
      if (ev && typeof ev === 'object' && typeof ev.kind === 'string') out.push(ev as LedgerEvent)
    } catch { /* 坏行丢弃 */ }
  }
  return out
}

const _zero = (): MechanismStats => ({ count: 0, charsSaved: 0 })

/** 事件流 → 四机制投影 + 最近事件 + 会话分布。纯函数（测试面）。 */
export function aggregateRuntimeLedger(
  events: LedgerEvent[], recentLimit = 30,
): Omit<RuntimeLedgerSummary, 'ok' | 'files'> {
  const mechanisms = {
    observation_archive: _zero(), obs_recall: _zero(),
    action_fusion: _zero(), evidence_reduce: _zero(),
  } as RuntimeLedgerSummary['mechanisms']
  for (const e of events) {
    if (!(e.kind in mechanisms)) continue
    const m = mechanisms[e.kind as keyof typeof mechanisms]
    m.count += 1
    if (e.kind === 'observation_archive') {
      m.charsSaved += Math.max(0, (e.chars_original ?? 0) - (e.chars_inline ?? 0))
    } else if (e.kind === 'evidence_reduce') {
      if (e.outcome === 'reduced') {
        m.reduced = (m.reduced ?? 0) + 1
        m.charsSaved += Math.max(0, (e.chars_original ?? 0) - (e.chars_receipt ?? 0))
      } else {
        m.passthrough = (m.passthrough ?? 0) + 1
      }
    } else if (e.kind === 'action_fusion') {
      if (e.outcome === 'ran') {
        m.ran = (m.ran ?? 0) + 1
        if (typeof e.exit_code === 'number' && e.exit_code !== 0) m.failedRuns = (m.failedRuns ?? 0) + 1
      } else if (e.outcome === 'skipped_guard') {
        m.skippedGuard = (m.skippedGuard ?? 0) + 1
      } else if (e.outcome === 'exec_error') {
        m.execError = (m.execError ?? 0) + 1
      }
    } else if (e.kind === 'obs_recall') {
      m.linesServed = (m.linesServed ?? 0) + (e.lines ?? 0)
    }
  }
  const sorted = [...events].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
  const bySession = new Map<string, number>()
  for (const e of events) {
    const sid = e.session_id || '(主会话未标注)'
    bySession.set(sid, (bySession.get(sid) ?? 0) + 1)
  }
  return {
    totalEvents: events.length,
    lastEventTs: sorted[0]?.ts ?? null,
    mechanisms,
    recent: sorted.slice(0, recentLimit),
    sessions: [...bySession.entries()]
      .map(([sessionId, n]) => ({ sessionId, events: n }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 8),
  }
}

/** 读候选文件并聚合（端点入口；文件缺失=零事件，不报错——机制惰性是常态）。 */
export function readRuntimeLedger(recentLimit = 30): RuntimeLedgerSummary {
  const files: string[] = []
  const events: LedgerEvent[] = []
  for (const f of ledgerCandidateFiles()) {
    try {
      const text = readFileSync(f, 'utf-8')
      files.push(f)
      events.push(...parseLedgerLines(text))
    } catch { /* 不存在/不可读：跳过 */ }
  }
  return { ok: true, files, ...aggregateRuntimeLedger(events, recentLimit) }
}
