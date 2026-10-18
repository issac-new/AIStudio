// overlay/runmanifest 域：运行清单（2026-10-18 P1-3）。
//
// 源文《Harness Engineering 从零到生产》第八层：只保存最终回复无法调试 Agent；
// 至少要知道这次运行用的模型/参数/提示词版本/权限模式/预算。事故复盘时
// trace 能回答“调了什么工具”，但回答不了“当时用的是哪套提示词、哪个档位”。
//
// 形态：
// - 会话启动时由 chat-run 生产者（patch 661）落一行 JSONL；按 runId 幂等。
// - prompt 只存 SHA-1 指纹，不存正文（避免新的泄露面）。
// - 运行级成本由 trace 的 LLM span usage 汇总，用 tokens/pricing 估价；
//   未收录模型金额为 null（不瞎算）。
import { createHash } from 'crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { TOOL_CONTRACT_VERSION } from '../toolcontract/contract'
import { estimateCost } from '../tokens/pricing'
import type { TokenUsage } from '../tokens/meter-projections'

export interface RunManifest {
  runId: string
  sessionId: string
  userId?: string
  profileId: string
  model: string
  provider: string
  apiMode?: string
  reasoningEffort?: string
  /** 系统提示词指纹（sha1 前 16 位），不存正文。 */
  promptHash?: string
  /** 会话历史版本（storedSession.history_revision），用于回答“上下文是哪个版本”。 */
  contextRevision?: number
  permissionMode?: string
  toolContractVersion: string
  workspace?: string
  budget?: { tokenBudget?: number; wallClockBudgetSec?: number }
  startedAt: number
}

const RETAIN_DAYS = 14
let writeFailures = 0

export function runManifestDir(): string {
  const env = process.env.RUN_MANIFEST_DIR?.trim()
  if (env) return resolve(env)
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim() || process.env.HERMES_WEBUI_STATE_DIR?.trim()
  return webuiHome ? join(webuiHome, 'run-manifests') : join(homedir(), '.hermes-web-ui', 'run-manifests')
}

function dayStamp(ms = Date.now()): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function manifestFile(ms = Date.now()): string {
  return join(runManifestDir(), `run-manifests-${dayStamp(ms)}.jsonl`)
}

function prune(now = Date.now()): void {
  try {
    const dir = runManifestDir()
    if (!existsSync(dir)) return
    const cutoff = now - RETAIN_DAYS * 86_400_000
    for (const name of readdirSync(dir)) {
      const m = name.match(/^run-manifests-(\d{4})-(\d{2})-(\d{2})\.jsonl$/)
      if (!m) continue
      const at = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      if (Number.isFinite(at) && at < cutoff) {
        try { unlinkSync(join(dir, name)) } catch { /* 单文件失败跳过 */ }
      }
    }
  } catch { /* 清理失败不阻断 */ }
}

function readManifests(now = Date.now()): RunManifest[] {
  const cutoff = now - RETAIN_DAYS * 86_400_000
  const out: RunManifest[] = []
  try {
    const dir = runManifestDir()
    if (!existsSync(dir)) return out
    for (const name of readdirSync(dir)) {
      if (!/^run-manifests-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue
      try {
        for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
          if (!line) continue
          try {
            const m = JSON.parse(line) as RunManifest
            if (m?.runId && typeof m.startedAt === 'number' && m.startedAt >= cutoff) out.push(m)
          } catch { /* 坏行跳过 */ }
        }
      } catch { /* 单文件失败跳过 */ }
    }
  } catch { /* 目录不可读按空账 */ }
  return out
}

/** 记录运行清单（按 runId 幂等；写失败不阻断会话启动）。 */
export function recordRunManifest(input: Omit<RunManifest, 'toolContractVersion' | 'startedAt'> & {
  toolContractVersion?: string
  startedAt?: number
}): RunManifest {
  const full: RunManifest = {
    toolContractVersion: TOOL_CONTRACT_VERSION,
    startedAt: Date.now(),
    ...input,
  }
  try {
    const existing = readManifests().find((m) => m.runId === full.runId)
    if (existing) return existing
    mkdirSync(runManifestDir(), { recursive: true, mode: 0o700 })
    appendFileSync(manifestFile(full.startedAt), JSON.stringify(full) + '\n', { mode: 0o600 })
    if (Math.random() < 1 / 100) prune()
  } catch {
    writeFailures += 1
  }
  return full
}

export interface RunManifestQuery {
  days?: number
  limit?: number
  sessionId?: string
  runId?: string
}

export interface RunManifestQueryResult {
  entries: RunManifest[]
  total: number
  writeFailures: number
  windowDays: number
}

