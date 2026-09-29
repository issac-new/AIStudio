/**
 * 4A 治理层装载与校验（能力台账 + 语义指标层）——spec §3.1/§3.2/§3.4。
 *
 * 定位：runtime/governance/*.yaml 是单一事实源（git 内、评审流写入）；本模块是
 * 唯一解析面——REST 投影与 vitest 守门共用 loadCapabilityLedger/loadMetricsDefs
 * 与 validate*，防"运行时一套口径、守门一套口径"的第二事实源。
 *
 * 路径解析沿用 resolveRosterFile（向上寻 runtime/，开发树与部署树同款先例）；
 * 读多写少，mtime 缓存（文件不变不重复解析）。文件缺失/坏文件如实返回
 * exists:false/problems，不编造内容（治理中心既有人格化约定）。
 */
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'
import { resolveRosterFile } from '../zcode/squad-protocol'

// ---- 冻结词表（改动=治理事件，须同步守门与视图）----
export const LEDGER_KINDS = ['lane-specialist', 'roster-role', 'squad', 'coding-agent', 'team', 'service'] as const
export const LEDGER_LIFECYCLES = ['introduced', 'active', 'sustaining', 'retire-candidate', 'retired'] as const
export const LEDGER_SLO_TIERS = ['core', 'important', 'general'] as const
/** skills 标签词法：对齐 matrix-teams/protocol.ts capability 约束（小写数字冒号连字符，≤64）。 */
export const SKILL_TAG_RE = /^[a-z0-9][a-z0-9:-]*$/
export const SKILL_TAG_MAX = 64
/** 保鲜阈值：reviewedAt 距今超此天数即入 warn 清单（对齐"90 天没人用就要评估"的复核节奏）。 */
export const STALE_DAYS = 90

export interface LedgerUnit {
  id: string
  capability: string
  primary: boolean
  kind: string
  owner: string
  lifecycle: string
  sloTier: string
  skills: string[]
  refs?: { file?: string; note?: string }
  reviewedAt: string
}
export interface LedgerCapability {
  id: string
  domain: string
  name: string
  object: string
  action: string
  importance: string
  maturity: string
}
export interface LedgerDoc {
  version: number
  reviewedAt: string
  domains: Array<{ id: string; name: string; owner: string }>
  capabilities: LedgerCapability[]
  units: LedgerUnit[]
}
export interface MetricsDoc {
  version: number
  reviewedAt: string
  verdicts: Array<{ id: string; label: string; semantics: string }>
  metrics: Array<{ id: string; name: string; formula: string; dimensions: string[]; permission: string; authority: string; status: string }>
}

function resolveGovFile(rel: string): string | null {
  // GOVERNANCE_DIR 覆盖优先（对齐 HERMES_COLUMNS_FILE/HERMES_SQUADS_FILE 先例）：
  // 测试、shim 走查与非常规部署下指向任意治理目录；未设时走 resolveRosterFile。
  const env = process.env.GOVERNANCE_DIR
  if (env) {
    const p = resolve(env, rel)
    if (existsSync(p)) return p
  }
  return resolveRosterFile(`governance/${rel}`) ?? null
}

interface CacheEntry<T> { mtimeMs: number; value: T }
const cache = new Map<string, CacheEntry<unknown>>()

function loadYamlCached<T>(fileKey: string, path: string): T {
  const mtimeMs = statSync(path).mtimeMs
  const cacheKey = `${fileKey}:${path}`
  const hit = cache.get(cacheKey)
  if (hit && hit.mtimeMs === mtimeMs) return hit.value as T
  // 与 column-automation.ts 同款动态 require（yaml 为既有传递依赖，对齐先例）。
  const { parse } = require('yaml') as typeof import('yaml')
  const value = parse(readFileSync(path, 'utf8')) as T
  cache.set(cacheKey, { mtimeMs, value })
  return value
}

export interface LoadResult<T> {
  exists: boolean
  path: string | null
  doc: T | null
  problems: string[]
}

