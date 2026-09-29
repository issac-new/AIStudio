/**
 * 需求变更治理存储层（/api/change-gov 的数据面）——调研落地轮 2026-09-29。
 *
 * 方法论来源：《研发总监怎么管需求变更：变更评审、影响评估、版本控制》
 * （战略研发领航 2026-08-31）三大失控根因 → 三治理动作的产品化：
 *   - 评审失序 → L1-L4 分级 + 决策时效（SLA，提交时刻起算）
 *   - 评估失真 → 五维度影响评估（进度/成本/范围/质量/风险，各 0-3 分）+ RACI
 *   - 版本失控 → 三级冻结窗口 + 冻结穿透拦截（L2 及以下批冻结内变更须显式 override）
 *
 * 存储：node:sqlite DatabaseSync（CJS 惰性 require，与 kanban-overview 同款）。
 * 库路径 CHANGE_GOV_DB 可覆写（测试/隔离走查用）；缺省 ~/.hermes-web-ui/change-governance.db。
 * 设计文档：docs/2026-09-29-change-gov-three-accounts-research.md §4.1。
 */
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, resolve } from 'path'

// ── 领域常量（client 经 GET /api/change-gov/meta 消费，不复制第二份）──

export interface ChangeLevelDef {
  level: number
  key: 'L1' | 'L2' | 'L3' | 'L4'
  name: string
  /** 决策时效（小时）：提交时刻起算 */
  slaHours: number
  /** 决策权（文章：L1-L4 分级，明确决策时效 + 牵头人） */
  authority: string
}

export const CHANGE_LEVELS: readonly ChangeLevelDef[] = [
  { level: 1, key: 'L1', name: '重大/紧急', slaHours: 24, authority: '研发总监' },
  { level: 2, key: 'L2', name: '重要', slaHours: 48, authority: '项目经理' },
  { level: 3, key: 'L3', name: '一般', slaHours: 120, authority: '模块负责人' },
  { level: 4, key: 'L4', name: '微小', slaHours: 168, authority: '组内备案' },
]

/** 五维度影响评估词表（文章：五维度评估，RACI 分工） */
export const IMPACT_DIMENSIONS = ['schedule', 'cost', 'scope', 'quality', 'risk'] as const
export type ImpactDimension = (typeof IMPACT_DIMENSIONS)[number]
export type ImpactScores = Record<ImpactDimension, number>

/** 管控基准（文章 §1.1 示例值的通用化：每指标 = 基准 + 两档判定） */
export interface ChangeBaselines {
  monthlyNewMax: number
  emergencyRatioMax: number
  overdueReviewRatioMax: number
  reworkHoursMax: number
  freezePenetrationMax: number
  firstPassRateMin: number
}
export const CHANGE_BASELINES: ChangeBaselines = {
  monthlyNewMax: 100,
  emergencyRatioMax: 0.2,
  overdueReviewRatioMax: 0.08,
  reworkHoursMax: 180,
  freezePenetrationMax: 0.05,
  firstPassRateMin: 0.8,
}

/** 三级冻结窗口（文章：三级冻结窗口，基线强绑定） */
export const FREEZE_TIERS: ReadonlyArray<{ tier: number; name: string }> = [
  { tier: 1, name: '需求冻结' },
  { tier: 2, name: '设计冻结' },
  { tier: 3, name: '代码冻结' },
]

export type ChangeStatus =
  | 'draft' | 'submitted' | 'approved' | 'rejected' | 'implemented' | 'withdrawn'

export interface ChangeRequest {
  id: string
  title: string
  description: string
  source: string
  board: string
  task_id: string
  level: number
  emergency: boolean
  /** 五维影响分（JSON 落库，出口还原） */
  impact: ImpactScores
  impact_total: number
  raci: { responsible?: string[]; approver?: string[]; consulted?: string[]; informed?: string[] }
  target_baseline: string
  status: ChangeStatus
  freeze_window_id: string | null
  freeze_violation: boolean
  freeze_overridden: boolean
  resubmit_count: number
  submitted_at: number | null
  deadline_at: number | null
  decided_at: number | null
  decider: string
  decision_note: string
  rework_hours: number
  created_at: number
  updated_at: number
}

