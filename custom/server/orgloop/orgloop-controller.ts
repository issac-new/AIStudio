/**
 * 组织回路控制器（PR-5+PR-6，V8.29 治理轮）——闸修复状态机 + 受控合并流水线。
 *
 * PR-5 闸死锁处置通道：闸 FAIL→派修→复审→PASS 的状态机进产品（持久 JSON 台账，
 * <home>/runtime/orgloop-gate-repairs.json）。run20 G2 悬置 75 分钟+人工回滚 7 组
 * 闸键的根治面：闸 FAIL 的唯一出口=登记修复单并跟踪到复审 PASS，状态可查、悬置
 * 可见——拆闸式解锁从此有产品内正路。
 *   POST /api/hermes/orgloop/gate-repair { gate, fail_evidence, missing[] }
 *   POST /api/hermes/orgloop/gate-repair/:id/transition { to: repair_dispatched|re_review|pass|waived, note }
 *   GET  /api/hermes/orgloop/gate-repairs?status=open
 *
 * PR-6 合并流水线端点：受控合并执行面（POST /api/hermes/orgloop/merge-run）——
 * 参数=分支集/目标/策略；执行=git merge --no-ff 带 precheck（目标存在+禁强推）
 * 与日志留痕；fail-closed：ORGLOOP_REPO_ROOT 未配置即 503（生产不开 env 即关）。
 * V8.30 职责归位后驱动侧不再代做合并——本端点是兜底通道的产品化正身。
 *
 * 挂载：B 类 patch 636（bootstrap/routes.ts，同 631 模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const router = new Router({ prefix: '/api/hermes/orgloop' })

// ── PR-5：闸修复状态机 ──
const STATES = ['fail_registered', 'repair_dispatched', 're_review', 'pass', 'waived'] as const
type GateState = typeof STATES[number]
interface GateRepair { id: string; gate: string; state: GateState; ts: string; fail_evidence: string; missing: string[]; history: Array<{ ts: string; from: string; to: string; note: string }> }

function storeFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  const dir = resolve(home, 'runtime')
  return resolve(dir, 'orgloop-gate-repairs.json')
}
function loadAll(): GateRepair[] {
  const f = storeFile()
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf-8')) as GateRepair[] } catch { return [] }
}
function persist(all: GateRepair[]): void {
  const f = storeFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(all, null, 1), 'utf-8')
}

/** 状态迁移合法性（纯函数，测试面）：fail_registered→repair_dispatched→re_review→pass；
 * 任意态→waived（用户豁免）；pass/waived 为终态。 */
export function canTransition(from: GateState, to: GateState): boolean {
  if (from === 'pass' || from === 'waived') return false
  if (to === 'waived') return true
  const order: GateState[] = ['fail_registered', 'repair_dispatched', 're_review', 'pass']
  return order.indexOf(to) === order.indexOf(from) + 1
}

router.post('/gate-repair', (ctx: Context) => {
  const b = ctx.request.body as { gate?: unknown; fail_evidence?: unknown; missing?: unknown } | undefined
  const gate = typeof b?.gate === 'string' && /^(G[1-6]|UAT)$/i.test(b.gate) ? b.gate.toUpperCase() : ''
  if (!gate) { ctx.status = 400; ctx.body = { error: 'gate ∈ G1-G6|UAT' }; return }
  const rec: GateRepair = {
    id: `gr-${Date.now().toString(36)}`, gate, state: 'fail_registered', ts: new Date().toISOString(),
    fail_evidence: typeof b?.fail_evidence === 'string' ? b.fail_evidence.slice(0, 500) : '',
    missing: Array.isArray(b?.missing) ? (b!.missing as unknown[]).filter(m => typeof m === 'string').slice(0, 50) as string[] : [],
    history: [],
  }
  const all = loadAll(); all.push(rec); persist(all)
  ctx.body = rec
})

