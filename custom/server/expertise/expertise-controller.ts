// overlay[expertise]: 协作画像「谁懂什么」REST（2026-10-23 天猫数字员工两文吸收轮）。
// 端点（只读、fail-soft；鉴权由上游 requireUserJwt 统一拦）：
//   GET /api/hermes/expertise/wall        —— 画像墙（人 × 概念 × 证据数 × 最近活跃）
//   GET /api/hermes/expertise/search?q=…  —— 概念检索 → 候选人按证据强度+新近度排序，每条挂可回查证据
// 文章锚点：协作篇 §6.3「问一句口径找谁，秒级命中概念、候选人按证据强度排序、每条带原文理由」。

import Router from '@koa/router'
import { observerSimRootOrNull, isValidRun, safeRunDir } from '../simcenter/observer-root'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { boardDbPaths, readBoard } from '../delivery/boards-reader'
import { ledgerTsToMs, parseLedgerTsv } from '../delivery/interventions'
import { buildWall, detectTermConflicts, evidenceFromBoard, evidenceFromLedger, searchExpertise, type EvidenceEntry } from './evidence'

const router = new Router({ prefix: '/api/hermes/expertise' })

function readTextIfExist(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null
  } catch {
    return null
  }
}

/** 证据集采集（纯读拼合）：推演台账 dispatch-preset + SIM 看板 slug/任务标题 */
export function collectEvidence(simRoot: string): { evidence: EvidenceEntry[]; sources: string[] } {
  const evidence: EvidenceEntry[] = []
  const sources: string[] = []
  // ① 推演台账：人在协作现场的话迹（from=<人>）
  try {
    const runsDir = resolve(simRoot, 'runs')
    for (const run of readdirSync(runsDir)) {
      if (!isValidRun(run)) continue
      const dir = safeRunDir(simRoot, run)
      if (!dir) continue
      const text = readTextIfExist(resolve(dir, 'evidence', 'compensation-ledger.tsv'))
      if (text == null) continue
      sources.push(`runs/${run}/evidence/compensation-ledger.tsv`)
      evidence.push(...evidenceFromLedger(parseLedgerTsv(text), run, ledgerTsToMs))
    }
  } catch { /* runs/ 缺席如实空证据 */ }
  // ②③ SIM 看板：slug 归属域 + 任务标题概念
  const home = resolve(simRoot, 'hermes')
  for (const { slug, dbPath } of boardDbPaths(home)) {
    const board = readBoard(slug, dbPath)
    if (!board.available) continue
    sources.push(`kanban/boards/${slug}/kanban.db`)
    evidence.push(...evidenceFromBoard({
      slug,
      tasks: board.tasks.map(t => ({ id: t.id, title: t.title, result: t.result, completedAt: t.completedAt, createdAt: t.createdAt })),
    }))
  }
  return { evidence, sources: [...new Set(sources)] }
}

function evidenceOrUnavailable(ctx: { status: number; body: unknown }): { evidence: EvidenceEntry[]; sources: string[] } | null {
  const simRoot = observerSimRootOrNull()
  if (!simRoot) {
    ctx.status = 200
    ctx.body = { available: false, reason: 'SIM 根缺席（OBS_SIM_ROOT 未配置且候选位全空）' }
    return null
  }
  return collectEvidence(simRoot)
}

// ── GET /wall ──
router.get('/wall', ctx => {
  const collected = evidenceOrUnavailable(ctx)
  if (!collected) return
  const wall = buildWall(collected.evidence)
  ctx.body = {
    available: true,
    persons: wall.persons.slice(0, 60),
    evidenceCount: wall.evidenceCount,
    conflicts: detectTermConflicts(collected.evidence),
    note: '证据=台账派发原话(from=人)+看板归属域+任务标题概念；聊天库无人类/AI 判别位不入源（D8）',
    sources: collected.sources,
  }
})

// ── GET /search?q=… ──
router.get('/search', ctx => {
  const q = typeof ctx.query.q === 'string' ? ctx.query.q : ''
  const query = q.trim().slice(0, 64)
  if (!query) {
    ctx.status = 400
    ctx.body = { ok: false, error: '缺少检索词（q）' }
    return
  }
  const collected = evidenceOrUnavailable(ctx)
  if (!collected) return
  const candidates = searchExpertise(collected.evidence, query)
  ctx.body = {
    available: true,
    query,
    candidates: candidates.slice(0, 10),
    formula: '评分=匹配概念证据数×2 + 新近度（30 天半衰）——排序用，非精确度量',
    sources: collected.sources,
  }
})

export { router as expertiseRouter }
