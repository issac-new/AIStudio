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

// ---- 动作契约（第二期 ①）----

export interface ActionContract {
  id: string
  purpose: string
  input: string
  output: string
  errors: string[]
  verdictCarrier?: string
  verdictVocabulary?: string
  owner: string
  version: string
  changeNotice: string
  refs?: { file?: string; upstream?: string; note?: string }
}
export interface ContractsDoc {
  version: number
  reviewedAt: string
  contracts: ActionContract[]
}

/** upstream 根向上寻（overlay 仓内/主树/worktree 三形态兼容；最多 6 层）。 */
export function findUpstreamRoot(fromDir: string): string | null {
  let dir = resolve(fromDir)
  for (let i = 0; i <= 6; i++) {
    if (existsSync(resolve(dir, 'upstream', 'hermes-agent'))) return resolve(dir, 'upstream')
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function loadActionContracts(opts?: {
  fileExists?: (rel: string) => boolean
  upstreamExists?: (rel: string) => boolean
}): LoadResult<ContractsDoc> {
  const path = resolveGovFile('action-contracts.yaml')
  if (!path || !existsSync(path)) return { exists: false, path: null, doc: null, problems: ['action-contracts.yaml 未找到'] }
  let doc: ContractsDoc
  try {
    doc = loadYamlCached<ContractsDoc>('contracts', path)
  } catch (e) {
    return { exists: true, path, doc: null, problems: [`YAML 解析失败：${(e as Error).message}`] }
  }
  const fileExists = opts?.fileExists ?? ((rel: string) => existsSync(resolve(path, '../../..', rel)))
  const upstreamRoot = findUpstreamRoot(resolve(path, '../../..'))
  const upstreamExists = opts?.upstreamExists ?? ((rel: string) => upstreamRoot != null && existsSync(resolve(upstreamRoot, rel)))
  return { exists: true, path, doc, problems: validateContracts(doc, fileExists, upstreamExists) }
}

const ERROR_ID_RE = /^[a-z][a-z0-9_]*$/

export function validateContracts(
  doc: ContractsDoc,
  fileExists: (rel: string) => boolean,
  upstreamExists: (rel: string) => boolean,
): string[] {
  const problems: string[] = []
  if (!doc || typeof doc !== 'object') return ['契约注册表为空或非对象']
  if (doc.version !== 1) problems.push(`version 须为 1，实得 ${doc.version}`)
  if (!doc.reviewedAt || Number.isNaN(Date.parse(doc.reviewedAt))) problems.push('文件头 reviewedAt 缺失或不可解析')
  const ids = new Set<string>()
  for (const c of doc.contracts ?? []) {
    for (const f of ['id', 'purpose', 'input', 'output', 'owner', 'version', 'changeNotice'] as const) {
      if (!c[f]) problems.push(`contract ${c.id ?? '?'} 缺字段 ${f}`)
    }
    if (ids.has(c.id)) problems.push(`contract id 重复：${c.id}`)
    ids.add(c.id)
    if (!Array.isArray(c.errors) || c.errors.length === 0) {
      problems.push(`contract ${c.id} errors 须为非空数组`)
    } else {
      for (const e of c.errors) {
        if (!ERROR_ID_RE.test(e)) problems.push(`contract ${c.id} 错误 id 词法违规：${e}`)
      }
    }
    // 语义归一：凡产出判定的契约，判定词表必须归口 metrics.yaml（防第三套词表）
    if (c.verdictCarrier && c.verdictVocabulary !== 'metrics.yaml') {
      problems.push(`contract ${c.id} 有 verdictCarrier 但 verdictVocabulary≠metrics.yaml：${c.verdictVocabulary ?? '(缺)'}`)
    }
    if (c.refs?.file && !fileExists(c.refs.file)) problems.push(`contract ${c.id} refs.file 不存在：${c.refs.file}`)
    if (c.refs?.upstream && !upstreamExists(c.refs.upstream)) problems.push(`contract ${c.id} refs.upstream 不存在：${c.refs.upstream}`)
  }
  return problems
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
  // sloTargets（第二期 ③）：tier 限词表、successRate∈(0,1]、windowDays/minSamples 正整数、
  // budgetAction∈{warn,freeze}；freeze 档须为 core（防一般档误配硬冻结）。
  const sloTargets = (doc as { sloTargets?: Record<string, unknown> }).sloTargets
  if (sloTargets != null) {
    if (typeof sloTargets !== 'object' || Array.isArray(sloTargets)) {
      problems.push('sloTargets 须为对象')
    } else {
      for (const [tier, raw] of Object.entries(sloTargets)) {
        if (!LEDGER_SLO_TIERS.includes(tier as typeof LEDGER_SLO_TIERS[number])) problems.push(`sloTargets tier 越词表：${tier}`)
        const t = raw as { successRate?: unknown; windowDays?: unknown; minSamples?: unknown; budgetAction?: unknown }
        if (typeof t?.successRate !== 'number' || !(t.successRate > 0 && t.successRate <= 1)) problems.push(`sloTargets.${tier}.successRate 须 ∈ (0,1]`)
        if (!Number.isInteger(t?.windowDays) || (t.windowDays as number) <= 0) problems.push(`sloTargets.${tier}.windowDays 须为正整数`)
        if (!Number.isInteger(t?.minSamples) || (t.minSamples as number) <= 0) problems.push(`sloTargets.${tier}.minSamples 须为正整数`)
        if (!['warn', 'freeze'].includes(String(t?.budgetAction))) problems.push(`sloTargets.${tier}.budgetAction 越词表：${String(t?.budgetAction)}`)
        if (t?.budgetAction === 'freeze' && tier !== 'core') problems.push(`sloTargets.${tier} 配 freeze 越权：硬冻结仅 core 档可配`)
      }
    }
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

// ---- 状态-事件本体（第五期 ②）----

export interface StateModelTransition {
  id: string
  from: string
  to: string
  trigger: string
  rules: string[]
  actions: string[]
  evidence: string
  refs?: { file?: string; upstream?: string; note?: string }
}
export interface StateModelDoc {
  version: number
  reviewedAt: string
  object: string
  authority: string
  states: Array<{ id: string; semantics: string }>
  freeMoveStates?: string[]
  runOutcomeTerminal: Record<string, string>
  transitions: StateModelTransition[]
  eventSources: Array<{ id: string; authority: string; kind: string }>
}

/** upstream kanban_db.py 提取 VALID_STATUSES / _RUN_OUTCOME_TERMINAL_STATUS（事实面，不写死）。
 * 词表来源跨版本两形态：≤v2026.9.x 为 kanban_db.py 内字面量；v0.21.x 起 kanban_db 重构，
 * VALID_STATUSES 变为 `from ...kanban_workflow import DEFAULT_STATUSES as VALID_STATUSES`
 * （= DEFAULT_WORKFLOW 列词表 ∪ ARCHIVED）。两条路都解析，词表漂移即守门红。 */
export function extractKanbanStatusFacts(kanbanDbPath: string): {
  validStatuses: string[]
  runOutcomeTerminal: Record<string, string>
} | null {
  try {
    const src = readFileSync(kanbanDbPath, 'utf8')
    const om = src.match(/_RUN_OUTCOME_TERMINAL_STATUS\s*=\s*\{([^}]*)\}/)
    const runOutcomeTerminal: Record<string, string> = {}
    if (om) for (const m of om[1].matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g)) runOutcomeTerminal[m[1]] = m[2]
    const vm = src.match(/VALID_STATUSES\s*=\s*\{([^}]*)\}/)
    if (vm) {
      return { validStatuses: [...vm[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]), runOutcomeTerminal }
    }
    const im = src.match(/from\s+[\w.]*kanban_workflow\s+import\s+DEFAULT_STATUSES\s+as\s+VALID_STATUSES/)
    if (im) {
      const wfPath = resolve(kanbanDbPath, '..', 'kanban_workflow.py')
      const wf = readFileSync(wfPath, 'utf8')
      const start = wf.search(/^DEFAULT_WORKFLOW = Workflow\(/m)
      const end = wf.search(/^DEFAULT_STATUSES = /m)
      if (start >= 0 && end > start) {
        const block = wf.slice(start, end)
        const cols = [...block.matchAll(/Column\("([a-z_]+)"/g)].map((m) => m[1])
        const am = wf.match(/^ARCHIVED = "([a-z_]+)"$/m)
        if (cols.length && am) return { validStatuses: [...cols, am[1]], runOutcomeTerminal }
      }
    }
    return null
  } catch {
    return null
  }
}

function kanbanDbPathOf(): string | null {
  const root = findUpstreamRoot(resolve(__dirname))
  if (root) {
    const p = resolve(root, 'hermes-agent/hermes_cli/kanban_db.py')
    if (existsSync(p)) return p
  }
  // 测试/非常规部署：cwd 上寻
  let dir = process.cwd()
  for (let i = 0; i <= 6; i++) {
    const p = resolve(dir, 'upstream/hermes-agent/hermes_cli/kanban_db.py')
    if (existsSync(p)) return p
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function validateStateModel(doc: StateModelDoc, facts: { validStatuses: string[]; runOutcomeTerminal: Record<string, string> } | null, contractIds: Set<string>): string[] {
  const problems: string[] = []
  if (!doc || typeof doc !== 'object') return ['状态本体为空或非对象']
  if (doc.version !== 1) problems.push(`version 须为 1，实得 ${doc.version}`)
  if (!doc.reviewedAt || Number.isNaN(Date.parse(doc.reviewedAt))) problems.push('文件头 reviewedAt 缺失或不可解析')
  if (facts) {
    const declared = (doc.states ?? []).map((s) => s.id).sort()
    const actual = [...facts.validStatuses].sort()
    if (JSON.stringify(declared) !== JSON.stringify(actual)) {
      problems.push(`states 与 upstream VALID_STATUSES 不一致（kanban_db.py:103）：声明 ${declared.join(',')} / 实际 ${actual.join(',')}`)
    }
    const om = JSON.stringify(Object.entries(doc.runOutcomeTerminal ?? {}).sort())
    const am = JSON.stringify(Object.entries(facts.runOutcomeTerminal).sort())
    if (om !== am) problems.push(`runOutcomeTerminal 与 upstream _RUN_OUTCOME_TERMINAL_STATUS 不一致（kanban_db.py:2377）：声明 ${om} / 实际 ${am}`)
  }
  const stateIds = new Set((doc.states ?? []).map((s) => s.id))
  for (const t of doc.transitions ?? []) {
    for (const f of ['id', 'from', 'to', 'trigger', 'actions', 'evidence'] as const) {
      if (!t[f]) problems.push(`transition ${t.id ?? '?'} 缺字段 ${f}`)
    }
    if (t.from !== '*' && !stateIds.has(t.from)) problems.push(`transition ${t.id}.from 越状态词表：${t.from}`)
    if (!stateIds.has(t.to) && !(doc.runOutcomeTerminal ?? {})[Object.keys(doc.runOutcomeTerminal ?? {}).find((k) => doc.runOutcomeTerminal[k] === t.to) ?? '']) {
      // to 允许 states ∪ runOutcomeTerminal 值域（changes_requested 特例如实放行）
      const terminalValues = new Set(Object.values(doc.runOutcomeTerminal ?? {}))
      if (!terminalValues.has(t.to)) problems.push(`transition ${t.id}.to 越状态词表且非 run 终态值：${t.to}`)
    }
    for (const a of t.actions ?? []) {
      if (!contractIds.has(a)) problems.push(`transition ${t.id}.actions 引用不存在的动作契约：${a}`)
    }
  }
  for (const s of doc.freeMoveStates ?? []) {
    if (!stateIds.has(s)) problems.push(`freeMoveStates 越状态词表：${s}`)
  }
  return problems
}

export function loadStateModel(opts?: {
  facts?: { validStatuses: string[]; runOutcomeTerminal: Record<string, string> } | null
  contractIds?: Set<string>
}): LoadResult<StateModelDoc> {
  const path = resolveGovFile('state-model.yaml')
  if (!path || !existsSync(path)) return { exists: false, path: null, doc: null, problems: ['state-model.yaml 未找到'] }
  let doc: StateModelDoc
  try {
    doc = loadYamlCached<StateModelDoc>('stateModel', path)
  } catch (e) {
    return { exists: true, path, doc: null, problems: [`YAML 解析失败：${(e as Error).message}`] }
  }
  const kb = kanbanDbPathOf()
  const facts = opts?.facts !== undefined ? opts.facts : (kb ? extractKanbanStatusFacts(kb) : null)
  if (!facts && !opts?.facts) {
    return { exists: true, path, doc, problems: ['upstream kanban_db.py 不可达，词表一致性断言挂起（如实降级）'] }
  }
  const contracts = loadActionContracts()
  const contractIds = opts?.contractIds ?? new Set((contracts.doc?.contracts ?? []).map((c) => c.id))
  return { exists: true, path, doc, problems: validateStateModel(doc, facts, contractIds) }
}

// ---- ① 派单语义上下文（agent 消费本体的通道）----

/**
 * 为派单负载构建语义上下文块（fail-soft）：单元→能力→SLO 目标→判定词表。
 * 数据全部来自受守门的注册表（metrics sloTargets/ledger），非用户输入；任何一环
 * 缺席只降级对应行，不阻断派发。这是文章"Agent 消费本体"主张的最小落地通道。
 */
export function buildDispatchSemanticContext(specialistId: string): string | null {
  const ledger = loadCapabilityLedger()
  const metrics = loadMetricsDefs()
  const unit = ledger.doc?.units.find((u) => u.id === specialistId)
  if (!unit) return null
  const cap = ledger.doc?.capabilities.find((c) => c.id === unit.capability)
  const targets = (metrics.doc as { sloTargets?: Record<string, { successRate: number; windowDays: number; minSamples: number }> } | null)?.sloTargets
  const tgt = targets?.[unit.sloTier]
  const verdicts = (metrics.doc?.verdicts ?? []).map((v) => v.id).join('/')
  const lines = [`[语义上下文] 单元 ${unit.id}（${unit.kind}${unit.primary ? '·主承载' : ''}）`]
  if (cap) lines.push(`能力 ${cap.id} ${cap.name}（${cap.object}·${cap.action}，${ledger.doc?.domains.find((d) => d.id === cap.domain)?.name ?? ''}）`)
  if (tgt) lines.push(`SLO ${unit.sloTier} 档：成功率目标 ${(tgt.successRate * 100).toFixed(0)}%（窗口 ${tgt.windowDays}d，样本<${tgt.minSamples} 判定挂起）`)
  if (verdicts) lines.push(`判定词表 ${verdicts}（词面相似不构成判定依据，判定只认结构化 verdict；语义见 runtime/governance/metrics.yaml）`)
  return lines.join('\n')
}
