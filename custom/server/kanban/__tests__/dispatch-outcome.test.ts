// 派发结果解析门（批一 Task 10，spec §3.3.2）：dispatchColumnTransition 在任一
// step 派发前按 taskId 反查 outcome——无合同原行为；cancelled/settled 拒
// （OutcomeDispatchError code=outcome_not_active）；快照关键源失败拒
// （code=outcome_context_unavailable）；active 生成最小快照并在结果透出三元组。
// 审查修复轮二 I1（门统一）：OUTCOME_WORKBENCH 统管全部执法面——flag≠1 时派发侧
// 跳过 outcome 解析（完全原行为），关 flag=等价回滚（设计 §批准前六问第 3 条）。
// 夹具范式：dispatch-lane.test.ts（HERMES_HOME/columns/ledger/evidence env）
// ＋outcome 台账与人员名册 override（kanban-resolution.test.ts 同款板库结构）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()

type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => { get: (...p: unknown[]) => any; run: (...p: unknown[]) => unknown }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }

const COLUMNS_YAML = [
  'columns:',
  '  doing:',
  '    timing: entry',
  '    steps:',
  '      - id: s1',
  '        role: general-engineer',
  '        provider: zcode',
  '',
].join('\n')

let home = ''
let hermes = ''
let tmpOutcome = ''
let tmpPeople = ''
let db: Db | null = null
let calls: string[] = []

function openBoard(dbPath: string): Db {
  const d = new DatabaseSync(dbPath)
  d.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, status TEXT,
    outcome_id TEXT, version INTEGER NOT NULL DEFAULT 0)`)
  d.exec(`CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
  return d
}

function addTask(id: string, status: string, outcomeId: string | null): void {
  db!.prepare('INSERT INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)').run(id, `标题-${id}`, status, outcomeId)
}

/** 建合同（draft）并直写推进状态（读层只认 contract.json 现值）。 */
function seedContract(outcomeId: string, rootTaskId: string, status: string): void {
  const dir = join(tmpOutcome, outcomeId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'contract.json'), JSON.stringify({
    schemaVersion: 1,
    outcomeId,
    rootTaskId,
    version: 3,
    title: '发布事故率下降',
    valueStatement: '降低发布流程引发的生产事故',
    ownerPersonId: 'p-1',
    measures: [{
      measureId: 'm1', name: '事故数', definition: '滚动 30 天 P0+P1 事故数', unit: '次',
      operator: 'lte', baseline: null, target: 0, sourceRef: 'incidents://release/p0p1',
    }],
    acceptance: { statements: ['事故数归零'], requiredEvidenceKinds: ['metric'] },
    scope: { included: ['发布流程'], excluded: [] },
    riskTier: 'medium',
    defaultReversibility: 'reversible',
    verificationOwnerId: 'p-2',
    contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
    learningOptIn: false,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }))
}

const fakeService = () => ({
  dispatch: async (p: { text: string }) => {
    calls.push(p.text)
    return [{ reason: 'queued', commandId: 'c1', sessionId: 's1' }]
  },
}) as never

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  home = mkdtempSync(join(tmpdir(), 'disp-outcome-'))
  hermes = join(home, '.hermes')
  tmpOutcome = mkdtempSync(join(tmpdir(), 'disp-outcome-store-'))
  tmpPeople = mkdtempSync(join(tmpdir(), 'disp-outcome-people-'))
  mkdirSync(hermes, { recursive: true })
  db = openBoard(join(hermes, 'kanban.db'))
  calls = []
  process.env.HERMES_HOME = hermes
  process.env.HERMES_EVIDENCE_DIR = join(home, 'evidence')
  process.env.HERMES_COLUMNS_FILE = join(home, 'columns.yaml')
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(home, 'ledger.jsonl')
  process.env.OUTCOME_WORKBENCH = '1' // I1：派发门与 REST 面同 flag（缺省关＝跳过解析）
  delete process.env.EXPERIENCE_INJECT
  delete process.env.FLYWHEEL_FEWSHOT_INJECT
  writeFileSync(process.env.HERMES_COLUMNS_FILE, COLUMNS_YAML, 'utf8')
  const store = await import('../../outcome/outcome-store')
  store._useOutcomeStoreForTests(tmpOutcome)
  const people = await import('../../agentidentity/people')
  people._usePeopleStoreForTests(tmpPeople)
  for (const id of ['p-1', 'p-2']) {
    people.upsertPerson({ id, name: `人-${id}` }, 'seed')
    people.activatePerson(id, 'seed')
  }
  const { resetColumnAutomationsCacheForTests } = await import('../column-automation')
  resetColumnAutomationsCacheForTests()
})

afterEach(async () => {
  try { db?.close() } catch { /* noop */ }
  db = null
  delete process.env.HERMES_HOME
  delete process.env.HERMES_EVIDENCE_DIR
  delete process.env.HERMES_COLUMNS_FILE
  delete process.env.GOVERNANCE_DISPATCH_LEDGER
  delete process.env.OUTCOME_WORKBENCH
  const store = await import('../../outcome/outcome-store')
  store._useOutcomeStoreForTests(null)
  const { resetColumnAutomationsCacheForTests } = await import('../column-automation')
  resetColumnAutomationsCacheForTests()
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(tmpOutcome, { recursive: true, force: true })
  rmSync(tmpPeople, { recursive: true, force: true })
})

