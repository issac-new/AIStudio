/**
 * 持久界面的存储层（批二，spec D5）：表 ekko_ui_surfaces，与上游规划「持久化」节的建议字段对应。
 *
 * 做法 custom/server/governance/change-governance-store.ts 同款：node:sqlite DatabaseSync
 * （CJS 惰性 require），库路径 EKKO_UI_DB 可覆写（测试与隔离走查用），缺省落在网页端
 * 用户数据目录。库文件独立于会话消息库，不改上游表结构。
 *
 * 归属判定与版本并发放在这一层：绕过宿主直接调存储也不会越权或覆盖新版本。
 * 归属不符一律报「不存在」，不泄露界面是否存在（spec D11）。
 */
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { underWebUi } from '../lib/paths'
import { SurfaceError } from './contract'
import { EKKO_UI_LIMITS, type EkkoUISpec } from './protocol-bridge'

export type PersistentSurfaceStatus = 'active' | 'closed'

/** 与表列一一对应的行；spec_json / state_json / result_json 出库即还原为对象。 */
export interface StoredSurface {
  surface_id: string
  session_id: string
  profile: string
  /** 记录了创建者时才有值；界面归属同时按它判定。 */
  user_id: string | null
  /** 创建它的那一轮运行标记，只作追溯。 */
  run_id: string
  /** 会话内唯一的界面编号（规格里的 surfaceId）。 */
  spec_surface_id: string
  revision: number
  spec_json: EkkoUISpec
  /** 用户在界面上填过的值；随规格更新按新初值为底合并（客户端做，服务端只存）。 */
  state_json: Record<string, unknown>
  /** 用户状态所依据的规格版本号。 */
  state_revision: number
  /** 最近一次提交：{ action_id, payload, revision }；从未提交为 null。 */
  result_json: { action_id: string; payload: unknown; revision: number } | null
  status: PersistentSurfaceStatus
  digest: string
  title: string
  created_at: number
  updated_at: number
  state_updated_at: number | null
  submitted_at: number | null
  closed_at: number | null
}

export interface SurfaceOwner { profile: string; userId?: string }

export interface CreateSurfaceInput {
  sessionId: string
  profile: string
  userId?: string
  runId: string
  spec: EkkoUISpec
  digest: string
  title: string
}

/** 创建工具返回给模型的回执：只含识别信息，不带规格（spec D9）。 */
export interface SurfaceReceipt {
  surface_id: string
  revision: number
  status: PersistentSurfaceStatus
  digest: string
  title: string
}

function dbPath(): string {
  const override = process.env.EKKO_UI_DB?.trim()
  if (override) return resolve(override)
  return underWebUi('ekko-ui-surfaces.db')
}

export function surfaceStoreDbPath(): string {
  return dbPath()
}

interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] }
}

let cached: { db: SqliteDb; path: string } | null = null

function openDb(): SqliteDb {
  const path = dbPath()
  if (cached && cached.path === path) return cached.db
  if (cached) {
    try { (cached.db as unknown as { close?: () => void }).close?.() } catch { /* 关闭失败不阻断换库 */ }
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite')
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path) as unknown as SqliteDb
  db.exec(`
    CREATE TABLE IF NOT EXISTS ekko_ui_surfaces (
      surface_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      profile TEXT NOT NULL,
      user_id TEXT,
      run_id TEXT NOT NULL DEFAULT '',
      spec_surface_id TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      spec_json TEXT NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      state_revision INTEGER NOT NULL DEFAULT 1,
      result_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      digest TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      state_updated_at INTEGER,
      submitted_at INTEGER,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ekko_ui_surfaces_session ON ekko_ui_surfaces(session_id, profile, status);
  `)
  cached = { db, path }
  return db
}

/** 测试用：丢弃缓存的连接，使下一次访问重新打开（换库路径后必须调用）。 */
export function _resetSurfaceStoreForTests(): void {
  if (!cached) return
  try { (cached.db as unknown as { close?: () => void }).close?.() } catch { /* 忽略 */ }
  cached = null
}

const COLUMNS = 'surface_id, session_id, profile, user_id, run_id, spec_surface_id, revision, spec_json, state_json, state_revision, result_json, status, digest, title, created_at, updated_at, state_updated_at, submitted_at, closed_at'