export interface FreezeWindow {
  id: string
  name: string
  tier: number
  starts_at: number
  ends_at: number
  /** all 或看板 slug */
  scope: string
  active: boolean
  note: string
  created_at: number
}

// ── 库句柄（惰性单例；打开失败如实抛错由控制器转 503，不静默假装成功）──

let _db: any = null
let _dbError = ''

function dbPath(): string {
  const override = process.env.CHANGE_GOV_DB?.trim()
  if (override) return resolve(override)
  return resolve(homedir(), '.hermes-web-ui', 'change-governance.db')
}

function getDb(): any {
  if (_db) return _db
  if (_dbError) throw new Error(_dbError)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const p = dbPath()
    mkdirSync(dirname(p), { recursive: true })
    const db = new DatabaseSync(p)
    db.exec(`
      CREATE TABLE IF NOT EXISTS change_requests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        board TEXT NOT NULL DEFAULT '',
        task_id TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL,
        emergency INTEGER NOT NULL DEFAULT 0,
        impact TEXT NOT NULL,
        impact_total INTEGER NOT NULL DEFAULT 0,
        raci TEXT NOT NULL DEFAULT '{}',
        target_baseline TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        freeze_window_id TEXT,
        freeze_violation INTEGER NOT NULL DEFAULT 0,
        freeze_overridden INTEGER NOT NULL DEFAULT 0,
        resubmit_count INTEGER NOT NULL DEFAULT 0,
        submitted_at INTEGER,
        deadline_at INTEGER,
        decided_at INTEGER,
        decider TEXT NOT NULL DEFAULT '',
        decision_note TEXT NOT NULL DEFAULT '',
        rework_hours REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests(status);
      CREATE INDEX IF NOT EXISTS idx_cr_submitted ON change_requests(submitted_at);
      CREATE TABLE IF NOT EXISTS freeze_windows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tier INTEGER NOT NULL,
        starts_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        scope TEXT NOT NULL DEFAULT 'all',
        active INTEGER NOT NULL DEFAULT 1,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `)
    _db = db
    return db
  } catch (e) {
    _dbError = `变更治理库不可用: ${e instanceof Error ? e.message : String(e)}`
    throw new Error(_dbError)
  }
}

/** 测试隔离用：换 CHANGE_GOV_DB 后必须调本函数重开句柄 */
export function resetChangeGovDbForTest(): void {
  try { _db?.close?.() } catch { /* 已关/半开态忽略 */ }
  _db = null
  _dbError = ''
}

// ── 行 ↔ 领域对象 ──

function normalizeImpact(raw: unknown): ImpactScores {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as ImpactScores
  for (const d of IMPACT_DIMENSIONS) {
    const v = Number(src[d])
    out[d] = Number.isFinite(v) ? Math.max(0, Math.min(3, Math.round(v))) : 0
  }
  return out
}