router.post('/gate-repair/:id/transition', (ctx: Context) => {
  const id = String(ctx.params.id)
  const b = ctx.request.body as { to?: unknown; note?: unknown } | undefined
  const to = String(b?.to ?? '') as GateState
  if (!(STATES as readonly string[]).includes(to)) { ctx.status = 400; ctx.body = { error: `to ∈ ${STATES.join('|')}` }; return }
  const all = loadAll()
  const rec = all.find(r => r.id === id)
  if (!rec) { ctx.status = 404; ctx.body = { error: 'repair record not found' }; return }
  if (!canTransition(rec.state, to)) { ctx.status = 409; ctx.body = { error: `illegal transition ${rec.state}→${to}` }; return }
  rec.history.push({ ts: new Date().toISOString(), from: rec.state, to, note: String(b?.note ?? '').slice(0, 300) })
  rec.state = to
  persist(all)
  ctx.body = rec
})

router.get('/gate-repairs', (ctx: Context) => {
  const status = String(ctx.query.status ?? 'all')
  const all = loadAll()
  ctx.body = { count: all.length,
    records: status === 'all' ? all : all.filter(r => r.state === status),
    open: all.filter(r => r.state !== 'pass' && r.state !== 'waived').length }
})

// ── PR-6：受控合并流水线 ──
function repoRoot(): string | null {
  const r = process.env.ORGLOOP_REPO_ROOT
  return r && existsSync(r) ? r : null
}

