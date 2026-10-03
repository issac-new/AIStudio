/**
 * 板级共享知识图谱（丙7+丙8，2026-09-30 调研落地）。
 *
 * 丙7：每板一份 KG（~/.hermes/semantica/board-<slug>.json），结案任务摄取为
 * task/agent 实体 + performed 关系——"一个 agent 的发现对其他 agent 可见"的信息流
 * 底座（最小形态：任务协作事实共享）。摄取=同步模型（POST 触发，marker 文件防重），
 * 不宣称实时。
 *
 * 丙8：冲突收件箱——实体属性矛盾（同 id 异值）不静默覆盖（bridge 写保护），冲突
 * 进 JSONL 收件箱待裁决；裁决动作 keep-existing（维持现状）| take-incoming（force
 * 重写）。Conflicts 来源目前=摄取对比；多 agent 上报面属增量（如实登记）。
 *
 * 写者边界登记：board KG 写者=本模块（bridge 串行+文件锁）；agent MCP 实例不指向
 * 板级 KG（各走各文件）。
 *
 * KG 演化治理（2026-10-02，A2/A3/A4 接线）：写入前先过三档去重（entity-dedup）与
 * 治理分级（merge-governance），只写放行部分，扣留项进 kind:'merge-review' 收件箱；
 * sync 成功且 ingested>0 自动快照（kg-version）。既有对外行为不变（additive）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { classifyBatch, breakerRatioFromEnv } from './merge-governance'
import { threeTierDedup, dedupOptsFromEnv } from './entity-dedup'
import { boardKgVersionDir, rollbackBoardKg, snapshotBoardKg } from './kg-version'
import { aliasCapFromEnv, checkQualityGate, evaluateKgQuality, qualityGateEnabled, type KgQualityMetrics } from './quality-gate'

// ---- bridge 操作（复用 decisiongraph 客户端的执行器注入） ----
import { semanticaPython, setBridgeRunnerForTests, bridgeScript, type BridgeRunner } from '../decisiongraph/semantica-client'
import { spawn } from 'node:child_process'

export interface EntityConflict {
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
}

export interface InboxEntry {
  inboxId: string
  ts: number
  board: string
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
  resolved: false | { action: 'keep-existing' | 'take-incoming'; at: number }
  /** additive（KG 演化治理 2026-10-02）：条目类别。旧数据/旧写入路径无此字段。 */
  kind?: 'field-conflict' | 'merge-review' | 'quality-gate'
  /** additive：merge-review 的名称相似度（仅 A2 去重评审档有值）。 */
  similarity?: number
}

async function runKgOp<T>(op: string, kgPath: string, input: Record<string, unknown>): Promise<T | null> {
  const python = semanticaPython()
  if (!python || process.env.HERMES_DECISION_GRAPH === '0') return null
  return new Promise((res) => {
    const child = spawn(python, [bridgeScript(), op, '--kg', kgPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    // stderr 必须消费：semantica/gensim 警告量大时撑满 64KB 管道缓冲，python 阻塞到
    // 被 SIGKILL，操作恒败；stdin error 监听防 EPIPE uncaughtException（FATAL shutdown）。
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4096) })
    child.on('close', () => {
      clearTimeout(timer)
      const lines = out.split('\n').filter((l) => l.trim().startsWith('{'))
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as T & { ok?: boolean }
          if (parsed.ok !== false) { res(parsed); return }
        } catch { /* 找下一行 */ }
      }
      if (err.trim()) console.warn(`[board-graph] bridge ${op} 失败（stderr 尾部）：${err.trim().slice(-300)}`)
      res(null)
    })
    child.on('error', () => { clearTimeout(timer); res(null) })
    child.stdin.on('error', () => {})
    child.stdin.write(JSON.stringify(input))
    child.stdin.end()
  })
}

// ---- 路径族 ----

export function boardKgDir(): string {
  const env = process.env.SEMANTICA_BOARD_KG_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'semantica')
}

export function boardKgPath(slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9._-]/g, '_') || 'main'
  return join(boardKgDir(), `board-${safe}.json`)
}

