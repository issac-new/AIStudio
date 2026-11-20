// kanban-resolution 测试（Task 10；spec 2026-11-19-ai-native-operating-model-design.md
// §3.3.2/§4.4）。覆盖三面：
//   1) 读层 fail-soft：outcomeOfTask 绑定快道＋findByRootTask 兜底（激活后未绑定
//      窗口防御）、tasksByOutcome 跨板聚合、rootTaskSummary 只读投影；
//   2) 控制器注入面正身：tasksTerminalOf（全部关联任务 done/archived/cancelled 才
//      true；混合终态 false；空集 fail-closed false）、verifyRootTask（存在性三态）；
//   3) 派发门 resolveDispatchOutcome：无合同 null 原行为、cancelled/settled 拒
//      （code=outcome_not_active）、快照关键源失败拒（code=outcome_context_unavailable）、
//      active/draft/observing 生成快照＋幂等补绑定＋透出三元组。
// 夹具：临时 hermes home 建板库（kanban-bind.test.ts 同款表结构）＋outcome 台账/
// 人员名册测试 override；合同状态推进用直写 contract.json（读层不解释迁移合法性，
// 状态机守卫由 state-machine.test.ts 把守）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import {
  OutcomeDispatchError,
  bindOutcomeFamily,
  outcomeOfTask,
  resolveDispatchOutcome,
  rootTaskSummary,
  tasksByOutcome,
  tasksTerminalOf,
  verifyRootTask,
} from '../kanban-resolution'
import { _useOutcomeStoreForTests, createContract, listSnapshots } from '../outcome-store'
import type { OutcomeContract } from '../types'

const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()

type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => { get: (...p: unknown[]) => any; all: (...p: unknown[]) => any[]; run: (...p: unknown[]) => unknown }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }

let home = ''
let tmpOutcome = ''
let tmpPeople = ''
let db: Db | null = null

function openBoard(dbPath = join(home, 'kanban.db')): Db {
  const d = new DatabaseSync(dbPath)
  d.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, status TEXT,
    outcome_id TEXT, version INTEGER NOT NULL DEFAULT 0)`)
  d.exec(`CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
  d.exec(`CREATE TABLE task_links (parent_id TEXT, child_id TEXT)`)
  return d
}

function addTask(id: string, status: string, outcomeId: string | null, title = `标题-${id}`): void {
  db!.prepare('INSERT INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)').run(id, title, status, outcomeId)
}

function addLink(parentId: string, childId: string): void {
  db!.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)').run(parentId, childId)
}

/** 建合同（draft）并直写推进到指定状态——读层只认 contract.json 现值。 */
async function seedContract(outcomeId: string, rootTaskId: string, status: OutcomeContract['status']): Promise<OutcomeContract> {
  const created = createContract(
    {
      schemaVersion: 1,
      outcomeId,
      rootTaskId,
      version: 1,
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
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never,
    'seeder',
  )
  expect(created.ok).toBe(true)
  const file = join(tmpOutcome, outcomeId, 'contract.json')
  const c = JSON.parse(readFileSync(file, 'utf8')) as OutcomeContract
  c.status = status
  writeFileSync(file, JSON.stringify(c))
  return c
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'kanban-res-'))
  tmpOutcome = mkdtempSync(join(tmpdir(), 'kanban-res-store-'))
  tmpPeople = mkdtempSync(join(tmpdir(), 'kanban-res-people-'))
  db = openBoard()
  process.env.HERMES_HOME = home
  _useOutcomeStoreForTests(tmpOutcome)
  const people = await import('../../agentidentity/people')
  people._usePeopleStoreForTests(tmpPeople)
  for (const id of ['p-1', 'p-2']) {
    people.upsertPerson({ id, name: `人-${id}` }, 'seed')
    people.activatePerson(id, 'seed')
  }
})