router.post('/merge-run', (ctx: Context) => {
  const root = repoRoot()
  if (!root) { ctx.status = 503; ctx.body = { error: 'orgloop merge 未配置（ORGLOOP_REPO_ROOT 缺席=fail-closed）' }; return }
  const b = ctx.request.body as { branches?: unknown; target?: unknown } | undefined
  const branches = Array.isArray(b?.branches) ? (b!.branches as unknown[]).filter(x => /^[A-Za-z0-9._\/-]{1,120}$/.test(String(x))).map(String) : []
  const target = typeof b?.target === 'string' && /^[A-Za-z0-9._\/-]{1,120}$/.test(b.target) ? b.target : ''
  if (branches.length === 0 || !target) { ctx.status = 400; ctx.body = { error: 'branches[] 与 target 必填（受控字符集）' }; return }
  const git = (args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', timeout: 120_000 })
  const log: string[] = []
  try {
    git(['fetch', 'origin'])
    // precheck：目标在远端在位（不造新基线）；禁强推由推送方式保证（普通 push）
    git(['rev-parse', '--verify', `origin/${target}`])
    git(['checkout', '-q', '-B', target, `origin/${target}`])
    const merged: string[] = [], skipped: string[] = []
    for (const br of branches) {
      if (git(['rev-parse', '--verify', `origin/${br}`]).trim()) {
        git(['merge', '--no-ff', `origin/${br}`, '-m', `merge: ${br} into ${target} (orgloop pipeline PR-6)`])
        merged.push(br); log.push(`merged ${br}`)
      } else { skipped.push(br); log.push(`skip ${br} (absent on origin)`) }
    }
    git(['push', '-q', 'origin', target])
    ctx.body = { ok: true, target, merged, skipped, log }
  } catch (exc) {
    try { git(['merge', '--abort']) } catch { /* nothing to abort */ }
    ctx.status = 500
    ctx.body = { ok: false, target, log, error: (exc as Error).message.slice(0, 300) }
  }
})

// ── X2：清偿门四端点（R6，设计正本 2026-10-16-design-derived-from-requirements §三）──
// 台账正身=evidence/compensation-ledger.tsv（方案 §2.6.5 单一事实源，本端点只读消费——
// 合并铁律：不复制写入语义）；resolve/waive 处置留痕存产品侧
// <home>/runtime/orgloop-clearance.json。ORGLOOP_LEDGER_TSV 缺席=503 fail-closed（N5）。
//   GET  /ledger                     台账全量+处置态合并视图（含 open 计数）
//   POST /clearance/resolve         {target, pr, commit}——无 PR 锚=400（判据=落码合入）
//   POST /clearance/waive           {target, reason}——无理由=400（用户批准理由强制）
//   GET  /clearance/check-clearance 开轮放行判定（open=0 才 pass——灯值唯一源）
const TARGET_RE = /^[A-Za-z0-9._-]{1,40}$/

/** 入参校验（纯函数，测试面）：resolve 无 PR 锚=invalid（判据=缺陷落码合入）。 */
export function validateResolve(body: unknown): { ok: true; target: string; pr: string; commit?: string } | { ok: false; error: string } {
  const b = body as { target?: unknown; pr?: unknown; commit?: unknown } | undefined
  const target = typeof b?.target === 'string' && TARGET_RE.test(b.target) ? b.target : ''
  const pr = typeof b?.pr === 'string' ? b.pr.trim() : ''
  if (!target) return { ok: false, error: 'target 必填（缺陷号或台账类型，受控字符集）' }
  if (!pr) return { ok: false, error: 'resolve 必须带 PR 锚（判据=缺陷落码合入，不是记了单）' }
  return { ok: true, target, pr: pr.slice(0, 80), commit: typeof b?.commit === 'string' ? b.commit.slice(0, 80) : undefined }
}

/** 入参校验（纯函数，测试面）：waive 无理由=invalid（用户批准理由强制）。 */
export function validateWaive(body: unknown): { ok: true; target: string; reason: string } | { ok: false; error: string } {
  const b = body as { target?: unknown; reason?: unknown } | undefined
  const target = typeof b?.target === 'string' && TARGET_RE.test(b.target) ? b.target : ''
  const reason = typeof b?.reason === 'string' ? b.reason.trim() : ''
  if (!target) return { ok: false, error: 'target 必填（缺陷号或台账类型，受控字符集）' }
  if (!reason) return { ok: false, error: 'waive 必须带理由（用户批准理由强制，禁静默豁免）' }
  return { ok: true, target, reason: reason.slice(0, 300) }
}

export interface LedgerEntry {
  id: string; ts: string; type: string; defect: string; detail: string; status: string; resolution: string
}

/** TSV→结构化（纯函数，测试面）。列序=id ts type defect detail status resolution；短行如实跳过。 */
export function parseLedgerTsv(text: string): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('id\t')) continue
    const c = line.split('\t')
    if (c.length < 6) continue
    out.push({ id: c[0], ts: c[1], type: c[2], defect: c[3], detail: c[4] ?? '', status: c[5] ?? '', resolution: c[6] ?? '' })
  }
  return out
}

export interface ClearanceRecord {
  target: string; action: 'resolve' | 'waive'; pr?: string; commit?: string; reason?: string; ts: string
}

export interface ClearanceView {
  rows: Array<LedgerEntry & { state: 'open' | 'resolved' | 'waived' }>
  open: number; resolved: number; waived: number; pass: boolean
}

/** 台账×处置记录→清偿视图（纯函数，测试面）。匹配键=defect 列优先，缺席回落 type。 */
export function computeClearanceView(entries: LedgerEntry[], records: ClearanceRecord[]): ClearanceView {
  const rows = entries.map(e => {
    const key = e.defect || e.type
    const hit = records.filter(r => r.target === key)
    const state: 'open' | 'resolved' | 'waived' =
      hit.some(r => r.action === 'resolve') ? 'resolved'
        : hit.some(r => r.action === 'waive') ? 'waived' : 'open'
    return { ...e, state }
  })
  const open = rows.filter(r => r.state === 'open').length
  return { rows, open, resolved: rows.length - open - rows.filter(r => r.state === 'waived').length, waived: rows.filter(r => r.state === 'waived').length, pass: open === 0 }
}

function clearanceFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  return resolve(home, 'runtime', 'orgloop-clearance.json')
}
function loadClearance(): ClearanceRecord[] {
  const f = clearanceFile()
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf-8')) as ClearanceRecord[] } catch { return [] }
}
function persistClearance(all: ClearanceRecord[]): void {
  const f = clearanceFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(all, null, 1), 'utf-8')
}
function ledgerPath(): string | null {
  const p = process.env.ORGLOOP_LEDGER_TSV
  return p && existsSync(p) ? p : null
}
function readLedger(): LedgerEntry[] {
  const p = ledgerPath()
  return p ? parseLedgerTsv(readFileSync(p, 'utf-8')) : []
}

router.get('/ledger', (ctx: Context) => {
  if (!ledgerPath()) { ctx.status = 503; ctx.body = { error: '清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）' }; return }
  const view = computeClearanceView(readLedger(), loadClearance())
  ctx.body = view
})

router.post('/clearance/resolve', (ctx: Context) => {
  if (!ledgerPath()) { ctx.status = 503; ctx.body = { error: '清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）' }; return }
  const v = validateResolve(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const all = loadClearance()
  all.push({ target: v.target, action: 'resolve', pr: v.pr, commit: v.commit, ts: new Date().toISOString() })
  persistClearance(all)
  ctx.body = computeClearanceView(readLedger(), all)
})

router.post('/clearance/waive', (ctx: Context) => {
  if (!ledgerPath()) { ctx.status = 503; ctx.body = { error: '清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）' }; return }
  const v = validateWaive(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const all = loadClearance()
  all.push({ target: v.target, action: 'waive', reason: v.reason, ts: new Date().toISOString() })
  persistClearance(all)
  ctx.body = computeClearanceView(readLedger(), all)
})

router.get('/clearance/check-clearance', (ctx: Context) => {
  if (!ledgerPath()) { ctx.status = 503; ctx.body = { error: '清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）' }; return }
  const view = computeClearanceView(readLedger(), loadClearance())
  ctx.body = { open: view.open, waived: view.waived, resolved: view.resolved, pass: view.pass }
})

// ── X2：介入点聚合（R5）。挂 orgloop 前缀零补丁（挂载经济性：复用 636）。──
// 14 介入点登记（方案 §2.9 人把关列+§2.6.5 清偿+§1.5 姿态+熔断复议）；
// 三源聚合（approved.events/闸态/清偿门），任一源缺席降级不报错（R5 验收判据）。
// belief=决策前提（2026-10-16 三篇调研轮 A 件，麦肯锡「what you'd have to believe」）：
// 批准前必须成立的前提，静态登记自方案判据与历轮事故锚——不由 AI 现场生成
// （被批准方自写「你必须相信我什么」违背运动员/裁判员分离）。
export type InterventionSourceKind = 'gate' | 'approval' | 'clearance' | 'uat' | 'registry'
export interface InterventionPoint {
  id: string; title: string; sourceKind: InterventionSourceKind; sourceKey: string
  belief: string
}

export const INTERVENTION_POINTS: InterventionPoint[] = [
  { id: 'iv-01', title: '账号编制确认（admin token 授予）', sourceKind: 'registry', sourceKey: 'admin-roster', belief: '编制名单与账号一一对应，权限位上没有编外账号' },
  { id: 'iv-02', title: '需求范围与验收标准裁定（RFD 定 AC）', sourceKind: 'registry', sourceKey: 'req-scope', belief: '每条验收判据可判伪可实测，范围边界已锁定——后续实现与测试全按此执行' },
  { id: 'iv-03', title: 'G1 需求冻结判读', sourceKind: 'gate', sourceKey: 'g1_frozen', belief: '冻结版需求与用户意图一致；判读后改动只能走变更流程' },
  { id: 'iv-04', title: '派发令确认（产品经理）', sourceKind: 'registry', sourceKey: 'dispatch', belief: '任务粒度已拆到单步可执行——过大粒度是干完不交卷的已知根因' },
  { id: 'iv-05', title: '分诊确认（团队负责人看板 todo）', sourceKind: 'registry', sourceKey: 'triage', belief: '卡落到有产能的档案，且没有互相等待的悬空卡' },
  { id: 'iv-06', title: 'G2 架构评审判词', sourceKind: 'gate', sourceKey: 'g2_arch_pass', belief: '方案复用既有实现未重复造轮——AI 不会自行收敛重复实现' },
  { id: 'iv-07', title: '缺陷判读与验收（测试者≠写码者）', sourceKind: 'registry', sourceKey: 'defect-verdict', belief: '测试者与写码者不是同一档案，缺陷判伪可复现' },
  { id: 'iv-08', title: 'G5 发布准出人工批准（HumanGate）', sourceKind: 'approval', sourceKey: 'g5_human', belief: '发布件三件齐，完成声明双凭证（提交号+卡号）在库' },
  { id: 'iv-09', title: 'UAT 逐条判词', sourceKind: 'uat', sourceKey: 'uat-verdict', belief: '每条验收判据逐条回验过；有条件放行的条件已落实到人' },
  { id: 'iv-10', title: '审计独立签名线', sourceKind: 'registry', sourceKey: 'audit-sign', belief: '四查全过零 FAIL，降级项已如实记单不粉饰' },
  { id: 'iv-11', title: '复盘行动项拍板', sourceKind: 'registry', sourceKey: 'retro-decide', belief: '每条行动项有归属有期限——无主行动项等于下轮照犯' },
  { id: 'iv-12', title: '清偿门 waive（须带批准理由）', sourceKind: 'clearance', sourceKey: 'clearance-waive', belief: '豁免理由成立且已记档——waive 是接受风险，不是消灭问题' },
  { id: 'iv-13', title: '熔断复议 OVERRIDE（带原因）', sourceKind: 'registry', sourceKey: 'breaker-override', belief: '过载证据已核对，复议不是拆闸续跑' },
  { id: 'iv-14', title: '姿态声明与开轮批准', sourceKind: 'registry', sourceKey: 'posture-approve', belief: 'prelaunch 十六项全绿且代偿台账已处置——block 态未清不得开轮' },
]

export interface InterventionSnapshot {
  gates?: Record<string, string> | null
  approvals?: string[] | null
  clearanceOpen?: number | null
}

/** 介入点×三源快照→待办视图（纯函数，测试面）。源缺席=该点 unknown 不报错。 */
export function aggregateInterventions(snap: InterventionSnapshot): {
  points: Array<InterventionPoint & { pending: boolean | null }>; sources: Record<string, 'ok' | 'absent'>
} {
  const sources: Record<string, 'ok' | 'absent'> = {
    gates: snap.gates ? 'ok' : 'absent',
    approvals: snap.approvals ? 'ok' : 'absent',
    clearance: snap.clearanceOpen == null ? 'absent' : 'ok',
  }
  const points = INTERVENTION_POINTS.map(p => {
    let pending: boolean | null = null
    if (p.sourceKind === 'gate' && snap.gates) pending = !snap.gates[p.sourceKey]
    else if (p.sourceKind === 'approval' && snap.approvals) pending = !snap.approvals.includes(p.sourceKey)
    else if (p.sourceKind === 'clearance' && snap.clearanceOpen != null) pending = snap.clearanceOpen > 0
    return { ...p, pending }
  })
  return { points, sources }
}

function parseStateEnvGates(text: string): Record<string, string> {
  const gates: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([a-z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) gates[m[1]] = m[2]
  }
  return gates
}

router.get('/interventions/pending', (ctx: Context) => {
  const snap: InterventionSnapshot = {}
  const stateEnv = process.env.ORGLOOP_STATE_ENV
  try { if (stateEnv && existsSync(stateEnv)) snap.gates = parseStateEnvGates(readFileSync(stateEnv, 'utf-8')) } catch { /* 降级 */ }
  const approved = process.env.ORGLOOP_APPROVED_EVENTS
  try {
    if (approved && existsSync(approved)) {
      snap.approvals = readFileSync(approved, 'utf-8').split('\n')
        .filter(l => l.trim()).map(l => { try { return JSON.parse(l).type as string } catch { return l.slice(0, 60) } })
    }
  } catch { /* 降级 */ }
  try { if (ledgerPath()) snap.clearanceOpen = computeClearanceView(readLedger(), loadClearance()).open } catch { /* 降级 */ }
  ctx.body = aggregateInterventions(snap)
})

// ── C11：密钥最小台账（设计正本 §二 S15——R13/Q3）──
// 只存清单与轮换记录（name/owner/last_rotated/note），**不含密钥本体**：
// 入参出现 secret/token/key/password 类字段名即 400（防误把本体灌进台账）。
// 持久化 <home>/runtime/orgloop-key-ledger.json。
//   GET /key-ledger            台账全量（只读）
//   PUT /key-ledger            整表替换（受控字段校验；≤200 行）
export interface KeyLedgerEntry {
  name: string
  owner: string
  last_rotated: string
  note: string
}

const KEY_NAME_RE = /^[A-Za-z0-9._\-\u4e00-\u9fff ]{1,60}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?Z?$/
const FORBIDDEN_SECRET_FIELDS = /secret|token|password|apikey|api_key|credential/i

/** 台账校验（纯函数，测试面）：受控四字段+本体禁入+行数上限。 */
export function validateKeyLedger(body: unknown): { ok: true; entries: KeyLedgerEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(body)) return { ok: false, error: '请求体须为数组（整表替换）' }
  if (body.length > 200) return { ok: false, error: '行数上限 200' }
  for (const raw of body) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '每行须为对象' }
    for (const k of Object.keys(raw as Record<string, unknown>)) {
      if (FORBIDDEN_SECRET_FIELDS.test(k)) return { ok: false, error: `禁止字段 ${k}（台账不含密钥本体，只存清单与轮换记录）` }
    }
    const r = raw as Record<string, unknown>
    if (typeof r.name !== 'string' || !KEY_NAME_RE.test(r.name)) return { ok: false, error: 'name 必填（受控字符集 ≤60）' }
    if (typeof r.owner !== 'string' || !KEY_NAME_RE.test(r.owner)) return { ok: false, error: `owner 必填（受控字符集 ≤60，行 ${r.name}）` }
    const lr = typeof r.last_rotated === 'string' ? r.last_rotated : ''
    if (lr && !ISO_DATE_RE.test(lr)) return { ok: false, error: `last_rotated 须为 ISO 日期或空（行 ${r.name}）` }
    if (r.note !== undefined && typeof r.note !== 'string') return { ok: false, error: `note 须为字符串（行 ${r.name}）` }
  }
  const entries = (body as Array<Record<string, unknown>>).map(r => ({
    name: String(r.name),
    owner: String(r.owner),
    last_rotated: String(r.last_rotated ?? ''),
    note: String(r.note ?? '').slice(0, 200),
  }))
  return { ok: true, entries }
}

function keyLedgerFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  return resolve(home, 'runtime', 'orgloop-key-ledger.json')
}

router.get('/key-ledger', (ctx: Context) => {
  const f = keyLedgerFile()
  if (!existsSync(f)) { ctx.body = { entries: [] }; return }
  try { ctx.body = { entries: JSON.parse(readFileSync(f, 'utf-8')) as KeyLedgerEntry[] } } catch { ctx.body = { entries: [] } }
})

router.put('/key-ledger', (ctx: Context) => {
  const v = validateKeyLedger(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const f = keyLedgerFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(v.entries, null, 1), 'utf-8')
  ctx.body = { entries: v.entries }
})

export { router as orgloopRouter }
