// overlay[precedent]: 判例库检索（2026-10-23 挂账批 D18）。
// 文章口径（协作篇 §7.2 过程维度）：「类似需求怎么做的、这类单的基线是什么」——
// 判例库按需求聚合群看板轨迹与工单记录，接需求时检索类似判例当样板。
// AIStudio 落法：run 即判例单元。源=①活跃 runs/<id>/evidence（台账派发词+issues.log）
// ②归档 tar（archive/*/runs.tar：先列清单缓存、命中 run 后 tar -xOf 按需抽单文件，
// 不全量解压——NVMe 归档面体积可控纪律）。
// 检索词命中台账派发原文/问题行；命中卡={run, 派发词数, 问题/处置数, 命中片段(带锚点)}。

import Router from '@koa/router'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { observerSimRootOrNull, isValidRun } from '../simcenter/observer-root'
import { parseLedgerTsv } from '../delivery/interventions'

const router = new Router({ prefix: '/api/hermes/precedent' })

/** 子进程上限：列 tar 清单 10s / 4MB。 */
const TAR_OPTS = { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf-8' } as const

export interface PrecedentHit {
  run: string
  /** 源：active=活跃 runs 目录；archive=<归档批名> */
  origin: string
  dispatches: number
  issues: number
  disposals: number
  /** 命中片段（≤5，带可回查锚点） */
  matches: Array<{ text: string; anchor: string }>
}

function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function readTextIfExist(path: string): string | null {
  try { return existsSync(path) ? readFileSync(path, 'utf-8') : null } catch { return null }
}

/** issues.log 文本 → 问题/处置计数（ISSUE|/DISP| 行） */
export function countIssues(text: string | null): { issues: number; disposals: number } {
  if (!text) return { issues: 0, disposals: 0 }
  let issues = 0
  let disposals = 0
  for (const line of text.split('\n')) {
    if (/^ISSUE\|/.test(line.trim())) issues += 1
    else if (/^DISP\|/.test(line.trim())) disposals += 1
  }
  return { issues, disposals }
}

/** 单 run 判例抽取（活跃目录直读） */
export function precedentOfActiveRun(simRoot: string, run: string, query: string): PrecedentHit | null {
  const dir = resolve(simRoot, 'runs', run)
  const ledgerText = readTextIfExist(resolve(dir, 'evidence', 'compensation-ledger.tsv'))
  if (ledgerText == null) return null
  const rows = parseLedgerTsv(ledgerText)
  const dispatchRows = rows.filter(r => r.type === 'dispatch-preset')
  // issues.log 可能在 run 根或 evidence/（631 同款两处探测）
  const issuesText = readTextIfExist(resolve(dir, 'issues.log')) ?? readTextIfExist(resolve(dir, 'evidence', 'issues.log'))
  const { issues, disposals } = countIssues(issuesText)
  const q = query.toLowerCase()
  const matches: PrecedentHit['matches'] = []
  for (const r of rows) {
    const hay = `${r.detail} ${r.defect}`.toLowerCase()
    if (q && hay.includes(q)) {
      matches.push({ text: clip(r.detail, 90), anchor: r.id })
      if (matches.length >= 5) break
    }
  }
  return { run, origin: 'active', dispatches: dispatchRows.length, issues, disposals, matches }
}

/** 归档批清单（archive 各批 runs.tar；60s 进程内缓存——tar -tf 每批一次的成本控制） */
const tarListCache = new Map<string, { runs: string[]; at: number }>()
const TAR_LIST_TTL_MS = 60_000

export function tarRunsOf(tarPath: string, force = false): string[] {
  const hit = tarListCache.get(tarPath)
  if (!force && hit && Date.now() - hit.at < TAR_LIST_TTL_MS) return hit.runs
  let runs: string[] = []
  try {
    const out = execFileSync('tar', ['-tf', tarPath], TAR_OPTS) as unknown as string
    const names = new Set<string>()
    for (const line of out.split('\n')) {
      // 成员名形态：run/evidence/... 或 ./run/evidence/... 两种都试
      const m = /^\.?\/?([A-Za-z0-9_.-]+)\//.exec(line.trim())
      if (m && isValidRun(m[1])) names.add(m[1])
    }
    runs = [...names]
  } catch {
    runs = []
  }
  tarListCache.set(tarPath, { runs, at: Date.now() })
  return runs
}

/** 归档批内单 run 抽取：tar -xOf 按需读 evidence 两文件（不全量解压） */
export function precedentOfArchiveRun(tarPath: string, run: string, origin: string, query: string): PrecedentHit | null {
  const readFromTar = (member: string): string | null => {
    try {
      // member 名可能带 ./ 前缀——两种形态都试
      for (const cand of [member, `./${member}`]) {
        try {
          return execFileSync('tar', ['-xOf', tarPath, cand], TAR_OPTS) as unknown as string
        } catch { /* 形态不匹配继续 */ }
      }
      return null
    } catch { return null }
  }
  const ledgerText = readFromTar(`${run}/evidence/compensation-ledger.tsv`)
  if (ledgerText == null) return null
  const rows = parseLedgerTsv(ledgerText)
  const dispatchRows = rows.filter(r => r.type === 'dispatch-preset')
  const issuesText = readFromTar(`${run}/issues.log`) ?? readFromTar(`${run}/evidence/issues.log`)
  const { issues, disposals } = countIssues(issuesText)
  const q = query.toLowerCase()
  const matches: PrecedentHit['matches'] = []
  for (const r of rows) {
    if (q && `${r.detail} ${r.defect}`.toLowerCase().includes(q)) {
      matches.push({ text: clip(r.detail, 90), anchor: r.id })
      if (matches.length >= 5) break
    }
  }
  return { run, origin, dispatches: dispatchRows.length, issues, disposals, matches }
}

// ── GET /search?q=…（缺 q=返回 run 索引清单） ──
router.get('/search', ctx => {
  const simRoot = observerSimRootOrNull()
  if (!simRoot) {
    ctx.status = 200
    ctx.body = { available: false, reason: 'SIM 根缺席（OBS_SIM_ROOT 未配置且候选位全空）' }
    return
  }
  const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim().slice(0, 64) : ''
  const hits: PrecedentHit[] = []
  const sources: string[] = []
  // ① 活跃 runs
  try {
    const active = readdirSync(resolve(simRoot, 'runs')).filter(isValidRun)
    for (const run of active) {
      const hit = precedentOfActiveRun(simRoot, run, q)
      if (hit && (!q || hit.matches.length)) hits.push(hit)
    }
    if (active.length) sources.push(`runs/（活跃 ${active.length}）`)
  } catch { /* runs/ 缺席继续归档面 */ }
  // ② 归档 tar
  try {
    const archiveDir = resolve(simRoot, 'archive')
    if (existsSync(archiveDir)) {
      for (const batch of readdirSync(archiveDir)) {
        const tarPath = resolve(archiveDir, batch, 'runs.tar')
        if (!existsSync(tarPath)) continue
        const runs = tarRunsOf(tarPath)
        if (!runs.length) continue
        sources.push(`archive/${batch}/runs.tar（${runs.length} run）`)
        for (const run of runs) {
          const hit = precedentOfArchiveRun(tarPath, run, `archive/${batch}`, q)
          if (hit && (!q || hit.matches.length)) hits.push(hit)
        }
      }
    }
  } catch { /* 归档面读失败如实缺省 */ }
  hits.sort((a, b) => b.dispatches - a.dispatches || a.run.localeCompare(b.run))
  ctx.body = {
    available: true,
    query: q || null,
    runs: hits.length,
    hits: hits.slice(0, 30),
    note: '每轮推演算一个案例：派过什么活、出过什么问题、怎么收场的；老案例存在压缩包里，查到哪个读哪个',
    sources,
  }
})

export { router as precedentRouter }