function markerPath(slug: string): string {
  const base = process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR?.trim()
  const dir = base ? resolve(base) : resolve(homedir(), '.hermes-web-ui', 'overlay')
  return join(dir, `board-sync-${slug.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

// ---- 裁决台账（遗留②闭环 2026-10-03）：merge-review 一经人工裁决即持久，
// 同步管线据此跳过已裁决实体（keep-existing 不再重扣重问），marker 判定放宽。 ----

export interface AdjudicationRecord { action: 'keep-existing' | 'take-incoming'; at: number; inboxId: string }

function adjudicatedPath(slug: string): string {
  const base = process.env.GOVERNANCE_BOARD_ADJUDICATED_DIR?.trim() ?? process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR?.trim()
  const dir = base ? resolve(base) : resolve(homedir(), '.hermes-web-ui', 'overlay')
  return join(dir, `board-adjudicated-${slug.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

function readAdjudicated(slug: string): Record<string, AdjudicationRecord> {
  try {
    return JSON.parse(readFileSync(adjudicatedPath(slug), 'utf8')) as Record<string, AdjudicationRecord>
  } catch { return {} }
}

function writeAdjudicated(slug: string, map: Record<string, AdjudicationRecord>): void {
  try {
    const file = adjudicatedPath(slug)
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify(map))
    renameSync(tmp, file)
  } catch { /* 台账写失败=裁决不持久（重新评审一次），同步语义不受影响 */ }
}

function inboxPath(): string {
  const env = process.env.GOVERNANCE_CONFLICT_INBOX?.trim()
  return env ? resolve(env) : resolve(homedir(), '.hermes-web-ui', 'overlay', 'conflict-inbox.jsonl')
}

// ---- 冲突收件箱（append-only JSONL） ----

export function appendConflictInbox(entry: Omit<InboxEntry, 'inboxId' | 'ts' | 'resolved'> & { ts?: number }): InboxEntry {
  const full: InboxEntry = {
    ...entry,
    // 已有写入路径默认 field-conflict（additive 默认值，不改老行为——老条目解析不受影响）
    kind: entry.kind ?? 'field-conflict',
    inboxId: `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    resolved: false,
  }
  try {
    const file = inboxPath()
    mkdirSync(join(file, '..'), { recursive: true })
    appendFileSync(file, JSON.stringify(full) + '\n')
  } catch (err) {
    console.warn(`[board-graph] 冲突收件箱追加失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
  }
  return full
}

export function listConflictInbox(): InboxEntry[] {
  const file = inboxPath()
  if (!existsSync(file)) return []
  const out: InboxEntry[] = []
  try {
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      try {
        const j = JSON.parse(line) as InboxEntry
        if (j && typeof j.inboxId === 'string' && j.resolved !== undefined) out.push(j)
      } catch { /* 坏行跳过 */ }
    }
  } catch { return [] }
  return out.reverse()  // 新→旧
}

export function resolveConflictInbox(inboxId: string, action: 'keep-existing' | 'take-incoming'): InboxEntry | null {
  const file = inboxPath()
  const entries = listConflictInbox().reverse()
  const hit = entries.find((e) => e.inboxId === inboxId)
  if (!hit || hit.resolved) return hit ?? null
  if (action === 'take-incoming') {
    // force 重写实体（裁决"取新值"）：经 bridge 写回，board 从 entityId 前缀 task:/agent: 推断
    const board = hit.board
    const props: Record<string, unknown> = { [hit.field]: hit.incoming, type: hit.entityId.split(':')[0] === 'task' ? 'task' : 'agent' }
    void runKgOp('entity', boardKgPath(board), { id: hit.entityId, type: props.type as string, props, force: true })
  }
  if (hit.kind === 'merge-review') {
    // 遗留②闭环：治理评审的裁决落台账——keep-existing 后同步不再重扣重问（幂等只挡未决条目，
    // 已裁决项若无台账会在下一轮同步被重新追加为新的未决评审，形成审了也白审的死循环）
    const map = readAdjudicated(hit.board)
    map[hit.entityId] = { action, at: Date.now(), inboxId: hit.inboxId }
    writeAdjudicated(hit.board, map)
  }
  hit.resolved = { action, at: Date.now() }
  try {
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
    renameSync(tmp, file)
  } catch { /* 持久化失败仅影响下次读取仍为未决，可接受 */ }
  return hit
}

// ---- merge-review 收件箱（A2/A3，KG 演化治理 2026-10-02）----

/** 追加 merge-review 条目；同一未决评审（board+entityId+field+incoming）不重复追加（幂等）。 */
export function appendMergeReviewInbox(entry: {
  board: string
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
  similarity?: number
}): InboxEntry | null {
  // 遗留②闭环第一道闸：该实体已经人工裁决过（台账在档）→ 不再重问，直接跳过追加。
  if (readAdjudicated(entry.board)[entry.entityId]) return null
  const dup = listConflictInbox().find((e) => !e.resolved && e.kind === 'merge-review'
    && e.board === entry.board && e.entityId === entry.entityId && e.field === entry.field
    && JSON.stringify(e.incoming) === JSON.stringify(entry.incoming))
  if (dup) return null
  return appendConflictInbox({ ...entry, kind: 'merge-review' })
}

/** 板 KG JSON 投影（A2/A3 既有面读取；参照 bridge kg-summary 的 json.load 做法）。 */
export interface KgNodeProjection { id: string; type: string; properties: Record<string, unknown> }

/** 读板 KG 文件提取节点与谓词集合；文件缺席/损坏返回 null（=空图冷启动语义，fail-soft）。
 * A5（2026-10-03）：附 edges 投影（src/dst，质量门禁的孤儿率/覆盖率计算依赖）。 */
export function readBoardKgState(kgPath: string): { nodes: KgNodeProjection[]; edgeTypes: Set<string>; edges: Array<{ src: string; dst: string }> } | null {
  try {
    const j = JSON.parse(readFileSync(kgPath, 'utf8')) as { nodes?: unknown; edges?: unknown }
    if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) return null
    const nodes: KgNodeProjection[] = []
    for (const n of j.nodes) {
      if (!n || typeof n !== 'object') continue
      const no = n as { id?: unknown; type?: unknown; properties?: unknown }
      if (typeof no.id !== 'string') continue
      nodes.push({ id: no.id, type: typeof no.type === 'string' ? no.type : '', properties: (no.properties ?? {}) as Record<string, unknown> })
    }
    const edgeTypes = new Set<string>()
    const edges: Array<{ src: string; dst: string }> = []
    for (const e of j.edges) {
      if (!e || typeof e !== 'object') continue
      const eo = e as { type?: unknown; source_id?: unknown; target_id?: unknown }
      if (typeof eo.type === 'string') edgeTypes.add(eo.type)
      if (typeof eo.source_id === 'string' && typeof eo.target_id === 'string') edges.push({ src: eo.source_id, dst: eo.target_id })
    }
    return { nodes, edgeTypes, edges }
  } catch { return null }
}

