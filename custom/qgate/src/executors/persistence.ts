// persistence executor（Phase 4 核心，v0.1 §45/§46）：持久化行为验证。
// 流程：起被测服务（可选）→ setup SQL → DB before 快照 → 执行 HTTP → DB after 快照
//       → 字段级断言 → 跨表不变量 → 产出五类 evidence（含制品落盘）。
// 目标：证明 API/用例真实执行后持久化结果逐字段正确（HTTP 200 ≠ 数据正确）。

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parse as parseYaml } from 'yaml'
import { isRecord } from '../core/parse.js'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { builtinPacksRoot } from '../core/loader.js'

export interface PersistenceInput {
  runId: string
  gateId: string
  workspace: string
  qgateDir: string
  commit?: string
}

const HTTP_TIMEOUT_MS = 15_000
const SERVER_READY_TIMEOUT_MS = 20_000

function resolveScenarioFile(executor: ExecutorSpec, input: PersistenceInput): string | null {
  const rel = executor.scenario
  if (!rel) return null
  const candidates = [join(input.qgateDir, rel), join(input.workspace, rel)]
  if (executor.packHint) candidates.push(join(builtinPacksRoot(), executor.packHint, 'scenarios', rel))
  return candidates.find((c) => existsSync(c)) ?? null
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') return undefined
    out.push(x)
  }
  return out
}

function evidenceBase(input: PersistenceInput, executor: ExecutorSpec, type: string, producerSuffix: string): Evidence {
  return {
    id: `ev-${randomUUID().slice(0, 12)}-${producerSuffix}`,
    runId: input.runId,
    gateId: input.gateId,
    type,
    producer: `${executor.id}:${producerSuffix}`,
    result: 'error',
    execution: 'exercised',
    independence: 'runtime-observed',
    provenance: { startedAt: Date.now(), commit: input.commit },
  }
}

function equalish(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) < 1e-9
  return String(expected) === String(actual)
}

