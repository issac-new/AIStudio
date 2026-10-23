// overlay[delivery]: 交付效能域 REST（2026-10-23 天猫数字员工两文吸收轮）。
// 端点（全部只读、fail-soft；鉴权由上游 requireUserJwt 统一拦 /api/*）：
//   GET /api/hermes/delivery/digest         —— 跨板交付日报（状态/趋势/卡点/评审老化/停滞候选/建议）
//   GET /api/hermes/delivery/matrix         —— C×L 效能画像矩阵（每格 需求数+平均介入次数）
//   GET /api/hermes/delivery/interventions?run=<id> —— 介入归因账本（六类+两层分账+风险信号；缺 run=全 run 聚合）
// 数据源：看板 sqlite（lean 只读器 boards-reader）+ 推演 run 台账/判词（simcenter 同源）。
// 归档 tar（NVMe）不在扫描面——sources 里如实注明。

import Router from '@koa/router'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { observerSimRootOrNull, isValidRun, safeRunDir } from '../simcenter/observer-root'
import { readAllBoards } from './boards-reader'
import { buildDigest, type DailyDigest } from './digest'
import { matrixOf, type DeliveryMatrix } from './matrix'
import {
  interventionsFromLedger,
  interventionsFromReleaseGate,
  interventionsFromUatVerdicts,
  interventionStats,
  parseLedgerTsv,
  riskSignals,
  type InterventionEntry,
  type UatVerdictLite,
} from './interventions'
import { MATURITY_LEVELS, assessMaturity } from './maturity'

const router = new Router({ prefix: '/api/hermes/delivery' })

function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function readTextIfExist(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null
  } catch {
    return null
  }
}

/** 看板数据根候选：显式 env 优先（测试/日常侧），否则 SIM 根 hermes/（推演侧） */
export function kanbanHomeCandidates(env: NodeJS.ProcessEnv, simRoot: string | null): string[] {
  const explicit = [env.DELIVERY_KANBAN_HOME, env.HERMES_KANBAN_HOME, env.HERMES_HOME]
    .map(v => (v ?? '').trim()).filter(Boolean)
  const sim = simRoot ? [resolve(simRoot, 'hermes')] : []
  return [...new Set([...explicit, ...sim])]
}

function resolveKanbanHome(): { home: string | null; tried: string[] } {
  const simRoot = observerSimRootOrNull()
  for (const p of kanbanHomeCandidates(process.env, simRoot)) {
    try {
      if (existsSync(resolve(p, 'kanban', 'boards')) || existsSync(resolve(p, 'boards')) || existsSync(resolve(p, 'kanban.db')) || existsSync(resolve(p, 'kanban', 'kanban.db'))) {
        return { home: p, tried: [] }
      }
    } catch { /* 候选缺席继续 */ }
  }
  return { home: null, tried: kanbanHomeCandidates(process.env, simRoot) }
}

/** run 目录列表（字符集校验；缺 runs/ 空数组） */
export function listRunDirs(simRoot: string): string[] {
  try {
    return readdirSync(resolve(simRoot, 'runs')).filter(isValidRun)
  } catch {
    return []
  }
}

function uatVerdictsOf(lines: string[]): UatVerdictLite[] {
  const out: UatVerdictLite[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      const ts = Date.parse(String(obj.ts ?? ''))
      out.push({
        ac: String(obj.ac ?? '?'),
        verdict: String(obj.verdict ?? ''),
        actor: String(obj.actor ?? 'unknown'),
        ts: Number.isFinite(ts) ? ts : 0,
      })
    } catch { /* 坏行跳过 */ }
  }
  return out
}

/** 单 run 介入账本（纯读拼合：台账 + G5 判词 + UAT 判词） */
export function interventionsOfRun(simRoot: string, run: string): { entries: InterventionEntry[]; autoApprove: number; sources: string[] } {
  const dir = safeRunDir(simRoot, run)
  if (!dir) return { entries: [], autoApprove: 0, sources: [] }
  const sources: string[] = []
  const entries: InterventionEntry[] = []
  let autoApprove = 0
  const ledgerText = readTextIfExist(resolve(dir, 'evidence', 'compensation-ledger.tsv'))
  if (ledgerText != null) {
    sources.push(`runs/${run}/evidence/compensation-ledger.tsv`)
    const r = interventionsFromLedger(parseLedgerTsv(ledgerText), run)
    entries.push(...r.entries)
    autoApprove += r.autoApprove
  }
  const gateText = readTextIfExist(resolve(dir, 'evidence', 'release-gate.jsonl'))
  if (gateText != null) {
    sources.push(`runs/${run}/evidence/release-gate.jsonl`)
    entries.push(...interventionsFromReleaseGate(gateText.split('\n'), run))
  }
  const uatText = readTextIfExist(resolve(dir, 'evidence', 'uat-verdicts.jsonl'))
  if (uatText != null) {
    sources.push(`runs/${run}/evidence/uat-verdicts.jsonl`)
    entries.push(...interventionsFromUatVerdicts(uatVerdictsOf(uatText.split('\n')), run))
  }
  return { entries, autoApprove, sources }
}