// ---- 板同步（结案任务摄取） ----

export interface BoardSyncResult {
  board: string
  scanned: number
  ingested: number
  relations: number
  conflicts: EntityConflict[]
  kgAvailable: boolean
  /** additive（KG 演化治理 A3）：合并治理分级统计。 */
  governed?: { auto: number; manual: number; breaker: boolean; reason?: string }
  /** additive（KG 演化治理 A2）：三档去重统计。 */
  dedup?: { autoAlias: number; review: number }
  /** additive（遗留②闭环 2026-10-03）：本批因裁决台账（keep-existing）被豁免的实体数。 */
  adjudicated?: number
  /** additive（A5 质量门禁 2026-10-03，三部曲③校准）：本轮演化质量判定；失败即自动回滚。 */
  qualityGate?: { passed: boolean; rolledBack?: boolean; reason?: string; before: KgQualityMetrics; after: KgQualityMetrics }
}

interface TaskRow { id: string | number; title: string | null; assignee: string | null; status: string; completed_at: number | null }

function readMarker(slug: string): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(markerPath(slug), 'utf8')) as string[])
  } catch { return new Set() }
}

function writeMarker(slug: string, seen: Set<string>): void {
  try {
    const file = markerPath(slug)
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, JSON.stringify([...seen]))
    renameSync(tmp, file)
  } catch { /* marker 失败=下次重摄取，图谱幂等可接受 */ }
}