function rowToRequest(r: any): ChangeRequest {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    source: r.source,
    board: r.board,
    task_id: r.task_id,
    level: r.level,
    emergency: !!r.emergency,
    impact: normalizeImpact(JSON.parse(r.impact || '{}')),
    impact_total: r.impact_total,
    raci: JSON.parse(r.raci || '{}'),
    target_baseline: r.target_baseline,
    status: r.status,
    freeze_window_id: r.freeze_window_id ?? null,
    freeze_violation: !!r.freeze_violation,
    freeze_overridden: !!r.freeze_overridden,
    resubmit_count: r.resubmit_count,
    submitted_at: r.submitted_at ?? null,
    deadline_at: r.deadline_at ?? null,
    decided_at: r.decided_at ?? null,
    decider: r.decider,
    decision_note: r.decision_note,
    rework_hours: r.rework_hours,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function rowToFreeze(r: any): FreezeWindow {
  return {
    id: r.id, name: r.name, tier: r.tier, starts_at: r.starts_at, ends_at: r.ends_at,
    scope: r.scope, active: !!r.active, note: r.note, created_at: r.created_at,
  }
}

// ── 冻结窗口 ──

export function listFreezeWindows(): FreezeWindow[] {
  const rows = getDb().prepare('SELECT * FROM freeze_windows ORDER BY created_at DESC').all()
  return rows.map(rowToFreeze)
}

/** 生效中的窗口：active 且 now ∈ [starts_at, ends_at]，scope 命中 board（all 通配） */
export function activeFreezeFor(board: string, now = Date.now()): FreezeWindow | null {
  const hit = listFreezeWindows().filter(
    (w) => w.active && now >= w.starts_at && now <= w.ends_at && (w.scope === 'all' || w.scope === board),
  )
  // 多窗口叠加取最严（tier 最大）
  if (!hit.length) return null
  return hit.reduce((a, b) => (b.tier > a.tier ? b : a))
}

export function createFreezeWindow(input: {
  name: string; tier: number; starts_at: number; ends_at: number; scope?: string; note?: string
}): FreezeWindow {
  if (!input.name?.trim()) throw new Error('窗口名不能为空')
  const tier = Math.max(1, Math.min(3, Math.round(Number(input.tier) || 1)))
  if (!(input.starts_at > 0) || !(input.ends_at > 0)) throw new Error('起止时间必须是 epoch 毫秒')
  if (input.ends_at <= input.starts_at) throw new Error('截止时间必须晚于开始时间')
  const db = getDb()
  const id = `fw-${new Date(input.starts_at).toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`
  const now = Date.now()
  db.prepare(
    'INSERT INTO freeze_windows (id, name, tier, starts_at, ends_at, scope, active, note, created_at) VALUES (?,?,?,?,?,?,?, ?,?)',
  ).run(id, input.name.trim(), tier, Math.round(input.starts_at), Math.round(input.ends_at),
    input.scope?.trim() || 'all', 1, input.note?.trim() || '', now)
  return rowToFreeze(db.prepare('SELECT * FROM freeze_windows WHERE id=?').get(id))
}

export function setFreezeActive(id: string, active: boolean): FreezeWindow {
  const db = getDb()
  const r = db.prepare('SELECT * FROM freeze_windows WHERE id=?').get(id)
  if (!r) throw new Error(`冻结窗口不存在: ${id}`)
  db.prepare('UPDATE freeze_windows SET active=? WHERE id=?').run(active ? 1 : 0, id)
  return rowToFreeze(db.prepare('SELECT * FROM freeze_windows WHERE id=?').get(id))
}

// ── 变更单 ──

export interface CreateChangeInput {
  title: string
  description?: string
  source?: string
  board?: string
  task_id?: string
  level?: number
  emergency?: boolean
  impact?: unknown
  raci?: unknown
  target_baseline?: string
}

/** 分级建议（文章：L1-L4 分级。紧急或高影响→L1；总分参与；最终人工裁定） */
export function suggestLevel(impactTotal: number, emergency: boolean): number {
  if (emergency || impactTotal >= 11) return 1
  if (impactTotal >= 8) return 2
  if (impactTotal >= 4) return 3
  return 4
}

function levelDef(level: number): ChangeLevelDef {
  const l = CHANGE_LEVELS.find((x) => x.level === level)
  if (!l) throw new Error(`非法变更级别: ${level}（合法 1-4）`)
  return l
}

function nextId(db: any): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM change_requests WHERE id LIKE ?',
  ).get(`cr-${day}-%`)
  return `cr-${day}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`
}

