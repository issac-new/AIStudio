// overlay/custom/server/clusterinspector/profile-tool-usage.ts
// M6b teams 观测采集面（2026-10-16 安全轮，预警先行版）。
//
// 背景：安全检查 E1 判「部分符合」——审计账（toolpipeline/tool-hooks）只覆盖
// studio server ekko runtime；agent teams 是 hermes -p <profile> chat -q 的
// Python 子进程，不经过该链。teams 的工具调用事实在各 profile 的 state.db
// （messages.tool_calls JSON）。本模块把它采成巡检官可用的聚合面。
//
// 零阻断约束：只读采集（node:sqlite readOnly + mode=ro 语义），不写 profile
// 任何文件；单库失败 fail-soft 到 profile 粒度，不缺整面。
//
// 口径说明（两口径都出，对不上本身就是异常信号）：
//   口径 A（本模块用）：assistant 消息 tool_calls = 发起量
//   口径 B（未用）：role='tool' 结果消息 = 完成量（周报层面对账时另行统计）

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** 高危工具集（Python 侧与 ekko 侧两种拼写都收）——detectors.ts 的黑名单与
 *  时段高危判定共用此单一事实源（同域 import，不跨域） */
export const HIGH_RISK_TOOLS = new Set([
  'terminal', 'terminal_exec',
  'execute_code', 'code_exec',
  'delegate_task',
])

/** 非工作时段（本地小时，闭开区间）——E2 告警的 D12 判据 */
export const OFFHOURS_START = 0
export const OFFHOURS_END = 6

/** 敏感路径前缀（命中即计入敏感路径读取数；只扫调用参数，不扫结果） */
const SENSITIVE_PATH_RES: RegExp[] = [
  /\/etc\//,
  /\/private\/etc\//,
  /~\/\.ssh\//,
  /\/\.ssh\//,
  /\/root\//,
  /\/private\/var\/root\//,
]

/** 其他用户 home 判定（排除当前用户；macOS /Users/<name>，Linux /home/<name>） */
function otherUserHomeRe(me: string): RegExp | null {
  if (!me) return null
  const esc = me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`/(?:Users|home)/(?!${esc}(?:/|\\b))[^/\\s"']+`)
}

/** 单库聚合上限（防异常大库拖垮巡检轮） */
const MAX_DB_BYTES = 512 * 1024 * 1024

export interface ProfileToolUsageEntry {
  profile: string
  /** 近 1 小时发起量（口径 A） */
  total1h: number
  /** 近 24 小时发起量（口径 A） */
  total24h: number
  /** 近 24 小时高危工具发起量 */
  highRisk24h: number
  /** 近 24 小时非工作时段发起量（全量，含只读） */
  offhours24h: number
  /** 近 24 小时非工作时段的高危工具发起量（E2「0-6 时高危操作」判据的交集口径） */
  offhoursHighRisk24h: number
  /** 近 24 小时参数含敏感路径前缀的发起量 */
  sensitivePath24h: number
  /** 近 24 小时全量工具分布（按量降序；周报取前 10，检测器按策略自行筛） */
  perTool24h: Array<{ tool: string; n: number }>
  /** 单库读取失败原因（fail-soft：该 profile 缺数据，不影响其他） */
  error?: string
}

export interface ProfileToolUsageFace {
  ok: boolean
  error?: string
  nowMs: number
  entries: ProfileToolUsageEntry[]
}

interface ToolCallRow {
  tool: string
  args: string
  ts: number
}