/** 单板同步：结案（done/archived）任务→实体+关系；conflicts 进收件箱。 */
export async function syncBoardGraph(slug: string, boardDb?: string): Promise<BoardSyncResult> {
  const res: BoardSyncResult = { board: slug, scanned: 0, ingested: 0, relations: 0, conflicts: [], kgAvailable: semanticaPython() !== null }
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  const dbPath = boardDb ?? join(home, 'kanban', 'boards', slug, 'kanban.db')
  if (!existsSync(dbPath)) return res
  let rows: TaskRow[] = []
  let db: Awaited<ReturnType<typeof openReadonly>> | undefined
  try {
    db = await openReadonly(dbPath)
    rows = db.prepare("SELECT id, title, assignee, status, completed_at FROM tasks WHERE status IN ('done','archived')").all() as unknown as TaskRow[]
  } catch { return res }
  finally { try { db?.close() } catch { /* 已关 */ } }
  res.scanned = rows.length
  const seen = readMarker(slug)
  const kg = boardKgPath(slug)
  // 批量摄取（丙7 性能根治）：整板两次 bridge 调用（entity-batch + relation-batch），
  // 替代每任务 2-3 次子进程（744 任务 × 2.2s → 两板各 2 次调用，分钟级降为秒级）。
  const entities: Array<{ id: string; type: string; props: Record<string, unknown> }> = []
  const relations: Array<{ src: string; dst: string; type: string }> = []
  const touched: string[] = []
  const produced = new Map<string, string[]>()  // tid → 本批产出实体 id（A3：被扣实体不记 marker，人工放行前重同步仍会再过治理面）
  for (const t of rows) {
    const tid = String(t.id)
    if (seen.has(tid)) continue
    const ids: string[] = [`task:${tid}`]
    entities.push({ id: `task:${tid}`, type: 'task', props: { title: t.title ?? '', status: t.status, type: 'task' } })
    if (t.assignee?.trim()) {
      entities.push({ id: `agent:${t.assignee.trim()}`, type: 'agent', props: { name: t.assignee.trim(), type: 'agent' } })
      relations.push({ src: `agent:${t.assignee.trim()}`, dst: `task:${tid}`, type: 'performed' })
      ids.push(`agent:${t.assignee.trim()}`)
    }
    produced.set(tid, ids)
    touched.push(tid)
  }

  // ---- A2/A3 接线（KG 演化治理 2026-10-02）：三档去重 → 治理分级 → 只写放行部分 ----
  // 已存在同 id 实体不进治理面（它们不是"新增类"），维持丙8 冲突上报的既有行为。
  const kgState = readBoardKgState(kg)
  const existingIds = new Set((kgState?.nodes ?? []).map((n) => n.id))
  // 遗留②闭环第二道闸：裁决台账在档的 keep-existing 实体不再进任何管线（不重扣/不重问/
  // 不写图）；take-incoming 实体已被 force 写入（在 existingIds 里走 updates 正常演进）。
  const adjudicated = readAdjudicated(slug)
  const keepDrops = new Set(Object.entries(adjudicated).filter(([, r]) => r.action === 'keep-existing').map(([id]) => id))
  let adjudicatedDropped = 0
  const updates: typeof entities = []
  const candidates: typeof entities = []
  for (const e of entities) {
    if (keepDrops.has(e.id)) { adjudicatedDropped += 1; continue }
    (existingIds.has(e.id) ? updates : candidates).push(e)
  }
  const activeRelations = relations.filter((r) => !keepDrops.has(r.src) && !keepDrops.has(r.dst))

  const dedup = threeTierDedup(candidates, (kgState?.nodes ?? []).map((n) => {
    const type = n.type || (typeof n.properties.type === 'string' ? n.properties.type : '')
    return { id: n.id, type, name: type === 'task' ? n.properties.title : n.properties.name }
  }), dedupOptsFromEnv())
  for (const rv of dedup.review) {
    appendMergeReviewInbox({ board: slug, entityId: rv.entity.id, field: 'name', existing: rv.existingName, incoming: rv.candidateName, similarity: rv.similarity })
  }
  const heldIds = new Set(dedup.review.map((r) => r.entity.id))  // 评审扣留：其关系一并扣（不写悬空边）
  const aliasEntities = dedup.alias.map((a) => ({ ...a.entity, props: { ...a.entity.props, aliasOf: a.aliasOf } }))

  const cls = classifyBatch({
    // fresh=正常新实体；skipped=不参与去重的候选（task 默认档等）——都进治理分级
    newEntities: [...dedup.fresh, ...dedup.skipped],
    newRelations: activeRelations.filter((r) => !heldIds.has(r.src) && !heldIds.has(r.dst)),
    existingNodeCount: kgState?.nodes.length ?? 0,
    existingRelationTypes: kgState?.edgeTypes ?? new Set<string>(),
    opts: { breakerRatio: breakerRatioFromEnv() },
  })
  for (const me of cls.manual.entities) {
    appendMergeReviewInbox({
      board: slug, entityId: me.id, field: 'governance', existing: '(未写入)',
      incoming: cls.breaker ? `熔断扣留：${cls.reason ?? '批新增超阈'}` : '结构性变更扣留（新关系谓词/单实体关系数突变）',
    })
  }

  const writeEntities = [...updates, ...aliasEntities, ...cls.auto.entities]
  const writtenIds = new Set(writeEntities.map((e) => e.id))
  res.governed = { auto: cls.auto.entities.length, manual: cls.manual.entities.length, breaker: cls.breaker, ...(cls.breaker && cls.reason ? { reason: cls.reason } : {}) }
  res.dedup = { autoAlias: dedup.alias.length, review: dedup.review.length }
  if (adjudicatedDropped > 0) res.adjudicated = adjudicatedDropped

  // A5 质量门禁（三部曲③校准 2026-10-03）：写入前先快照 pre 态 + 记 before 指标。
  // pre 快照失败则跳过门禁（无回滚手段的门禁不设牙齿，fail-open 维持旧语义）。
  // 仅结构性新增（auto 放行实体/别名实体）才上门禁：updates 纯重写在幂等重同步时
  // 反复触发 pre 快照纯属空转（r3 实测），且不改变 coverage/aliasRatio 任何门禁输入。
  const gateOn = qualityGateEnabled() && (cls.auto.entities.length > 0 || aliasEntities.length > 0)
  let gatePreTs = 0
  let gateBefore: KgQualityMetrics | null = null
  if (gateOn) {
    const snap = snapshotBoardKg(slug, Date.now(), 'auto-pre')
    if (snap) {
      const m = /kg-(\d+)\.json$/.exec(snap)
      if (m) gatePreTs = Number(m[1])
    }
    if (gatePreTs > 0 && kgState) {
      gateBefore = evaluateKgQuality({ nodes: kgState.nodes, edges: kgState.edges, eligibleTasks: rows.length })
    }
  }

  if (writeEntities.length > 0) {
    const batch = await runKgOp<{ ok: boolean; added: number; conflicts: Array<{ entityId: string; fields: EntityConflict[] }> }>('entity-batch', kg, { items: writeEntities })
    if (!batch) {
      res.kgAvailable = false
      // python 缺席=零写入：清掉本轮白拍的 pre 快照（防自动重试堆积废快照，fail-soft）
      if (gatePreTs > 0) {
        const vdir = boardKgVersionDir(slug)
        for (const f of [`kg-${gatePreTs}.json`, `kg-${gatePreTs}.meta.json`]) {
          try { rmSync(join(vdir, f), { force: true }) } catch { /* 留待 prune */ }
        }
      }
      return res  // python 缺席：如实降级，不写 marker（下次重试）
    }
    res.ingested = batch.added ?? 0
    for (const c of batch.conflicts ?? []) {
      for (const f of c.fields) {
        res.conflicts.push({ entityId: c.entityId, field: f.field, existing: f.existing, incoming: f.incoming })
        appendConflictInbox({ board: slug, entityId: c.entityId, field: f.field, existing: f.existing, incoming: f.incoming })
      }
    }
  }
  if (cls.auto.relations.length > 0) {
    const relBatch = await runKgOp<{ ok: boolean; added: number }>('relation-batch', kg, { items: cls.auto.relations })
    if (!relBatch) {
      res.kgAvailable = false
      return res
    }
    res.relations = relBatch.added ?? 0
  }
  // A5 质量门禁判定：写完重读图谱算 after 指标，coverage 回退或别名率超限 → 自动回滚
  // 到 pre 快照（不写 marker，任务下轮重试自愈）+ 收件箱记 quality-gate 条目。
  if (gateOn && gatePreTs > 0 && gateBefore) {
    const afterState = readBoardKgState(kg)
    if (afterState) {
      const after = evaluateKgQuality({ nodes: afterState.nodes, edges: afterState.edges, eligibleTasks: rows.length })
      const verdict = checkQualityGate(gateBefore, after, { aliasCap: aliasCapFromEnv() })
      res.qualityGate = { passed: verdict.passed, ...(verdict.reason ? { reason: verdict.reason } : {}), before: gateBefore, after }
      if (!verdict.passed) {
        const rb = rollbackBoardKg(slug, gatePreTs)
        res.qualityGate.rolledBack = rb.ok
        appendConflictInbox({
          board: slug, entityId: `board:${slug}`, field: 'quality-gate',
          existing: Number(gateBefore.coverage.toFixed(3)), incoming: Number(after.coverage.toFixed(3)),
          kind: 'quality-gate',
        })
        return res // 回滚即终态：不写 marker（下轮重试）、不留 auto-post 快照（废态不入版本史）
      }
    }
  }
  // 零新增轮（幂等重放：未决扣留任务重过治理面，writeEntities 非空但 entity-batch
  // added=0）不改变图态——清掉本轮白拍的 pre 快照，保持「无写入=无版本史噪声」。
  // 与 python 缺席清理（上方）同构；须在质量门通过路径之后（回滚路径已提前 return）。
  if (gateOn && gatePreTs > 0 && res.ingested === 0) {
    const vdir = boardKgVersionDir(slug)
    for (const f of [`kg-${gatePreTs}.json`, `kg-${gatePreTs}.meta.json`]) {
      try { rmSync(join(vdir, f), { force: true }) } catch { /* 留待 prune */ }
    }
  }
  for (const tid of touched) {
    // 本批实体全部落定（写入、或裁决台账 keep-existing 豁免）才记 marker；仍含未决扣留的
    // 任务不记——人工裁决前每次同步重新过治理面（未决追加有幂等去重，不重复刷屏）。
    if ((produced.get(tid) ?? []).every((id) => writtenIds.has(id) || keepDrops.has(id))) seen.add(tid)
  }
  if (res.kgAvailable) writeMarker(slug, seen)
  // A4（KG 演化治理）：门禁通过且确有新增实体才落正式版本快照（源文③：版本化在门禁通过后）
  if (res.kgAvailable && res.ingested > 0) snapshotBoardKg(slug, Date.now(), 'auto-post')
  return res
}

/** 全板同步（root=main + boards/*）。 */
export async function syncAllBoardGraphs(): Promise<BoardSyncResult[]> {
  const out: BoardSyncResult[] = []
  for (const file of kanbanDbFiles()) {
    const m = file.match(/boards[\/]([^/]+)[\/]kanban\.db$/)
    const slug = m ? m[1] : 'main'
    out.push(await syncBoardGraph(slug, file))
  }
  return out
}

export async function boardGraphSummary(slug: string): Promise<{ board: string; nodes: number; edges: number; byType: Record<string, number>; recent: Array<{ id: string; type: string }> | null }> {
  const r = await runKgOp<{ nodes: number; edges: number; byType: Record<string, number>; recent: Array<{ id: string; type: string }> }>('kg-summary', boardKgPath(slug), {})
  return { board: slug, nodes: r?.nodes ?? 0, edges: r?.edges ?? 0, byType: r?.byType ?? {}, recent: r?.recent ?? null }
}

export { setBridgeRunnerForTests }
export type { BridgeRunner }