// ── GET /digest ──
router.get('/digest', ctx => {
  const { home, tried } = resolveKanbanHome()
  if (!home) {
    ctx.status = 200
    ctx.body = { available: false, reason: '看板数据根缺席', tried }
    return
  }
  const boards = readAllBoards(home)
  const digest: DailyDigest = buildDigest(
    boards.map(b => ({ slug: b.slug, available: b.available, tasks: b.tasks, events: b.events })),
    { nowSec: Math.floor(Date.now() / 1000) },
  )
  ctx.body = {
    available: true,
    digest,
    kanbanHome: home,
    boardErrors: boards.filter(b => !b.available).map(b => ({ slug: b.slug, error: b.error ?? 'unknown' })),
  }
})

// ── GET /matrix ──
router.get('/matrix', ctx => {
  const { home, tried } = resolveKanbanHome()
  if (!home) {
    ctx.status = 200
    ctx.body = { available: false, reason: '看板数据根缺席', tried }
    return
  }
  const boards = readAllBoards(home)
  const tasks = boards.filter(b => b.available).flatMap(b => b.tasks)
  const matrix: DeliveryMatrix = matrixOf(tasks)
  ctx.body = {
    available: true,
    matrix,
    kanbanHome: home,
    boards: boards.length,
    boardsAvailable: boards.filter(b => b.available).length,
    boardErrors: boards.filter(b => !b.available).map(b => ({ slug: b.slug, error: b.error ?? 'unknown' })),
  }
})

// ── GET /interventions?run=<id> ──
router.get('/interventions', ctx => {
  const simRoot = observerSimRootOrNull()
  if (!simRoot) {
    ctx.status = 200
    ctx.body = { available: false, reason: 'SIM 根缺席（OBS_SIM_ROOT 未配置且候选位全空）' }
    return
  }
  const runParam = typeof ctx.query.run === 'string' ? ctx.query.run.trim() : ''
  const runs = runParam ? [runParam] : listRunDirs(simRoot)
  if (runParam && !isValidRun(runParam)) {
    ctx.status = 400
    ctx.body = { ok: false, error: '非法 run 标识' }
    return
  }
  const entries: InterventionEntry[] = []
  const perRun: Array<{ run: string; count: number; autoApprove: number; sources: string[] }> = []
  const sources = new Set<string>()
  let autoApproveTotal = 0
  for (const run of runs) {
    const r = interventionsOfRun(simRoot, run)
    entries.push(...r.entries)
    autoApproveTotal += r.autoApprove
    for (const s of r.sources) sources.add(s)
    perRun.push({ run, count: r.entries.length, autoApprove: r.autoApprove, sources: r.sources })
  }
  entries.sort((a, b) => b.ts - a.ts)
  ctx.body = {
    available: true,
    scope: runParam || 'all',
    runsScanned: runs.length,
    note: '归档 tar 不在扫描面；auto-approve=系统代行计划内节点，不计介入（D3）',
    entries: entries.slice(0, 500),
    stats: interventionStats(entries),
    riskSignals: riskSignals(entries),
    meta: { autoApprove: autoApproveTotal, perRun },
    sources: [...sources],
  }
})

// ── GET /maturity（D17 协作成熟度三级读数；scope 同 interventions） ──
router.get('/maturity', ctx => {
  const simRoot = observerSimRootOrNull()
  if (!simRoot) {
    ctx.status = 200
    ctx.body = { available: false, reason: 'SIM 根缺席（OBS_SIM_ROOT 未配置且候选位全空）' }
    return
  }
  const runParam = typeof ctx.query.run === 'string' ? ctx.query.run.trim() : ''
  if (runParam && !isValidRun(runParam)) {
    ctx.status = 400
    ctx.body = { ok: false, error: '非法 run 标识' }
    return
  }
  const runs = runParam ? [runParam] : listRunDirs(simRoot)
  const entries: InterventionEntry[] = []
  let autoApprove = 0
  for (const run of runs) {
    const r = interventionsOfRun(simRoot, run)
    entries.push(...r.entries)
    autoApprove += r.autoApprove
  }
  ctx.body = {
    available: true,
    levels: MATURITY_LEVELS,
    assessment: assessMaturity(entries, autoApprove),
    scope: runParam || 'all',
  }
})

export { router as deliveryRouter }