afterEach(() => {
  try { db?.close() } catch { /* noop */ }
  db = null
  delete process.env.HERMES_HOME
  _useOutcomeStoreForTests(null)
  rmSync(home, { recursive: true, force: true })
  rmSync(tmpOutcome, { recursive: true, force: true })
  rmSync(tmpPeople, { recursive: true, force: true })
})

describe('outcomeOfTask（绑定快道＋rootTask 兜底）', () => {
  it('绑定在且合同可读：返回合同', async () => {
    await seedContract('oc-bound', 'tk-1', 'active')
    addTask('tk-1', 'todo', 'oc-bound')
    const c = outcomeOfTask('tk-1')
    expect(c?.outcomeId).toBe('oc-bound')
  })

  it('绑定指向失联合同：兜底台账命中同根合同则仍返回（漂移防御）', async () => {
    await seedContract('oc-x', 'tk-2', 'active')
    addTask('tk-2', 'todo', 'oc-missing')
    const c = outcomeOfTask('tk-2')
    expect(c?.outcomeId).toBe('oc-x')
  })

  it('激活后未绑定窗口：无绑定但台账 rootTaskId 命中→返回合同（守卫不失明）', async () => {
    await seedContract('oc-window', 'tk-3', 'active')
    addTask('tk-3', 'todo', null)
    const c = outcomeOfTask('tk-3')
    expect(c?.outcomeId).toBe('oc-window')
  })

  it('无绑定无合同：null（原行为面）', async () => {
    addTask('tk-4', 'todo', null)
    expect(outcomeOfTask('tk-4')).toBeNull()
  })

  it('任务不在任何板：仍可经台账兜底命中（库/台账漂移防御）', async () => {
    await seedContract('oc-drift', 'tk-ghost', 'cancelled')
    expect(outcomeOfTask('tk-ghost')?.outcomeId).toBe('oc-drift')
  })

  it('空 taskId：null；绑定在而合同彻底不存在：null', async () => {
    expect(outcomeOfTask('')).toBeNull()
    expect(outcomeOfTask('  ')).toBeNull()
    addTask('tk-5', 'todo', 'oc-none')
    expect(outcomeOfTask('tk-5')).toBeNull()
  })
})

describe('tasksByOutcome / rootTaskSummary（只读投影）', () => {
  it('跨板聚合同 outcome 任务（id/status），确定性排序', async () => {
    addTask('tk-b', 'done', 'oc-agg')
    addTask('tk-a', 'running', 'oc-agg')
    addTask('tk-other', 'todo', null)
    // 第二块板（业务命名板）
    const boardDir = join(home, 'kanban', 'boards', 'teamx')
    mkdirSync(boardDir, { recursive: true })
    const db2 = openBoard(join(boardDir, 'kanban.db'))
    db2.prepare('INSERT INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)').run('tk-c', 't', 'archived', 'oc-agg')
    db2.close()
    expect(tasksByOutcome('oc-agg')).toEqual([
      { id: 'tk-a', status: 'running' },
      { id: 'tk-b', status: 'done' },
      { id: 'tk-c', status: 'archived' },
    ])
    expect(tasksByOutcome('oc-none')).toEqual([])
  })

  it('rootTaskSummary：命中返回 id/title/status；查无返回 null', () => {
    addTask('tk-sum', 'review', null, '根任务标题')
    expect(rootTaskSummary('tk-sum')).toEqual({ id: 'tk-sum', title: '根任务标题', status: 'review' })
    expect(rootTaskSummary('tk-absent')).toBeNull()
  })
})

describe('tasksTerminalOf（observing 守卫正身）', () => {
  it('全部终态（done/archived/cancelled）→ true', () => {
    addTask('k1', 'done', 'oc-t1')
    addTask('k2', 'archived', 'oc-t1')
    addTask('k3', 'cancelled', 'oc-t1')
    expect(tasksTerminalOf('oc-t1')).toBe(true)
  })

  it('混合终态（任一非终态）→ false', () => {
    addTask('k1', 'done', 'oc-t2')
    addTask('k2', 'running', 'oc-t2')
    addTask('k3', 'blocked', 'oc-t2')
    expect(tasksTerminalOf('oc-t2')).toBe(false)
  })

  it('空集 fail-closed → false（零关联任务=绑定面不可证明，不借空集放行 observing）', () => {
    expect(tasksTerminalOf('oc-empty')).toBe(false)
  })
})