function parseJson(text: unknown, fallback: unknown): unknown {
  if (typeof text !== 'string' || text === '') return fallback
  try { return JSON.parse(text) } catch { return fallback }
}

function toRow(raw: unknown): StoredSurface {
  const row = raw as Record<string, unknown>
  return {
    surface_id: String(row.surface_id),
    session_id: String(row.session_id),
    profile: String(row.profile),
    user_id: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    run_id: String(row.run_id ?? ''),
    spec_surface_id: String(row.spec_surface_id),
    revision: Number(row.revision),
    spec_json: parseJson(row.spec_json, null) as EkkoUISpec,
    state_json: (parseJson(row.state_json, {}) ?? {}) as Record<string, unknown>,
    state_revision: Number(row.state_revision),
    result_json: (parseJson(row.result_json, null) ?? null) as StoredSurface['result_json'],
    status: row.status === 'closed' ? 'closed' : 'active',
    digest: String(row.digest ?? ''),
    title: String(row.title ?? ''),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    state_updated_at: row.state_updated_at === null || row.state_updated_at === undefined ? null : Number(row.state_updated_at),
    submitted_at: row.submitted_at === null || row.submitted_at === undefined ? null : Number(row.submitted_at),
    closed_at: row.closed_at === null || row.closed_at === undefined ? null : Number(row.closed_at),
  }
}

function notFound(surfaceId: string): SurfaceError {
  return new SurfaceError(`Surface not found: ${surfaceId}`, 404)
}

/** 归属不符与不存在返回同一个错误，避免探测到别人的界面。 */
function owned(db: SqliteDb, surfaceId: string, owner: SurfaceOwner): StoredSurface {
  const raw = db.prepare(`SELECT ${COLUMNS} FROM ekko_ui_surfaces WHERE surface_id=?`).get(surfaceId)
  if (!raw) throw notFound(surfaceId)
  const row = toRow(raw)
  if (row.profile !== owner.profile) throw notFound(surfaceId)
  if (row.user_id !== null && owner.userId !== undefined && row.user_id !== owner.userId) throw notFound(surfaceId)
  return row
}

