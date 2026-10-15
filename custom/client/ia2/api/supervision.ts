// overlay/custom/client/ia2/api/supervision.ts
// S2 监督面板与 S3 证据库数据面（B2 工单，R7/R10/R12——设计正本 §二）。
// 消费 X1 端点：GET /api/hermes/sim/journal（观察窗 journal 尾读）与
// GET /api/hermes/sim/anchor（四类锚识别反查）。纯函数层（journal 分窗组织）
// =单测锚点；fetch 层薄封装，失败抛错由调用方如实呈现。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像）──

export interface JournalLine {
  t: string
  run?: string
  ts?: string
  [k: string]: unknown
}

export interface JournalResponse {
  run: string
  tail: number
  count: number
  skippedBadLines: number
  lines: JournalLine[]
  source: string
}

export interface SupWindow {
  id: string
  startTs: string
  posture?: string
  rounds: number
  changedRounds: number
  gateEvents: number
  ledgerEvents: number
  tickets: number
  summary?: string
}

export interface OrganizedJournal {
  windows: SupWindow[]
  briefs: Array<{ ts: string; text: string }>
  verdicts: Array<{ ts: string; text: string }>
  tickets: Array<{ ts: string; pr: string; type: string; count: number; ticket: string }>
  unclassified: number
}

export type AnchorKind = 'event' | 'commit' | 'card' | 'room'

export interface AnchorResult {
  type: AnchorKind
  data?: unknown
  matches?: Array<{ run: string; key: string; value: string }>
  error?: string
}

// ── 纯函数层（测试锚点）──

/**
 * journal 尾行分窗组织（R10：主管不翻原始日志即可回答「卡在哪、谁没动」）。
 * 行形状锚=workflow-journal.ndjson 实物：window_start（开窗，带 posture/rounds/
 * interval_s）→ round（轮询：round/changed/gateEvent/ledgerEvent）→ window_end/
 * stall_verdict/situation_brief/defect_ticket。开窗前的游离行计入 unclassified
 * 不丢（如实计数）；窗未闭=进行中，无 summary。
 */
export function organizeJournal(lines: JournalLine[]): OrganizedJournal {
  const out: OrganizedJournal = { windows: [], briefs: [], verdicts: [], tickets: [], unclassified: 0 }
  let cur: SupWindow | null = null
  let seq = 0
  for (const ln of lines) {
    const ts = typeof ln.ts === 'string' ? ln.ts : ''
    switch (ln.t) {
      case 'window_start': {
        seq += 1
        cur = {
          id: `w${seq}`,
          startTs: ts,
          posture: typeof ln.posture === 'string' ? ln.posture : undefined,
          rounds: 0, changedRounds: 0, gateEvents: 0, ledgerEvents: 0, tickets: 0,
        }
        out.windows.push(cur)
        break
      }
      case 'round': {
        if (!cur) { out.unclassified += 1; break }
        cur.rounds += 1
        if (ln.changed === true) cur.changedRounds += 1
        if (ln.gateEvent === true) cur.gateEvents += 1
        if (ln.ledgerEvent === true) cur.ledgerEvents += 1
        break
      }
      case 'defect_ticket': {
        const row = {
          ts,
          pr: String(ln.pr ?? ''),
          type: String(ln.type ?? ''),
          count: Number(ln.count ?? 0),
          ticket: String(ln.ticket ?? ''),
        }
        out.tickets.push(row)
        if (cur) cur.tickets += 1
        else out.unclassified += 1
        break
      }
      case 'situation_brief': {
        out.briefs.push({ ts, text: String(ln.brief ?? ln.text ?? JSON.stringify(ln)) })
        if (!cur) out.unclassified += 1
        break
      }
      case 'stall_verdict': {
        const text = String(ln.verdict ?? ln.text ?? JSON.stringify(ln))
        out.verdicts.push({ ts, text })
        if (cur) cur.summary = text
        else out.unclassified += 1
        break
      }
      case 'window_end': {
        // 关窗行只在自带结论（reason/summary）或窗内尚无判词摘要时落摘要——
        // 不用泛化的「观察窗结束」覆盖窗内判词（判词是更强的结论信号）。
        if (cur) {
          const explicit = typeof ln.reason === 'string' ? ln.reason : typeof ln.summary === 'string' ? ln.summary : ''
          if (explicit || cur.summary === undefined) cur.summary = explicit || '观察窗结束'
        } else out.unclassified += 1
        break
      }
      default:
        out.unclassified += 1
    }
  }
  return out
}

// ── fetch 层（薄封装）──

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}${res.status === 404 || res.status === 400 ? `（${(await res.text()).slice(0, 120)}）` : ''}`)
  return res.json() as Promise<T>
}

export function fetchJournal(run: string, tail = 50): Promise<JournalResponse> {
  return getJson(`/api/hermes/sim/journal?run=${encodeURIComponent(run)}&tail=${tail}`)
}

export function fetchAnchor(id: string): Promise<AnchorResult> {
  return getJson(`/api/hermes/sim/anchor?id=${encodeURIComponent(id)}`)
}
