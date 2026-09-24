// 证据与 Run 存储：.qgate/runs/<runId>.json + .qgate/evidence/<runId>/<evidenceId>.json
// + .qgate/state.json（每门最新判定索引）。JSONL/JSON 文件制（OD-002 裁定）。
// 本地执行数据默认 .gitignore（设计 §5.5）；Profile evidenceCommit 时的归档由调用方处理。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ── 脱敏（v0.1 §50）：Evidence/Run 落盘前打码 env 值与常见 secret 模式 ──
const SECRET_NAME_RE = /(api[_-]?key|token|secret|password|authorization|credential)["']?\s*[:=]\s*["']?([\w.\-+/=]{6,})/gi
function redactString(s: string): string {
  let out = s.replace(SECRET_NAME_RE, (_m, name: string) => `${name}=***REDACTED***`)
  // 环境变量值打码（防 token 经 env 泄入命令输出摘要）
  for (const v of Object.values(process.env)) {
    if (v && v.length >= 12 && out.includes(v)) out = out.split(v).join('***REDACTED***')
  }
  return out
}
function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v)
    return out
  }
  return value
}
/** 对外导出：证据与 run 落盘前的统一脱敏入口。 */
export function redactForStore<T>(value: T): T {
  return redactDeep(value) as T
}
import type { Evidence, ExceptionWaiver, GateRun, Risk } from './types.js'
import { parseEvidence, parseRun } from './parse.js'
import { globMatch } from './impact.js'

export interface StorePaths {
  runsDir: string
  evidenceDir: string
  risksDir: string
  /** qgate 根（exceptions/ 与 risks/ 同级）。 */
  qgateDir: string
  stateFile: string
}

export function storePaths(qgateDir: string): StorePaths {
  return {
    runsDir: join(qgateDir, 'runs'),
    evidenceDir: join(qgateDir, 'evidence'),
    risksDir: join(qgateDir, 'risks'),
    qgateDir,
    stateFile: join(qgateDir, 'state.json'),
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export function saveRun(paths: StorePaths, run: GateRun, evidence: readonly Evidence[]): void {
  writeJson(join(paths.runsDir, `${run.runId}.json`), redactForStore(run))
  for (const ev of evidence) {
    writeJson(join(paths.evidenceDir, run.runId, `${ev.id}.json`), redactForStore(ev))
  }
  // state 索引：同门取 startedAt 最新
  const state = readState(paths)
  const prev = state[run.gateId]
  if (!prev || prev.startedAt <= run.startedAt) {
    state[run.gateId] = { runId: run.runId, verdict: run.verdict, startedAt: run.startedAt, conditions: run.conditions }
    writeJson(paths.stateFile, state)
  }
}

interface StateEntry { runId: string; verdict: GateRun['verdict']; startedAt: number; conditions?: string[] }
type State = Record<string, StateEntry>

function readState(paths: StorePaths): State {
  try {
    const raw = JSON.parse(readFileSync(paths.stateFile, 'utf8'))
    return typeof raw === 'object' && raw !== null ? (raw as State) : {}
  } catch {
    return {}
  }
}

export function latestRuns(paths: StorePaths): Record<string, StateEntry> {
  return readState(paths)
}

export function loadRun(paths: StorePaths, runId: string): GateRun | null {
  try {
    return parseRun(JSON.parse(readFileSync(join(paths.runsDir, `${runId}.json`), 'utf8')))
  } catch {
    return null
  }
}

export function loadRunEvidence(paths: StorePaths, runId: string): Evidence[] {
  const dir = join(paths.evidenceDir, runId)
  if (!existsSync(dir)) return []
  const out: Evidence[] = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue
    try {
      const ev = parseEvidence(JSON.parse(readFileSync(join(dir, name), 'utf8')))
      if (ev) out.push(ev)
    } catch {
      /* 单文件坏不影响其余 */
    }
  }
  return out
}

export function saveRisk(paths: StorePaths, risk: Risk): void {
  writeJson(join(paths.risksDir, `${risk.id}.json`), risk)
}

// ── Exception / waiver（v0.1 §17：显式接受，必须可过期、可复验） ──

export function saveWaiver(paths: StorePaths, waiver: ExceptionWaiver): void {
  writeJson(join(paths.qgateDir, 'exceptions', `${waiver.id}.json`), waiver)
}

export function listWaivers(paths: StorePaths): ExceptionWaiver[] {
  const dir = join(paths.qgateDir, 'exceptions')
  if (!existsSync(dir)) return []
  const out: ExceptionWaiver[] = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>
      if (
        typeof raw.id === 'string' && typeof raw.gateId === 'string' &&
        typeof raw.reason === 'string' && typeof raw.approver === 'string' &&
        typeof raw.expiresAt === 'number' && typeof raw.createdAt === 'number'
      ) {
        out.push(raw as unknown as ExceptionWaiver)
      }
    } catch {
      /* skip */
    }
  }
  return out
}

/** 当前时刻仍有效的 waiver（过期即不算——Exception 不能永久隐藏 Risk）。 */
export function activeWaiverFor(paths: StorePaths, gateId: string, now = Date.now()): ExceptionWaiver | undefined {
  return listWaivers(paths)
    .filter((w) => w.gateId === gateId && w.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0]
}

export function listRisks(paths: StorePaths): Risk[] {
  if (!existsSync(paths.risksDir)) return []
  const out: Risk[] = []
  for (const name of readdirSync(paths.risksDir).sort()) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = JSON.parse(readFileSync(join(paths.risksDir, name), 'utf8'))
      if (raw && typeof raw === 'object' && typeof (raw as Risk).id === 'string') out.push(raw as Risk)
    } catch {
      /* skip */
    }
  }
  return out
}

/** 新鲜度（设计 §5.4）：同 treeHash 或（同 commit 且门适用路径与变更集不相交），且未超 maxAge。 */
export function isFresh(
  run: GateRun,
  now: number,
  ctx: { commit?: string; treeHash?: string; changedPaths: readonly string[]; appliesWhen?: { changed: { any?: string[]; all?: string[] } } },
  maxAgeHours = 24,
): boolean {
  const ageH = (now - run.startedAt) / 3_600_000
  if (ageH > maxAgeHours) return false
  if (ctx.treeHash && run.treeHash && ctx.treeHash === run.treeHash) return true
  if (ctx.commit && run.commit === ctx.commit) {
    if (!ctx.appliesWhen) return ctx.changedPaths.length === 0
    // 门适用路径与本次变更不相交 → 旧证据仍有效
    const pats = [...(ctx.appliesWhen.changed.any ?? []), ...(ctx.appliesWhen.changed.all ?? [])]
    if (pats.length === 0) return ctx.changedPaths.length === 0
    return !ctx.changedPaths.some((c) => pats.some((p) => globMatch(p, c)))
  }
  // 非 git 项目：时间锚之外无更强锚，变更集为空即视为仍新鲜
  if (!ctx.commit && !ctx.treeHash) return ctx.changedPaths.length === 0
  return false
}