export class SurfaceStore {
  create(input: CreateSurfaceInput): SurfaceReceipt {
    const db = openDb()
    const now = Date.now()
    const surfaceId = `srf:${input.sessionId}:${input.spec.surfaceId}`
    const exists = db.prepare('SELECT 1 FROM ekko_ui_surfaces WHERE surface_id=?').get(surfaceId) as { n?: unknown } | undefined
    if (exists) throw new SurfaceError(`Surface already exists: ${surfaceId}（同一会话内 surfaceId 不可重复；换个 surfaceId，或用 surface_update 续改）`, 409)
    const counted = db.prepare('SELECT COUNT(*) AS n FROM ekko_ui_surfaces WHERE session_id=? AND profile=? AND status=?').get(input.sessionId, input.profile, 'active') as { n?: unknown } | undefined
    const active = Number(counted?.n ?? 0)
    if (active >= EKKO_UI_LIMITS.maxSurfacesPerSession) {
      throw new SurfaceError(`Session already has ${active} active surfaces (limit ${EKKO_UI_LIMITS.maxSurfacesPerSession}): close unused ones with surface_close`, 409)
    }
    // node:sqlite 不能绑定 undefined：可空列必须显式传 null（2026-11-25 测试抓出）
    db.prepare(`INSERT INTO ekko_ui_surfaces (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      surfaceId, input.sessionId, input.profile, input.userId ?? null, input.runId ?? '', input.spec.surfaceId, 1,
      JSON.stringify(input.spec), '{}', 1, null, 'active', input.digest ?? '', input.title ?? '', now, now, null, null, null,
    )
    return { surface_id: surfaceId, revision: 1, status: 'active', digest: input.digest, title: input.title }
  }

  get(surfaceId: string, owner?: SurfaceOwner): StoredSurface | null {
    const db = openDb()
    if (!owner) {
      const raw = db.prepare(`SELECT ${COLUMNS} FROM ekko_ui_surfaces WHERE surface_id=?`).get(surfaceId)
      return raw ? toRow(raw) : null
    }
    try { return owned(db, surfaceId, owner) } catch { return null }
  }

  /** 基准版本与当前版本一致才更新，并递增版本号；不一致抛 409（带 currentRevision）。 */
  update(surfaceId: string, baseRevision: number, spec: EkkoUISpec, digest: string, owner?: SurfaceOwner): { surface_id: string; revision: number; digest: string; updated_at: number } {
    const db = openDb()
    const row = owner ? owned(db, surfaceId, owner) : this.getOrThrow(db, surfaceId)
    if (row.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    if (!Number.isInteger(baseRevision) || baseRevision !== row.revision) {
      throw Object.assign(
        new SurfaceError(`Revision conflict for ${surfaceId}: your base_revision is ${baseRevision} but current is ${row.revision}. Call ekko_studio_surface_inspect to read the latest, then retry with base_revision=${row.revision}.`, 409),
        { currentRevision: row.revision },
      )
    }
    const now = Date.now()
    const next = row.revision + 1
    // 条件更新兜底并发：两条更新同时读到同一版本时，只有一条能写入
    const result = db.prepare('UPDATE ekko_ui_surfaces SET revision=?, spec_json=?, digest=?, title=?, updated_at=? WHERE surface_id=? AND revision=?').run(
      next, JSON.stringify(spec), digest, String(spec.title ?? ''), now, surfaceId, baseRevision,
    ) as { changes?: number } | undefined
    if (result && typeof result.changes === 'number' && result.changes === 0) {
      const latest = db.prepare('SELECT revision FROM ekko_ui_surfaces WHERE surface_id=?').get(surfaceId) as { revision?: unknown } | undefined
      const current = Number(latest?.revision ?? 0)
      throw Object.assign(
        new SurfaceError(`Revision conflict for ${surfaceId}: current is ${current}. Inspect and retry.`, 409),
        { currentRevision: current },
      )
    }
    return { surface_id: surfaceId, revision: next, digest, updated_at: now }
  }

  private getOrThrow(db: SqliteDb, surfaceId: string): StoredSurface {
    const raw = db.prepare(`SELECT ${COLUMNS} FROM ekko_ui_surfaces WHERE surface_id=?`).get(surfaceId)
    if (!raw) throw notFound(surfaceId)
    return toRow(raw)
  }

  saveState(surfaceId: string, state: Record<string, unknown>, revision: number, owner?: SurfaceOwner): { state_updated_at: number } {
    const db = openDb()
    const row = owner ? owned(db, surfaceId, owner) : this.getOrThrow(db, surfaceId)
    if (row.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    const now = Date.now()
    db.prepare('UPDATE ekko_ui_surfaces SET state_json=?, state_revision=?, state_updated_at=? WHERE surface_id=?').run(
      JSON.stringify(state), revision, now, surfaceId,
    )
    return { state_updated_at: now }
  }

  recordSubmission(surfaceId: string, actionId: string, payload: unknown, revision: number, owner?: SurfaceOwner): { submitted_at: number } {
    const db = openDb()
    const row = owner ? owned(db, surfaceId, owner) : this.getOrThrow(db, surfaceId)
    if (row.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    const now = Date.now()
    db.prepare('UPDATE ekko_ui_surfaces SET result_json=?, submitted_at=? WHERE surface_id=?').run(
      JSON.stringify({ action_id: actionId, payload, revision }), now, surfaceId,
    )
    return { submitted_at: now }
  }

  close(surfaceId: string, owner?: SurfaceOwner): { surface_id: string; status: 'closed' } {
    const db = openDb()
    const row = owner ? owned(db, surfaceId, owner) : this.getOrThrow(db, surfaceId)
    if (row.status !== 'closed') {
      db.prepare('UPDATE ekko_ui_surfaces SET status=?, closed_at=?, updated_at=? WHERE surface_id=?').run('closed', Date.now(), Date.now(), surfaceId)
    }
    return { surface_id: surfaceId, status: 'closed' }
  }

  listBySession(sessionId: string, profile: string): StoredSurface[] {
    const db = openDb()
    const rows = db.prepare(`SELECT ${COLUMNS} FROM ekko_ui_surfaces WHERE session_id=? AND profile=? AND status='active' ORDER BY created_at`).all(sessionId, profile)
    return rows.map(toRow)
  }

  countActive(sessionId: string, profile: string): number {
    const db = openDb()
    const counted = db.prepare('SELECT COUNT(*) AS n FROM ekko_ui_surfaces WHERE session_id=? AND profile=? AND status=?').get(sessionId, profile, 'active') as { n?: unknown } | undefined
    return Number(counted?.n ?? 0)
  }
}