const params = { from: 'todo', to: 'doing', workspacePath: '/tmp/w', taskId: 'tk-d1' }

describe('column.dispatch 结果解析门', () => {
  it('无合同：原行为，结果无 outcome 字段且派发照常执行', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    addTask('tk-d1', 'doing', null)
    const r = await dispatchColumnTransition(fakeService(), params)
    expect(r.outcome).toBeUndefined()
    expect(r.outcomes).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it.each(['cancelled', 'settled'] as const)('终态合同 %s：任何 step 派发前拒绝（outcome_not_active），引擎零调用', async (status) => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    seedContract('oc-dead', 'tk-d1', status)
    addTask('tk-d1', 'doing', 'oc-dead')
    await expect(dispatchColumnTransition(fakeService(), params)).rejects.toMatchObject({
      name: 'OutcomeDispatchError',
      code: 'outcome_not_active',
    })
    expect(calls).toHaveLength(0)
  })

  it('快照关键源失败（身份册缺席 owner）：拒绝 outcome_context_unavailable', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    const people = await import('../../agentidentity/people')
    people._usePeopleStoreForTests(mkdtempSync(join(tmpdir(), 'disp-outcome-nop-')))
    seedContract('oc-nop', 'tk-d1', 'active')
    addTask('tk-d1', 'doing', 'oc-nop')
    await expect(dispatchColumnTransition(fakeService(), params)).rejects.toMatchObject({
      name: 'OutcomeDispatchError',
      code: 'outcome_context_unavailable',
    })
    expect(calls).toHaveLength(0)
  })

  it('active 合同：派发照常，结果透出 {outcomeId, contractVersion, snapshotId} 三元组', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    seedContract('oc-live', 'tk-d1', 'active')
    addTask('tk-d1', 'doing', null) // 未绑定窗口：门幂等补绑定
    const r = await dispatchColumnTransition(fakeService(), params)
    expect(r.outcomes).toHaveLength(1)
    expect(r.outcome).toMatchObject({ outcomeId: 'oc-live', contractVersion: 3 })
    expect(r.outcome!.snapshotId).toMatch(/^snap-[0-9a-f]{16}$/)
    // 快照已落账（store 物化正身）
    const { listSnapshots } = await import('../../outcome/outcome-store')
    expect(listSnapshots('oc-live').some((s) => s.snapshotId === r.outcome!.snapshotId)).toBe(true)
    // 幂等补绑定生效
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-d1') as { outcome_id: string | null }
    expect(row.outcome_id).toBe('oc-live')
  })

  it('重放（同 taskId 同合同）：sha256 内容幂等，两次派发透出同一 snapshotId', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    seedContract('oc-idem', 'tk-d1', 'active')
    addTask('tk-d1', 'doing', 'oc-idem')
    const first = await dispatchColumnTransition(fakeService(), params)
    const second = await dispatchColumnTransition(fakeService(), { ...params, taskId: 'tk-d1' })
    expect(second.outcome!.snapshotId).toBe(first.outcome!.snapshotId)
  })

  it('I1 门统一：OUTCOME_WORKBENCH≠1（未设/显式 0）时带终态绑定任务的派发走原行为——不拒、无快照、无三元组', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    const { listSnapshots } = await import('../../outcome/outcome-store')
    // 未设 flag
    delete process.env.OUTCOME_WORKBENCH
    seedContract('oc-off1', 'tk-f1', 'cancelled')
    addTask('tk-f1', 'doing', 'oc-off1')
    const unset = await dispatchColumnTransition(fakeService(), { ...params, taskId: 'tk-f1' })
    expect(unset.outcomes).toHaveLength(1) // 派发照常（不拒）
    expect(unset.outcome).toBeUndefined() // 无三元组
    expect(listSnapshots('oc-off1')).toEqual([]) // 无快照落账
    // 显式 0
    process.env.OUTCOME_WORKBENCH = '0'
    seedContract('oc-off2', 'tk-f2', 'cancelled')
    addTask('tk-f2', 'doing', 'oc-off2')
    const off = await dispatchColumnTransition(fakeService(), { ...params, taskId: 'tk-f2' })
    expect(off.outcomes).toHaveLength(1)
    expect(off.outcome).toBeUndefined()
    expect(listSnapshots('oc-off2')).toEqual([])
    // 回开 flag：同一形态任务恢复执法（门是动态读，非缓存）
    process.env.OUTCOME_WORKBENCH = '1'
    await expect(
      dispatchColumnTransition(fakeService(), { ...params, taskId: 'tk-f1' }),
    ).rejects.toMatchObject({ name: 'OutcomeDispatchError', code: 'outcome_not_active' })
  })
})