export function createRequest(input: CreateChangeInput): ChangeRequest {
  if (!input.title?.trim()) throw new Error('变更标题不能为空')
  const impact = normalizeImpact(input.impact)
  const impactTotal = IMPACT_DIMENSIONS.reduce((s, d) => s + impact[d], 0)
  const emergency = !!input.emergency
  const level = levelDef(Math.round(Number(input.level ?? suggestLevel(impactTotal, emergency)))).level
  const db = getDb()
  const now = Date.now()
  const id = nextId(db)
  db.prepare(`INSERT INTO change_requests
    (id, title, description, source, board, task_id, level, emergency, impact, impact_total,
     raci, target_baseline, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, input.title.trim(), input.description?.trim() || '', input.source?.trim() || '',
    input.board?.trim() || '', input.task_id?.trim() || '', level, emergency ? 1 : 0,
    JSON.stringify(impact), impactTotal,
    JSON.stringify(input.raci && typeof input.raci === 'object' ? input.raci : {}),
    input.target_baseline?.trim() || '', 'draft', now, now)
  return getRequest(id)
}

export function getRequest(id: string): ChangeRequest {
  const r = getDb().prepare('SELECT * FROM change_requests WHERE id=?').get(id)
  if (!r) throw new Error(`变更单不存在: ${id}`)
  return rowToRequest(r)
}

export function listRequests(filter: { status?: string; level?: number } = {}): ChangeRequest[] {
  const conds: string[] = []
  const args: unknown[] = []
  if (filter.status) { conds.push('status=?'); args.push(filter.status) }
  if (filter.level) { conds.push('level=?'); args.push(filter.level) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = getDb().prepare(
    `SELECT * FROM change_requests ${where} ORDER BY created_at DESC LIMIT 500`,
  ).all(...args)
  return rows.map(rowToRequest)
}

/** 草稿态可改的字段（已提交/已决的单走 decide/resubmit，不许直改） */
export function updateDraft(id: string, patch: Partial<CreateChangeInput>): ChangeRequest {
  const cur = getRequest(id)
  if (cur.status !== 'draft') throw new Error(`仅草稿态可编辑（当前 ${cur.status}）`)
  const impact = patch.impact !== undefined ? normalizeImpact(patch.impact) : cur.impact
  const impactTotal = IMPACT_DIMENSIONS.reduce((s, d) => s + impact[d], 0)
  const level = patch.level !== undefined ? levelDef(Math.round(Number(patch.level))).level : cur.level
  const db = getDb()
  db.prepare(`UPDATE change_requests SET title=?, description=?, source=?, board=?, task_id=?,
    level=?, emergency=?, impact=?, impact_total=?, raci=?, target_baseline=?, updated_at=?
    WHERE id=?`).run(
    patch.title?.trim() || cur.title,
    patch.description !== undefined ? patch.description : cur.description,
    patch.source !== undefined ? patch.source : cur.source,
    patch.board !== undefined ? patch.board : cur.board,
    patch.task_id !== undefined ? patch.task_id : cur.task_id,
    level, (patch.emergency !== undefined ? !!patch.emergency : cur.emergency) ? 1 : 0,
    JSON.stringify(impact), impactTotal,
    patch.raci !== undefined ? JSON.stringify(patch.raci) : JSON.stringify(cur.raci),
    patch.target_baseline !== undefined ? patch.target_baseline : cur.target_baseline,
    Date.now(), id)
  return getRequest(id)
}

/** 提交：进入评审。落 SLA 时限（决策时效）+ 冻结窗口穿透判定 */
export function submitRequest(id: string, now = Date.now()): ChangeRequest {
  const cur = getRequest(id)
  if (cur.status !== 'draft' && cur.status !== 'rejected') {
    throw new Error(`当前状态不可提交（${cur.status}）`)
  }
  const def = levelDef(cur.level)
  const deadline = now + def.slaHours * 3600_000
  const freeze = activeFreezeFor(cur.board, now)
  const db = getDb()
  db.prepare(`UPDATE change_requests SET status='submitted', submitted_at=?, deadline_at=?,
    freeze_window_id=?, freeze_violation=?, decided_at=NULL, decider='', decision_note='',
    updated_at=? WHERE id=?`).run(
    Math.round(now), Math.round(deadline),
    freeze ? freeze.id : null, freeze ? 1 : 0, Date.now(), id)
  return getRequest(id)
}

/** 驳回后重提：计 resubmit_count（一次通过率口径的数据底座） */
export function resubmitRequest(id: string, now = Date.now()): ChangeRequest {
  const cur = getRequest(id)
  if (cur.status !== 'rejected') throw new Error(`仅被驳回的单可重提（当前 ${cur.status}）`)
  const def = levelDef(cur.level)
  const deadline = now + def.slaHours * 3600_000
  const freeze = activeFreezeFor(cur.board, now)
  const db = getDb()
  db.prepare(`UPDATE change_requests SET status='submitted', submitted_at=?, deadline_at=?,
    resubmit_count=resubmit_count+1, freeze_window_id=?, freeze_violation=?, updated_at=?
    WHERE id=?`).run(
    Math.round(now), Math.round(deadline),
    freeze ? freeze.id : null, freeze ? 1 : 0, Date.now(), id)
  return getRequest(id)
}

export class FreezeGateError extends Error {
  constructor(public windowName: string, public tierName: string) {
    super(`冻结窗口拦截：${windowName}（${tierName}）生效中，L2 及以下变更批准需显式 override_freeze`)
  }
}

/** 决议：approve / reject。冻结穿透拦截（文章：版本闸门——变更不许无声穿透冻结窗口） */
export function decideRequest(id: string, input: {
  decision: 'approve' | 'reject'; decider: string; note?: string; override_freeze?: boolean
}, now = Date.now()): ChangeRequest {
  const cur = getRequest(id)
  if (cur.status !== 'submitted') throw new Error(`仅评审中可决议（当前 ${cur.status}）`)
  if (!input.decider?.trim()) throw new Error('决策人不能为空')
  if (input.decision !== 'approve' && input.decision !== 'reject') throw new Error('decision 仅 approve/reject')
  if (cur.freeze_violation && cur.level >= 2 && input.decision === 'approve' && !input.override_freeze) {
    const fw = cur.freeze_window_id ? listFreezeWindows().find((w) => w.id === cur.freeze_window_id) : null
    const tier = FREEZE_TIERS.find((t) => t.tier === (fw?.tier ?? 3))
    throw new FreezeGateError(fw?.name ?? '冻结窗口', tier?.name ?? '代码冻结')
  }
  const db = getDb()
  db.prepare(`UPDATE change_requests SET status=?, decided_at=?, decider=?, decision_note=?,
    freeze_overridden=?, updated_at=? WHERE id=?`).run(
    input.decision === 'approve' ? 'approved' : 'rejected',
    Math.round(now), input.decider.trim(), input.note?.trim() || '',
    cur.freeze_violation && input.override_freeze ? 1 : 0, Date.now(), id)
  return getRequest(id)
}

/** 实施登记：回填返工工时（管控基准指标"变更返工工时"的数据底座） */
export function implementRequest(id: string, reworkHours: number): ChangeRequest {
  const cur = getRequest(id)
  if (cur.status !== 'approved') throw new Error(`仅已批准可实施（当前 ${cur.status}）`)
  const h = Number(reworkHours)
  if (!Number.isFinite(h) || h < 0) throw new Error('返工工时必须 ≥0')
  const db = getDb()
  db.prepare(`UPDATE change_requests SET status='implemented', rework_hours=?, updated_at=? WHERE id=?`)
    .run(h, Date.now(), id)
  return getRequest(id)
}

// ── 管控基准指标（月度口径按 submitted_at 归集；文章 §1.1 实绩 vs 基准 vs 状态）──

export interface MetricCell {
  key: string
  actual: number
  baseline: number
  /** ok 基准内 / warn 超限 ≤1.25× / over 超限 >1.25×（下限型指标反向） */
  verdict: 'ok' | 'warn' | 'over'
  detail: string
}

export interface ChangeMetrics {
  month: string
  submittedInMonth: number
  metrics: MetricCell[]
}

function ratioVerdict(ratio: number, max: number): 'ok' | 'warn' | 'over' {
  if (ratio <= max) return 'ok'
  return ratio <= max * 1.25 ? 'warn' : 'over'
}
function floorVerdict(v: number, min: number): 'ok' | 'warn' | 'over' {
  if (v >= min) return 'ok'
  return v >= min * 0.7 ? 'warn' : 'over'
}

export function computeMetrics(month?: string, now = Date.now()): ChangeMetrics {
  const m = /^\d{4}-\d{2}$/.test(month ?? '')
    ? (month as string)
    : new Date(now).toISOString().slice(0, 7)
  const start = Date.parse(`${m}-01T00:00:00Z`)
  const end = Date.parse(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString())
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`非法月份: ${month}`)
  const rows = getDb().prepare(
    'SELECT * FROM change_requests WHERE submitted_at IS NOT NULL AND submitted_at>=? AND submitted_at<?',
  ).all(Math.round(start), Math.round(end))
  const items: ChangeRequest[] = rows.map(rowToRequest)
  const n = items.length
  const emergencyN = items.filter((x) => x.emergency).length
  const overdueN = items.filter((x) =>
    x.decided_at ? x.decided_at > (x.deadline_at ?? 0)
      : (x.status === 'submitted' && now > (x.deadline_at ?? 0)),
  ).length
  const freezeN = items.filter((x) => x.freeze_violation).length
  const decided = items.filter((x) => x.decided_at !== null && (x.status === 'approved' || x.status === 'rejected' || x.status === 'implemented'))
  const firstPass = decided.filter((x) => x.resubmit_count === 0 && x.status !== 'rejected').length
  // 返工工时按决议月归集（实施月无独立时间戳，decided_at 是最近的真实时刻）
  const reworkH = items.filter((x) => x.status === 'implemented').reduce((s, x) => s + (x.rework_hours || 0), 0)

  const b = CHANGE_BASELINES
  const emergencyRatio = n ? emergencyN / n : 0
  const overdueRatio = n ? overdueN / n : 0
  const freezeRatio = n ? freezeN / n : 0
  const firstPassRate = decided.length ? firstPass / decided.length : 1
  const metrics: MetricCell[] = [
    {
      key: 'monthlyNew', actual: n, baseline: b.monthlyNewMax, verdict: ratioVerdict(n, b.monthlyNewMax),
      detail: `当月提交 ${n} 单`,
    },
    {
      key: 'emergencyRatio', actual: emergencyRatio, baseline: b.emergencyRatioMax,
      verdict: ratioVerdict(emergencyRatio, b.emergencyRatioMax),
      detail: `${emergencyN}/${n} 紧急`,
    },
    {
      key: 'overdueReview', actual: overdueRatio, baseline: b.overdueReviewRatioMax,
      verdict: ratioVerdict(overdueRatio, b.overdueReviewRatioMax),
      detail: `${overdueN}/${n} 超决策时效`,
    },
    {
      key: 'reworkHours', actual: reworkH, baseline: b.reworkHoursMax,
      verdict: ratioVerdict(reworkH, b.reworkHoursMax),
      detail: `已实施单合计 ${Math.round(reworkH * 10) / 10}h`,
    },
    {
      key: 'freezePenetration', actual: freezeRatio, baseline: b.freezePenetrationMax,
      verdict: ratioVerdict(freezeRatio, b.freezePenetrationMax),
      detail: `${freezeN}/${n} 穿透冻结窗口`,
    },
    {
      key: 'firstPassRate', actual: firstPassRate, baseline: b.firstPassRateMin,
      verdict: floorVerdict(firstPassRate, b.firstPassRateMin),
      detail: decided.length ? `${firstPass}/${decided.length} 一次通过` : '当月无已决单',
    },
  ]
  return { month: m, submittedInMonth: n, metrics }
}

/** 元信息（前端渲染单一事实源：级别/SLA/维度/基准/冻结层级） */
export function changeGovMeta(): {
  levels: typeof CHANGE_LEVELS
  dimensions: readonly string[]
  baselines: ChangeBaselines
  freezeTiers: typeof FREEZE_TIERS
} {
  return { levels: CHANGE_LEVELS, dimensions: IMPACT_DIMENSIONS, baselines: CHANGE_BASELINES, freezeTiers: FREEZE_TIERS }
}