export function loadCapabilityLedger(opts?: { fileExists?: (rel: string) => boolean }): LoadResult<LedgerDoc> {
  const path = resolveGovFile('capability-ledger.yaml')
  if (!path || !existsSync(path)) return { exists: false, path: null, doc: null, problems: ['capability-ledger.yaml 未找到'] }
  let doc: LedgerDoc
  try {
    doc = loadYamlCached<LedgerDoc>('ledger', path)
  } catch (e) {
    return { exists: true, path, doc: null, problems: [`YAML 解析失败：${(e as Error).message}`] }
  }
  const fileExists = opts?.fileExists ?? ((rel: string) => existsSync(resolve(path, '../../..', rel)))
  return { exists: true, path, doc, problems: validateLedger(doc, fileExists) }
}

export function loadMetricsDefs(): LoadResult<MetricsDoc> {
  const path = resolveGovFile('metrics.yaml')
  if (!path || !existsSync(path)) return { exists: false, path: null, doc: null, problems: ['metrics.yaml 未找到'] }
  let doc: MetricsDoc
  try {
    doc = loadYamlCached<MetricsDoc>('metrics', path)
  } catch (e) {
    return { exists: true, path, doc: null, problems: [`YAML 解析失败：${(e as Error).message}`] }
  }
  return { exists: true, path, doc, problems: validateMetrics(doc) }
}

// ---- 校验（守门与运行时共用；返回问题清单，空数组=通过）----

export function validateLedger(doc: LedgerDoc, fileExists: (rel: string) => boolean): string[] {
  const problems: string[] = []
  if (!doc || typeof doc !== 'object') return ['台账为空或非对象']
  if (doc.version !== 1) problems.push(`version 须为 1，实得 ${doc.version}`)
  if (!doc.reviewedAt || Number.isNaN(Date.parse(doc.reviewedAt))) problems.push('文件头 reviewedAt 缺失或不可解析')

  const domainIds = new Set<string>()
  for (const d of doc.domains ?? []) {
    if (!d.id || !d.name || !d.owner) problems.push(`domain 缺 id/name/owner：${JSON.stringify(d)}`)
    if (domainIds.has(d.id)) problems.push(`domain id 重复：${d.id}`)
    domainIds.add(d.id)
  }

  const capIds = new Set<string>()
  for (const c of doc.capabilities ?? []) {
    for (const f of ['id', 'domain', 'name', 'object', 'action'] as const) {
      if (!c[f]) problems.push(`capability ${c.id ?? '?'} 缺字段 ${f}`)
    }
    if (c.domain && !domainIds.has(c.domain)) problems.push(`capability ${c.id} 指向不存在的 domain：${c.domain}`)
    if (capIds.has(c.id)) problems.push(`capability id 重复：${c.id}`)
    capIds.add(c.id)
  }

  const unitIds = new Set<string>()
  const primaryByCap = new Map<string, string[]>()
  for (const u of doc.units ?? []) {
    for (const f of ['id', 'capability', 'kind', 'owner', 'lifecycle', 'sloTier', 'reviewedAt'] as const) {
      if (!u[f]) problems.push(`unit ${u.id ?? '?'} 缺字段 ${f}`)
    }
    if (unitIds.has(u.id)) problems.push(`unit id 重复：${u.id}`)
    unitIds.add(u.id)
    if (u.capability && !capIds.has(u.capability)) problems.push(`unit ${u.id} 指向不存在的 capability：${u.capability}`)
    if (u.kind && !LEDGER_KINDS.includes(u.kind as typeof LEDGER_KINDS[number])) problems.push(`unit ${u.id} kind 越词表：${u.kind}`)
    if (u.lifecycle && !LEDGER_LIFECYCLES.includes(u.lifecycle as typeof LEDGER_LIFECYCLES[number])) problems.push(`unit ${u.id} lifecycle 越词表：${u.lifecycle}`)
    if (u.sloTier && !LEDGER_SLO_TIERS.includes(u.sloTier as typeof LEDGER_SLO_TIERS[number])) problems.push(`unit ${u.id} sloTier 越词表：${u.sloTier}`)
    if (u.reviewedAt && Number.isNaN(Date.parse(u.reviewedAt))) problems.push(`unit ${u.id} reviewedAt 不可解析：${u.reviewedAt}`)
    for (const s of u.skills ?? []) {
      if (!SKILL_TAG_RE.test(s) || s.length > SKILL_TAG_MAX) problems.push(`unit ${u.id} skills 标签词法违规：${s}`)
    }
    if (u.refs?.file && !fileExists(u.refs.file)) problems.push(`unit ${u.id} refs.file 不存在：${u.refs.file}`)
    if (u.primary && u.capability) {
      const list = primaryByCap.get(u.capability) ?? []
      list.push(u.id)
      primaryByCap.set(u.capability, list)
    }
  }
  // 红线 1：一项能力只认一个主责（每个 L2 恰好一个 primary）
  for (const c of doc.capabilities ?? []) {
    const primaries = primaryByCap.get(c.id) ?? []
    if (primaries.length === 0) problems.push(`capability ${c.id} 无主承载（primary）`)
    if (primaries.length > 1) problems.push(`capability ${c.id} 主承载不唯一：${primaries.join(', ')}`)
  }
  return problems
}