describe('verifyRootTask（根任务存在性三态）', () => {
  it('存在 → {ok:true}；可枚举但不存在 → {ok:false}；无任何板库 → null（不可证明）', () => {
    addTask('tk-root', 'todo', null)
    expect(verifyRootTask('tk-root')).toEqual({ ok: true })
    expect(verifyRootTask('tk-absent')).toEqual({ ok: false })
    // 无库 home（独立临时目录无 kanban.db）：归属不可证明
    const empty = mkdtempSync(join(tmpdir(), 'kanban-res-nodb-'))
    try {
      expect(verifyRootTask('tk-root', { home: empty })).toBeNull()
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('resolveDispatchOutcome（派发门）', () => {
  it('无合同：null（dispatch 原行为）', async () => {
    addTask('tk-free', 'todo', null)
    expect(resolveDispatchOutcome('tk-free')).toBeNull()
  })

  it.each(['cancelled', 'settled'] as const)('终态 %s → 抛 OutcomeDispatchError(outcome_not_active)', async (status) => {
    await seedContract('oc-dead', 'tk-dead', status)
    addTask('tk-dead', 'todo', 'oc-dead')
    try {
      resolveDispatchOutcome('tk-dead')
      throw new Error('unreachable')
    } catch (e) {
      expect(e).toBeInstanceOf(OutcomeDispatchError)
      const err = e as OutcomeDispatchError
      expect(err.name).toBe('OutcomeDispatchError')
      expect(err.code).toBe('outcome_not_active')
      expect(err.message).toContain('oc-dead')
    }
  })

  it.each(['active', 'draft', 'observing'] as const)('非终态 %s → 快照落账＋幂等补绑定＋透出三元组', async (status) => {
    const c = await seedContract('oc-live', 'tk-live', status)
    addTask('tk-live', 'todo', null) // 未绑定窗口：门须补绑定
    const ctx = resolveDispatchOutcome('tk-live')
    expect(ctx).toMatchObject({ outcomeId: 'oc-live', contractVersion: c.version })
    expect(ctx!.snapshotId).toMatch(/^snap-[0-9a-f]{16}$/)
    // 快照已物化落账（sha256 幂等重放返回同一 snapshotId）
    expect(listSnapshots('oc-live').some((s) => s.snapshotId === ctx!.snapshotId)).toBe(true)
    const again = resolveDispatchOutcome('tk-live')
    expect(again!.snapshotId).toBe(ctx!.snapshotId)
    // 补绑定生效：库面 outcome_id 已写
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-live') as { outcome_id: string | null }
    expect(row.outcome_id).toBe('oc-live')
    // 幂等：同值重绑不重复落 outcome_bound 审计事件（kanban-bind 三态契约）
    const evs = db!.prepare("SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND kind = 'outcome_bound'").get('tk-live') as { n: number }
    expect(Number(evs.n)).toBe(1)
  })

  it('快照关键源失败（身份册缺席 owner）→ 抛 OutcomeDispatchError(outcome_context_unavailable)', async () => {
    await seedContract('oc-nop', 'tk-nop', 'active')
    addTask('tk-nop', 'todo', 'oc-nop')
    const people = await import('../../agentidentity/people')
    people._usePeopleStoreForTests(mkdtempSync(join(tmpdir(), 'kanban-res-empty-people-')))
    try {
      resolveDispatchOutcome('tk-nop')
      throw new Error('unreachable')
    } catch (e) {
      expect(e).toBeInstanceOf(OutcomeDispatchError)
      const err = e as OutcomeDispatchError
      expect(err.code).toBe('outcome_context_unavailable')
      expect(err.problems.join('\n')).toContain('身份关键源失败')
    }
  })

  it('任务摘要缺席（卡行不可读）→ outcome_context_unavailable', async () => {
    await seedContract('oc-notask', 'tk-vanish', 'active')
    // 卡行不存在：绑定路径落空、台账兜底命中合同，但快照任务关键源失败
    try {
      resolveDispatchOutcome('tk-vanish')
      throw new Error('unreachable')
    } catch (e) {
      expect((e as OutcomeDispatchError).code).toBe('outcome_context_unavailable')
    }
  })
})

describe('bindOutcomeFamily（激活即绑定，审查修复轮二 I2）', () => {
  it('根＋子＋孙全绑定（task_links 图遍历），逐卡落 outcome_bound 审计事件；不连通卡不动', () => {
    for (const id of ['r1', 'c1', 'c2', 'g1', 'unrelated']) addTask(id, 'todo', null)
    addLink('r1', 'c1')
    addLink('r1', 'c2')
    addLink('c1', 'g1') // 多级：孙卡也在传播面
    const r = bindOutcomeFamily('oc-fam', 'r1')
    expect(r.ok).toBe(true)
    expect([...(r.bound ?? [])].sort()).toEqual(['c1', 'c2', 'g1', 'r1'])
    for (const id of ['r1', 'c1', 'c2', 'g1']) {
      const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(id) as { outcome_id: string | null }
      expect(row.outcome_id).toBe('oc-fam')
    }
    const evs = db!.prepare("SELECT COUNT(*) AS n FROM task_events WHERE kind = 'outcome_bound'").get() as { n: number }
    expect(Number(evs.n)).toBe(4)
    const other = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('unrelated') as { outcome_id: string | null }
    expect(other.outcome_id).toBeNull()
  })

  it('同值幂等重跑：ok、bound 空、unchanged=全家、零新增事件', () => {
    for (const id of ['r1', 'c1']) addTask(id, 'todo', null)
    addLink('r1', 'c1')
    expect(bindOutcomeFamily('oc-idem2', 'r1').ok).toBe(true)
    const again = bindOutcomeFamily('oc-idem2', 'r1')
    expect(again.ok).toBe(true)
    expect(again.bound).toEqual([])
    expect([...(again.unchanged ?? [])].sort()).toEqual(['c1', 'r1'])
    const evs = db!.prepare("SELECT COUNT(*) AS n FROM task_events WHERE kind = 'outcome_bound'").get() as { n: number }
    expect(Number(evs.n)).toBe(2) // 只有首轮两条
  })

  it('异值子卡→ok:false outcome_conflict 且零写入（根不绑、无任何事件）——失败不留半绑态', () => {
    addTask('r1', 'todo', null)
    addTask('c1', 'todo', 'oc-other')
    addLink('r1', 'c1')
    const r = bindOutcomeFamily('oc-fam', 'r1')
    expect(r).toMatchObject({ ok: false, code: 'outcome_conflict' })
    expect((r.problems ?? []).join('\n')).toContain('c1')
    const root = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('r1') as { outcome_id: string | null }
    expect(root.outcome_id).toBeNull() // 预检先行：冲突在写前拦截
    const child = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('c1') as { outcome_id: string | null }
    expect(child.outcome_id).toBe('oc-other')
    const evs = db!.prepare('SELECT COUNT(*) AS n FROM task_events').get() as { n: number }
    expect(Number(evs.n)).toBe(0)
  })

  it('根任务不存在→root_task_missing；幽灵链接（链接在而卡行缺席）跳过不阻断', () => {
    expect(bindOutcomeFamily('oc-x', 'tk-none')).toMatchObject({ ok: false, code: 'root_task_missing' })
    addTask('r2', 'todo', null)
    addLink('r2', 'ghost') // 链接指向不存在的卡：跳过（不是「既有子卡」）
    const r = bindOutcomeFamily('oc-fam3', 'r2')
    expect(r.ok).toBe(true)
    expect(r.bound).toEqual(['r2'])
  })
})