export async function runPersistenceExecutor(
  executor: ExecutorSpec,
  input: PersistenceInput,
): Promise<Evidence[]> {
  const ev: Evidence[] = []
  const scenarioFile = resolveScenarioFile(executor, input)
  if (!scenarioFile) {
    const e = evidenceBase(input, executor, executor.evidenceType, 'scenario')
    e.result = 'error'
    e.execution = 'wired'
    e.summary = `scenario file not found: ${executor.scenario}`
    return [e]
  }

  let scenario: Record<string, unknown>
  try {
    scenario = parseYaml(readFileSync(scenarioFile, 'utf8')) as Record<string, unknown>
  } catch (err) {
    const e = evidenceBase(input, executor, executor.evidenceType, 'scenario')
    e.result = 'error'
    e.execution = 'wired'
    e.summary = `scenario parse failed: ${(err as Error).message}`
    return [e]
  }

  const dbSpec = isRecord(scenario.db) ? scenario.db : {}
  const dbRel = typeof dbSpec.path === 'string' ? dbSpec.path : null
  const dbFile = dbRel ? join(input.workspace, dbRel) : null

  const evidenceDir = join(input.qgateDir, 'evidence', input.runId)
  mkdirSync(evidenceDir, { recursive: true })
  const artifact = (name: string, value: unknown): string => {
    const file = `${name}.json`
    writeFileSync(join(evidenceDir, file), JSON.stringify(value, null, 2) + '\n', 'utf8')
    return file
  }

  // 被测服务生命周期（可选）：spawn → ready 探活 → 结束后 kill。
  // 先起服务再开库：db 常由服务启动时创建（如本 demo 的 openDb）。
  let serverProc: ReturnType<typeof spawn> | undefined
  let db: DatabaseSync | undefined
  const serverSpec = isRecord(scenario.server) ? scenario.server : undefined
  try {
    if (serverSpec) {
      const start = strList(serverSpec.start) ?? []
      const readyUrl = typeof serverSpec.readyUrl === 'string' ? serverSpec.readyUrl : null
      if (start.length > 0) {
        serverProc = spawn(start[0], start.slice(1), { cwd: input.workspace, stdio: 'ignore' })
        if (readyUrl) await waitReady(readyUrl, SERVER_READY_TIMEOUT_MS)
      }
    }

    if (!dbFile || !existsSync(dbFile)) {
      const e = evidenceBase(input, executor, executor.evidenceType, 'db')
      e.result = 'error'
      e.execution = 'wired'
      e.summary = dbFile ? `db file not found after server start: ${dbRel}` : 'scenario.db.path missing'
      return [e]
    }
    try {
      db = new DatabaseSync(dbFile)
    } catch (err) {
      const e = evidenceBase(input, executor, executor.evidenceType, 'db')
      e.result = 'error'
      e.execution = 'wired'
      e.summary = `sqlite open failed: ${(err as Error).message}`
      return [e]
    }
    const setup = strList(scenario.setup) ?? []
    for (const sql of setup) db!.exec(sql)

    const tables = strList(scenario.snapshot) ?? []
    const snap = (): Record<string, unknown[]> => {
      const out: Record<string, unknown[]> = {}
      for (const t of tables) {
        try {
          out[t] = db!.prepare(`SELECT * FROM "${t}"`).all() as unknown[]
        } catch {
          out[t] = []
        }
      }
      return out
    }

    const before = snap()
    const evBefore = evidenceBase(input, executor, 'db-before', 'before')
    evBefore.result = 'pass'
    evBefore.artifacts = [artifact('db-before', before)]
    evBefore.summary = `snapshotted tables: ${tables.join(', ') || '(none)'}`
    ev.push(evBefore)

    // ── 执行 HTTP ──
    const execSpec = isRecord(scenario.execute) && isRecord(scenario.execute.http) ? scenario.execute.http : null
    const evResp = evidenceBase(input, executor, 'integration-test-result', 'http')
    if (!execSpec) {
      evResp.result = 'error'
      evResp.execution = 'wired'
      evResp.summary = 'scenario.execute.http missing'
    } else {
      try {
        const res = await fetch(String(execSpec.url), {
          method: String(execSpec.method ?? 'POST'),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(execSpec.json ?? execSpec.body ?? {}),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        })
        const body = (await res.text()).slice(0, 4000)
        const expectedStatus = readExpectedStatus(scenario)
        evResp.result = res.status === expectedStatus ? 'pass' : 'fail'
        evResp.summary = `HTTP ${res.status} (expected ${expectedStatus})`
        evResp.artifacts = [artifact('response', { status: res.status, body })]
      } catch (err) {
        evResp.result = 'error'
        evResp.summary = `http failed: ${(err as Error).message}`
      }
    }
    ev.push(evResp)

    const after = snap()
    const evAfter = evidenceBase(input, executor, 'db-after', 'after')
    evAfter.result = 'pass'
    evAfter.artifacts = [artifact('db-after', after)]
    evAfter.summary = `rows after: ${Object.entries(after).map(([t, rows]) => `${t}=${rows.length}`).join(', ')}`
    ev.push(evAfter)

    // ── 字段级断言 ──
    const evDiff = evidenceBase(input, executor, 'field-diff', 'diff')
    const persistence = isRecord(scenario.assert) ? scenario.assert.persistence : undefined
    const diffs: Record<string, unknown> = {}
    let diffOk = isRecord(persistence)
    if (isRecord(persistence)) {
      for (const [name, target] of Object.entries(persistence)) {
        if (!isRecord(target)) { diffOk = false; diffs[name] = 'invalid target'; continue }
        const table = String(target.table ?? name)
        const where = isRecord(target.where) ? target.where : {}
        const fields = isRecord(target.fields) ? target.fields : {}
        const whereKeys = Object.keys(where)
        const rows = (whereKeys.length
          ? db!.prepare(`SELECT * FROM "${table}" WHERE ${whereKeys.map((k) => `"${k}" = ?`).join(' AND ')}`).all(...whereKeys.map((k) => where[k] as string | number | bigint | null))
          : db!.prepare(`SELECT * FROM "${table}"`).all()) as Record<string, unknown>[]
        if (rows.length === 0) {
          diffOk = false
          diffs[name] = { error: 'no rows matched', where }
          continue
        }
        const row = rows[0]
        const fieldResults: Record<string, unknown> = {}
        let allMatch = true
        for (const [col, expected] of Object.entries(fields)) {
          const actual = row[col]
          const match = equalish(expected, actual)
          if (!match) allMatch = false
          fieldResults[col] = { expected, actual, match }
        }
        if (!allMatch) diffOk = false
        diffs[name] = fieldResults
      }
    }
    evDiff.result = diffOk ? 'pass' : 'fail'
    evDiff.artifacts = [artifact('field-diff', diffs)]
    evDiff.summary = diffOk ? 'all asserted fields match' : 'field mismatch — see field-diff.json'
    ev.push(evDiff)

    // ── 跨表不变量：zeroRows 语义（返回行 = 违规行） ──
    const evInv = evidenceBase(input, executor, 'invariant-result', 'invariant')
    const invariants = isRecord(scenario.assert) && Array.isArray(scenario.assert.invariants) ? scenario.assert.invariants : []
    const invResults: Record<string, unknown> = {}
    let invOk = true
    for (const inv of invariants) {
      if (!isRecord(inv) || typeof inv.sql !== 'string') { invOk = false; continue }
      const id = String(inv.id ?? inv.sql.slice(0, 40))
      try {
        const rows = db!.prepare(inv.sql).all() as unknown[]
        const expectRows = inv.zeroRows === false
        const pass = expectRows ? rows.length > 0 : rows.length === 0
        if (!pass) invOk = false
        invResults[id] = { pass, rows: rows.slice(0, 20), semantics: expectRows ? 'expect rows' : 'expect zero rows' }
      } catch (err) {
        invOk = false
        invResults[id] = { error: (err as Error).message }
      }
    }
    evInv.result = invOk ? 'pass' : 'fail'
    evInv.artifacts = [artifact('invariant-result', invResults)]
    evInv.summary = invOk ? 'all invariants hold' : 'invariant violations — see invariant-result.json'
    ev.push(evInv)

    for (const e of ev) e.provenance.endedAt = Date.now()
    return ev
  } finally {
    try { db?.close() } catch { /* noop */ }
    if (serverProc) {
      try { serverProc.kill('SIGTERM') } catch { /* noop */ }
    }
  }
}

function readExpectedStatus(scenario: Record<string, unknown>): number {
  const response = isRecord(scenario.assert) && isRecord(scenario.assert.response) ? scenario.assert.response : undefined
  return response && typeof response.status === 'number' ? response.status : 200
}

async function waitReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (res.status > 0) return
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`server not ready within ${timeoutMs}ms: ${url}`)
}