export function validateMetrics(doc: MetricsDoc): string[] {
  const problems: string[] = []
  if (!doc || typeof doc !== 'object') return ['指标层为空或非对象']
  if (doc.version !== 1) problems.push(`version 须为 1，实得 ${doc.version}`)
  const verdictIds = new Set<string>()
  for (const v of doc.verdicts ?? []) {
    if (!v.id || !v.label || !v.semantics) problems.push(`verdict 缺 id/label/semantics：${JSON.stringify(v)}`)
    if (verdictIds.has(v.id)) problems.push(`verdict id 重复：${v.id}`)
    verdictIds.add(v.id)
  }
  const metricIds = new Set<string>()
  for (const m of doc.metrics ?? []) {
    for (const f of ['id', 'name', 'formula', 'dimensions', 'permission', 'authority'] as const) {
      if (!m[f]) problems.push(`metric ${m.id ?? '?'} 缺字段 ${f}`)
    }
    if (!Array.isArray(m.dimensions) || m.dimensions.length === 0) problems.push(`metric ${m.id} dimensions 须为非空数组`)
    if (m.status && !['live', 'defined'].includes(m.status)) problems.push(`metric ${m.id} status 越词表：${m.status}`)
    if (metricIds.has(m.id)) problems.push(`metric id 重复：${m.id}`)
    metricIds.add(m.id)
  }
  return problems
}

// ---- 派生统计（REST 投影与视图消费）----

export interface LedgerStats {
  counts: { domains: number; capabilities: number; units: number }
  byKind: Record<string, number>
  byLifecycle: Record<string, number>
  bySloTier: Record<string, number>
  stale: Array<{ id: string; reviewedAt: string; days: number }>
  primaryGaps: string[]
}

export function deriveLedgerStats(doc: LedgerDoc, now: number = Date.now()): LedgerStats {
  const byKind: Record<string, number> = {}
  const byLifecycle: Record<string, number> = {}
  const bySloTier: Record<string, number> = {}
  const stale: LedgerStats['stale'] = []
  for (const u of doc.units ?? []) {
    byKind[u.kind] = (byKind[u.kind] ?? 0) + 1
    byLifecycle[u.lifecycle] = (byLifecycle[u.lifecycle] ?? 0) + 1
    bySloTier[u.sloTier] = (bySloTier[u.sloTier] ?? 0) + 1
    const t = Date.parse(u.reviewedAt)
    if (!Number.isNaN(t)) {
      const days = Math.floor((now - t) / 86400000)
      if (days > STALE_DAYS) stale.push({ id: u.id, reviewedAt: u.reviewedAt, days })
    }
  }
  const primaryCaps = new Set((doc.units ?? []).filter((u) => u.primary).map((u) => u.capability))
  const primaryGaps = (doc.capabilities ?? []).filter((c) => !primaryCaps.has(c.id)).map((c) => c.id)
  return {
    counts: { domains: (doc.domains ?? []).length, capabilities: (doc.capabilities ?? []).length, units: (doc.units ?? []).length },
    byKind,
    byLifecycle,
    bySloTier,
    stale: stale.sort((a, b) => b.days - a.days),
    primaryGaps,
  }
}
