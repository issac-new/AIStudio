// overlay/custom/server/harness/workbench/store.ts
// 改进实验台状态（提案/经验/冠军），原子写 + 进程内串行化。
// 路径约定与 expcandidates/run-manifest 一致：HARNESS2_STORE 显式优先，
// 其次 HERMES_WEB_UI_HOME / HERMES_WEBUI_STATE_DIR，最后 ~/.hermes-web-ui。
// 读取只把 ENOENT 当空库；解析失败抛出（由 upper layer 报错），绝不静默覆写。
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import type { WorkbenchStore } from './types'
import { atomicWriteJson } from '../../lib/fs-store'
import { underWebUi } from '../../lib/paths'

export function storeDir(): string {
  const env = process.env.HARNESS2_STORE?.trim()
  if (env) {
    // HARNESS2_STORE 可以指向目录或文件；以扩展名 .json 判定。
    return env.endsWith('.json') ? dirname(resolve(env)) : resolve(env)
  }
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim() || process.env.HERMES_WEBUI_STATE_DIR?.trim()
  return webuiHome ? join(webuiHome, 'harness-workbench') : underWebUi('harness-workbench')
}

export function storeFile(): string {
  const env = process.env.HARNESS2_STORE?.trim()
  if (env && env.endsWith('.json')) return resolve(env)
  return join(storeDir(), 'workbench.json')
}

export function backupDir(): string {
  return join(storeDir(), 'backups')
}

export function emptyStore(): WorkbenchStore {
  return { version: 1, nextSeq: 1, proposals: [], experiences: [], champions: [] }
}

/**
 * R11（2026-10-31 三批执行）：SQLite 后端（env HARNESS2_STORE_SQLITE=1 渐进启用）。
 * 三表＝proposals/experiences/champions（id 主键＋JSON 全列＋updated_at 索引）＋
 * auto_jobs（任务态落盘可恢复）。旧 workbench.json 首次自动迁移（原文件保留为 .migrated）。
 * 缺省仍走 JSON 文件——迁移属独立隔离窗（D2 决策：渐进不切默认）。
 */
export function sqliteEnabled(): boolean {
  return process.env.HARNESS2_STORE_SQLITE === '1'
}

function sqliteFile(): string {
  return join(storeDir(), 'workbench.sqlite')
}

type SqliteDb = {
  prepare: (sql: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] }
  exec: (sql: string) => void
}

let dbCache: SqliteDb | null = null

function getDb(): SqliteDb {
  if (dbCache) return dbCache
  // 动态 require 防止 JSON 模式也加载原生模块
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('node:sqlite').DatabaseSync
  mkdirSync(storeDir(), { recursive: true })
  const db = new Database(sqliteFile()) as unknown as SqliteDb
  db.exec(`CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL)`)
  db.exec(`CREATE TABLE IF NOT EXISTS experiences (id TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL)`)
  db.exec(`CREATE TABLE IF NOT EXISTS champions (id TEXT PRIMARY KEY, promoted_at TEXT, json TEXT NOT NULL)`)
  db.exec(`CREATE TABLE IF NOT EXISTS auto_jobs (probe_key TEXT PRIMARY KEY, json TEXT NOT NULL)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_updated ON proposals(updated_at)`)
  dbCache = db
  return db
}