function aggregate(profile: string, rows: ToolCallRow[], nowMs: number, me: string): ProfileToolUsageEntry {
  const cut1h = nowMs - 3600_000
  const cut24h = nowMs - 86_400_000
  const otherHome = otherUserHomeRe(me)
  const perTool = new Map<string, number>()
  const entry: ProfileToolUsageEntry = {
    profile,
    total1h: 0,
    total24h: 0,
    highRisk24h: 0,
    offhours24h: 0,
    offhoursHighRisk24h: 0,
    sensitivePath24h: 0,
    perTool24h: [],
  }
  for (const r of rows) {
    const tsMs = r.ts * 1000
    if (!Number.isFinite(tsMs) || tsMs < cut24h || tsMs > nowMs + 60_000) continue
    entry.total24h += 1
    if (tsMs >= cut1h) entry.total1h += 1
    const highRisk = HIGH_RISK_TOOLS.has(r.tool)
    if (highRisk) entry.highRisk24h += 1
    const hour = new Date(tsMs).getHours()
    const offhours = hour >= OFFHOURS_START && hour < OFFHOURS_END
    if (offhours) {
      entry.offhours24h += 1
      if (highRisk) entry.offhoursHighRisk24h += 1
    }
    const a = r.args ?? ''
    if (SENSITIVE_PATH_RES.some((re) => re.test(a)) || (otherHome && otherHome.test(a))) {
      entry.sensitivePath24h += 1
    }
    perTool.set(r.tool, (perTool.get(r.tool) ?? 0) + 1)
  }
  entry.perTool24h = [...perTool.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([tool, n]) => ({ tool, n }))
  return entry
}

function readProfileDb(dbPath: string, nowMs: number): ToolCallRow[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const cutoffSec = (nowMs - 86_400_000) / 1000
    const rows = db.prepare(
      `SELECT je.value ->> 'function' ->> 'name' AS tool,
              je.value ->> 'function' ->> 'arguments' AS args,
              m.timestamp AS ts
       FROM messages m, json_each(m.tool_calls) je
       WHERE m.role = 'assistant' AND m.tool_calls IS NOT NULL
         AND m.timestamp >= ?`,
    ).all(cutoffSec) as Array<{ tool: unknown; args: unknown; ts: unknown }>
    return rows
      .filter((r) => typeof r.tool === 'string' && r.tool)
      .map((r) => ({ tool: r.tool as string, args: typeof r.args === 'string' ? r.args : '', ts: Number(r.ts) }))
  } finally {
    try { db.close() } catch { /* 已关 */ }
  }
}

/** 采集面：逐 profile 只读聚合近 24 小时工具调用（含 1 小时窗口与高危/时段/敏感路径计数）。
 *  路径规律：<home>/profiles/<name>/state.db；根库 <home>/state.db 记为 default。 */
export function collectProfileToolUsage(deps: { hermesHome?: string; maxProfiles?: number; now?: () => number } = {}): ProfileToolUsageFace {
  const home = deps.hermesHome || process.env.HERMES_HOME || join(homedir(), '.hermes')
  const nowMs = deps.now?.() ?? Date.now()
  const cap = deps.maxProfiles ?? 60
  const face: ProfileToolUsageFace = { ok: false, nowMs, entries: [] }
  let me = ''
  try { me = homedir().split('/').pop() ?? '' } catch { /* userInfo 失败：其他用户判定退化为不判 */ }
  const targets: Array<{ profile: string; db: string }> = []
  try {
    const rootDb = join(home, 'state.db')
    if (existsSync(rootDb)) targets.push({ profile: 'default', db: rootDb })
    const dir = join(home, 'profiles')
    if (existsSync(dir)) {
      for (const name of readdirSync(dir).sort()) {
        if (targets.length >= cap) break
        const db = join(dir, name, 'state.db')
        if (existsSync(db)) targets.push({ profile: name, db })
      }
    }
  } catch (e) {
    face.error = (e as Error).message
    return face
  }
  for (const t of targets) {
    try {
      const st = statSync(t.db)
      if (st.size > MAX_DB_BYTES) {
        face.entries.push({ profile: t.profile, total1h: 0, total24h: 0, highRisk24h: 0, offhours24h: 0, offhoursHighRisk24h: 0, sensitivePath24h: 0, perTool24h: [], error: `db too large: ${st.size}B` })
        continue
      }
      face.entries.push(aggregate(t.profile, readProfileDb(t.db, nowMs), nowMs, me))
    } catch (e) {
      // 单库失败 fail-soft（WAL 只读打不开/库损坏）：该 profile 缺数据，其余照常
      face.entries.push({
        profile: t.profile, total1h: 0, total24h: 0, highRisk24h: 0, offhours24h: 0, offhoursHighRisk24h: 0, sensitivePath24h: 0, perTool24h: [],
        error: (e as Error).message.slice(0, 120),
      })
    }
  }
  face.ok = true
  return face
}