export function queryRunManifests(query: RunManifestQuery = {}, now = Date.now()): RunManifestQueryResult {
  const days = Math.min(90, Math.max(1, Math.round(query.days ?? 7)))
  const limit = Math.min(1_000, Math.max(1, Math.round(query.limit ?? 100)))
  const cutoff = now - days * 86_400_000
  const filtered = readManifests(now)
    .filter((m) => m.startedAt >= cutoff)
    .filter((m) => (query.sessionId ? m.sessionId === query.sessionId : true))
    .filter((m) => (query.runId ? m.runId === query.runId : true))
    .sort((a, b) => b.startedAt - a.startedAt)
  return {
    entries: filtered.slice(0, limit),
    total: filtered.length,
    writeFailures,
    windowDays: days,
  }
}

export function promptFingerprint(text: string): string {
  return createHash('sha1').update(String(text ?? '')).digest('hex').slice(0, 16)
}

export interface RunCost {
  runId: string
  sessionId: string
  model: string
  priced: boolean
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costIdleUsd: number | null
  costPeakUsd: number | null
  /** trace 文件是否存在（false=缺证据，不估算）。 */
  traceFound: boolean
}

export interface RunCostOptions {
  tracesDir?: string
  /** 只统计该时刻之后的 LLM span（缺省=manifest.startedAt）。 */
  since?: number
}

function tracesDirOf(opts: RunCostOptions = {}): string {
  if (opts.tracesDir) return resolve(opts.tracesDir)
  const env = process.env.HERMES_TRACES_DIR?.trim()
  return env ? resolve(env.replace(/^~/, homedir())) : join(homedir(), '.hermes', 'traces')
}

interface TraceLine {
  type?: string
  kind?: string
  model?: string
  started_at?: number
  ts?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  input_tokens?: number
  output_tokens?: number
}

/** 从 trace 汇总一次运行的 token 与估价。缺 trace/未收录模型如实返回 null。 */
export function runCostFromTrace(manifest: RunManifest, opts: RunCostOptions = {}): RunCost {
  const since = opts.since ?? manifest.startedAt
  const file = join(tracesDirOf(opts), `${manifest.sessionId}.jsonl`)
  const result: RunCost = {
    runId: manifest.runId,
    sessionId: manifest.sessionId,
    model: manifest.model,
    priced: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costIdleUsd: null,
    costPeakUsd: null,
    traceFound: false,
  }
  try {
    if (!existsSync(file)) return result
    result.traceFound = true
    // 同会话后续 run 的起点=本次统计上界（trace 无 run 边界，靠清单切窗）。
    const until = readManifests()
      .filter((m) => m.sessionId === manifest.sessionId && m.startedAt > manifest.startedAt)
      .sort((a, b) => a.startedAt - b.startedAt)[0]?.startedAt
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue
      let row: TraceLine
      try { row = JSON.parse(line) as TraceLine } catch { continue }
      if (row.type !== 'chunk' || row.kind !== 'llm_span') continue
      const at = typeof row.started_at === 'number' ? row.started_at : typeof row.ts === 'number' ? row.ts : null
      if (at != null && at < since) continue
      if (at != null && until != null && at >= until) continue
      const input = row.usage?.input_tokens ?? row.input_tokens ?? 0
      const output = row.usage?.output_tokens ?? row.output_tokens ?? 0
      if (Number.isFinite(input)) result.inputTokens += input
      if (Number.isFinite(output)) result.outputTokens += output
    }
    const usage: TokenUsage = {
      uncachedInput: result.inputTokens,
      output: result.outputTokens,
      cacheRead: 0,
      cacheWrite: 0,
    }
    const est = estimateCost(manifest.model, usage)
    if (est) {
      result.priced = true
      result.costIdleUsd = est.idleCost
      result.costPeakUsd = est.peakCost
    }
  } catch { /* 读取失败按缺证据 */ }
  return result
}

export function runManifestWriteFailures(): number {
  return writeFailures
}

/** 测试隔离。 */
export function _useRunManifestDirForTests(dir: string): void {
  process.env.RUN_MANIFEST_DIR = dir
}

/** 测试/诊断：直接覆盖 trace 目录。 */
export function _setTracesDirForTests(dir: string): void {
  process.env.HERMES_TRACES_DIR = dir
}

export function _resetRunManifestStateForTests(): void {
  writeFailures = 0
}

/** 运行清单总数（九层体检证据面）。 */
export function countRunManifests(days = 7): number {
  return queryRunManifests({ days, limit: 1 }).total
}

/** 最近一次运行（九层体检证据面）。 */
export function latestRunManifest(): RunManifest | null {
  return queryRunManifests({ days: 90, limit: 1 }).entries[0] ?? null
}