/** 旧 JSON 一次性迁移进 SQLite（原文件改名 .migrated 保留）。 */
function migrateJsonOnce(db: SqliteDb): void {
  const jsonFile = join(storeDir(), 'workbench.json')
  if (!existsSync(jsonFile)) return
  try {
    const raw = JSON.parse(readFileSync(jsonFile, 'utf8')) as Partial<WorkbenchStore>
    // 列名固定 updated_at/promoted_at；tsKey 是 JSON 字段名（列名≠字段名——R11 落地实测抓出）
    const put = (table: string, rows: Array<Record<string, unknown>>, tsKey: string, col: string) => {
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (id, ${col}, json) VALUES (?, ?, ?)`)
      for (const r of rows) stmt.run(String(r.id), String(r[tsKey] ?? ''), JSON.stringify(r))
    }
    put('proposals', (raw.proposals ?? []) as unknown[] as Array<Record<string, unknown>>, 'updatedAt', 'updated_at')
    put('experiences', (raw.experiences ?? []) as unknown[] as Array<Record<string, unknown>>, 'updatedAt', 'updated_at')
    put('champions', (raw.champions ?? []) as unknown[] as Array<Record<string, unknown>>, 'promotedAt', 'promoted_at')
    renameSync(jsonFile, jsonFile + '.migrated')
  } catch (e) {
    // 迁移失败保留 JSON（下次再试）；打印但不抛——不静默覆写也不炸主流程
    console.warn('[workbench-store] JSON→SQLite 迁移失败（保留 JSON，下次再试）：', e instanceof Error ? e.message : e)
  }
}

function sqliteRead(): WorkbenchStore {
  const db = getDb()
  migrateJsonOnce(db)
  const idRows = [
    ...(db.prepare('SELECT id FROM proposals').all() as Array<{ id: string }>),
    ...(db.prepare('SELECT id FROM experiences').all() as Array<{ id: string }>),
    ...(db.prepare('SELECT id FROM champions').all() as Array<{ id: string }>),
  ]
  // id 形如 hw-0007/exp-0003/ch-0012——取最大序号＋1（与 JSON 模式 nextSeq 语义一致）
  const maxSeq = idRows.reduce((m, r) => {
    const n = Number((r.id.match(/-(\d+)$/) ?? [])[1])
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  const load = (table: string) => (db.prepare(`SELECT json FROM ${table}`).all() as Array<{ json: string }>).map((r) => JSON.parse(r.json))
  return {
    version: 1,
    nextSeq: Math.max(1, maxSeq + 1),
    proposals: load('proposals') as WorkbenchStore['proposals'],
    experiences: load('experiences') as WorkbenchStore['experiences'],
    champions: load('champions') as WorkbenchStore['champions'],
  }
}

function sqliteWrite(store: WorkbenchStore): void {
  const db = getDb()
  // DatabaseSync（Node 24.22）无 .transaction()——显式 BEGIN/COMMIT，异常回滚
  db.exec('BEGIN')
  try {
    const wipe = (table: string) => db.prepare(`DELETE FROM ${table}`).run()
    wipe('proposals'); wipe('experiences'); wipe('champions')
    const put = (table: string, tsKey: string, col: string, rows: Array<Record<string, unknown>>) => {
      const stmt = db.prepare(`INSERT INTO ${table} (id, ${col}, json) VALUES (?, ?, ?)`)
      for (const r of rows) stmt.run(String(r.id), String(r[tsKey] ?? ''), JSON.stringify(r))
    }
    put('proposals', 'updatedAt', 'updated_at', store.proposals as unknown[] as Array<Record<string, unknown>>)
    put('experiences', 'updatedAt', 'updated_at', store.experiences as unknown[] as Array<Record<string, unknown>>)
    put('champions', 'promotedAt', 'promoted_at', store.champions as unknown[] as Array<Record<string, unknown>>)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** auto-run 任务态落盘（running 重启后可查；完成即删行）。 */
export function persistAutoJob(probeKey: string, payload: Record<string, unknown> | null): void {
  if (!sqliteEnabled()) return
  const db = getDb()
  if (payload == null) db.prepare('DELETE FROM auto_jobs WHERE probe_key = ?').run(probeKey)
  else db.prepare('INSERT OR REPLACE INTO auto_jobs (probe_key, json) VALUES (?, ?)').run(probeKey, JSON.stringify(payload))
}

export function listOrphanAutoJobs(): Array<{ probeKey: string; payload: Record<string, unknown> }> {
  if (!sqliteEnabled()) return []
  const db = getDb()
  return (db.prepare('SELECT probe_key, json FROM auto_jobs').all() as Array<{ probe_key: string; json: string }>).map((r) => ({
    probeKey: r.probe_key,
    payload: JSON.parse(r.json) as Record<string, unknown>,
  }))
}

export function readStore(): WorkbenchStore {
  if (sqliteEnabled()) return sqliteRead()
  const file = storeFile()
  if (!existsSync(file)) return emptyStore()
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorkbenchStore>
  return {
    version: 1,
    nextSeq: typeof raw.nextSeq === 'number' && raw.nextSeq > 0 ? raw.nextSeq : 1,
    proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
    experiences: Array.isArray(raw.experiences) ? raw.experiences : [],
    champions: Array.isArray(raw.champions) ? raw.champions : [],
  }
}

export function writeStore(store: WorkbenchStore): void {
  if (sqliteEnabled()) { sqliteWrite(store); return }
  const file = storeFile()
  mkdirSync(dirname(file), { recursive: true })
  atomicWriteJson(file, store, { mode: 0o600 })
}

/** 进程内串行化读-改-写，避免并发请求互相覆盖。 */
let chain: Promise<unknown> = Promise.resolve()

export function mutateStore<T>(fn: (store: WorkbenchStore) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const store = readStore()
    const result = await fn(store)
    writeStore(store)
    return result
  })
  // 链本身不因单次失败中断；调用方仍拿到自己的拒绝。
  chain = next.catch(() => undefined)
  return next
}

export function nextId(store: { nextSeq: number }, prefix: string): string {
  const id = `${prefix}-${String(store.nextSeq).padStart(3, '0')}`
  store.nextSeq += 1
  return id
}

/** 测试隔离：显式指定 store 文件。 */
export function _useStoreFileForTests(file: string): void {
  process.env.HARNESS2_STORE = file
}
