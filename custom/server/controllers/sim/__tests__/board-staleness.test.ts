// overlay/custom/server/controllers/sim/__tests__/board-staleness.test.ts
// 看板停滞看门狗守门（run23 卡依赖图锁死根治，spec 案一）：
//   1) 检出主径——blocked 26h 父卡（run23 T06 实录形态）+ 在途子卡 → staleParents 命中
//   2) 不检出面——刚 blocked（<阈值）/子卡全 blocked / 子卡全终态 / 最新事件是 unblocked（直改库漂移）/ 无 blocked 事件
//   3) fail-soft——env 缺席板库缺席 → 200 ok:true+available:false；库里无 tasks 表同路降级
//   4) 路径解析——HERMES_KANBAN_DB 钉住优先；SIM 根 default 板与命名板两落点
// schema 按 vendor/hermes-agent/hermes_cli/kanban_db.py SCHEMA_SQL 造（tasks/task_links/
// task_events 三表最小面，时间戳 epoch 秒）。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_STALE_HOURS, boardDbPathOrNull, createBoardStalenessRouter, detectStaleParents,
} from '../board-staleness'

const NOW_MS = Date.now()
const HOUR_MS = 3600 * 1000

/** vendor SCHEMA_SQL 的最小子集（本端点读到的三表 + 用到列）。 */
const FIXTURE_SCHEMA = `
CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
    status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT,
    created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
    block_kind TEXT, block_recurrences INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id));
CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER,
    kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL
);
`

interface FixtureTask { id: string; title?: string; status: string; blockKind?: string | null }

/** 造一块板库：tasks + links + blocked/unblocked 事件（blockAgoHours=null 则不造事件）。 */
function makeBoard(
  tasks: FixtureTask[],
  links: Array<[string, string]>,
  blockEvents: Record<string, Array<{ kind: 'blocked' | 'unblocked'; agoHours: number } | null>>,
): string {
  const dir = mkdtempSync(join(tmpdir(), 'board-stale-'))
  const db = new DatabaseSync(join(dir, 'kanban.db'))
  db.exec(FIXTURE_SCHEMA)
  for (const t of tasks) {
    db.prepare('INSERT INTO tasks (id, title, status, created_at, block_kind) VALUES (?, ?, ?, ?, ?)')
      .run(t.id, t.title ?? `card-${t.id}`, t.status, Math.floor(NOW_MS / 1000) - 48 * 3600, t.blockKind ?? null)
  }
  for (const [p, c] of links) db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)').run(p, c)
  for (const [taskId, events] of Object.entries(blockEvents)) {
    if (!events) continue
    for (const e of events) {
      db.prepare('INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
        .run(taskId, e.kind, '{}', Math.floor(NOW_MS / 1000 - e.agoHours * 3600))
    }
  }
  db.close()
  return join(dir, 'kanban.db')
}

/** run23 实录形态夹具：T06 父卡 blocked 26h，两张在途子卡（review/running）挂其下。 */
function run23Fixture(): string {
  return makeBoard(
    [
      { id: 'T06', title: '迁移阻塞父卡', status: 'blocked', blockKind: 'external' },
      { id: 't_a1', title: '缺陷修复 a1（已合入待结卡）', status: 'review' },
      { id: 't_a2', title: '缺陷修复 a2', status: 'running' },
    ],
    [['T06', 't_a1'], ['T06', 't_a2']],
    { T06: [{ kind: 'blocked', agoHours: 26 }] },
  )
}

describe('停滞检测（纯读聚合）', () => {
  it('主径命中：blocked 26h 父卡 + 在途子卡 → 检出，blockedHours/children 如实', () => {
    const db = run23Fixture()
    try {
      const out = detectStaleParents(db, NOW_MS, DEFAULT_STALE_HOURS)
      expect(out).toHaveLength(1)
      expect(out[0]).toMatchObject({ id: 'T06', title: '迁移阻塞父卡', blockKind: 'external' })
      expect(out[0].blockedHours).toBeCloseTo(26, 0)
      expect(out[0].blockedSinceSec).toBe(Math.floor(NOW_MS / 1000) - 26 * 3600)
      expect(out[0].children.map((c) => c.id)).toEqual(['t_a1', 't_a2'])
      expect(out[0].children[0]).toMatchObject({ id: 't_a1', status: 'review' })
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('刚 blocked（<2h 阈值）不检出；阈值可调（staleHours 收紧到 1h 后 1.5h 卡命中）', () => {
    const db = makeBoard(
      [
        { id: 'P1', status: 'blocked' },
        { id: 'c1', status: 'ready' },
        { id: 'P2', status: 'blocked' },
        { id: 'c2', status: 'ready' },
      ],
      [['P1', 'c1'], ['P2', 'c2']],
      { P1: [{ kind: 'blocked', agoHours: 0.5 }], P2: [{ kind: 'blocked', agoHours: 1.5 }] },
    )
    try {
      expect(detectStaleParents(db, NOW_MS, DEFAULT_STALE_HOURS)).toHaveLength(0)
      expect(detectStaleParents(db, NOW_MS, 1)).toHaveLength(1) // 收紧后 P2 命中
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('子卡全 blocked / 全终态（done、archived）不检出——非锁死形态不告警', () => {
    const db = makeBoard(
      [
        { id: 'Pb', status: 'blocked' }, { id: 'cb', status: 'blocked' },
        { id: 'Pd', status: 'blocked' }, { id: 'cd', status: 'done' },
        { id: 'Pa', status: 'blocked' }, { id: 'ca', status: 'archived' },
      ],
      [['Pb', 'cb'], ['Pd', 'cd'], ['Pa', 'ca']],
      {
        Pb: [{ kind: 'blocked', agoHours: 30 }],
        Pd: [{ kind: 'blocked', agoHours: 30 }],
        Pa: [{ kind: 'blocked', agoHours: 30 }],
      },
    )
    try {
      expect(detectStaleParents(db, NOW_MS, DEFAULT_STALE_HOURS)).toHaveLength(0)
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('blocked→unblocked→直改库漂移（最新事件 unblocked）与无事件卡：时长不可断定，如实跳过', () => {
    const db = makeBoard(
      [
        { id: 'Pu', status: 'blocked' }, { id: 'cu', status: 'ready' },
        { id: 'Pn', status: 'blocked' }, { id: 'cn', status: 'ready' },
      ],
      [['Pu', 'cu'], ['Pn', 'cn']],
      {
        Pu: [{ kind: 'blocked', agoHours: 30 }, { kind: 'unblocked', agoHours: 1 }],
        Pn: null, // 无任何 blocked/unblocked 事件
      },
    )
    try {
      expect(detectStaleParents(db, NOW_MS, DEFAULT_STALE_HOURS)).toHaveLength(0)
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('blocked→unblocked→再 blocked：取最新 blocked 段时长（不被早前旧事件虚增）', () => {
    const db = makeBoard(
      [
        { id: 'Pr', status: 'blocked' }, { id: 'cr', status: 'todo' },
      ],
      [['Pr', 'cr']],
      {
        Pr: [
          { kind: 'blocked', agoHours: 40 },
          { kind: 'unblocked', agoHours: 30 },
          { kind: 'blocked', agoHours: 3 },
        ],
      },
    )
    try {
      const out = detectStaleParents(db, NOW_MS, DEFAULT_STALE_HOURS)
      expect(out).toHaveLength(1)
      expect(out[0].blockedHours).toBeCloseTo(3, 0)
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('库里无 tasks 表（非看板库）→ 抛错交由端点层 fail-soft', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-stale-empty-'))
    const db = join(dir, 'kanban.db')
    const d = new DatabaseSync(db)
    d.exec('CREATE TABLE other (x TEXT)')
    d.close()
    try {
      expect(() => detectStaleParents(db, NOW_MS)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('板库路径解析（fail-soft 门）', () => {
  const SAVED: Record<string, string | undefined> = {}
  function setEnv(k: string, v: string | undefined): void {
    if (!(k in SAVED)) SAVED[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED)) setEnv(k, v)
    for (const k of Object.keys(SAVED)) delete SAVED[k]
  })

  it('env 全缺席 → null', () => {
    setEnv('HERMES_KANBAN_DB', undefined)
    setEnv('OBS_SIM_ROOT', undefined)
    setEnv('SIM_ROOT', undefined)
    expect(boardDbPathOrNull('default')).toBeNull()
  })

  it('HERMES_KANBAN_DB 钉住优先（存在才收，缺席仍 null）；SIM 根 default/命名板两落点', () => {
    setEnv('OBS_SIM_ROOT', undefined)
    setEnv('SIM_ROOT', undefined)
    const root = mkdtempSync(join(tmpdir(), 'board-stale-root-'))
    try {
      // default 板：<root>/hermes/kanban.db
      const defaultDb = join(root, 'hermes', 'kanban.db')
      // 命名板：<root>/hermes/kanban/boards/<slug>/kanban.db
      const namedDb = join(root, 'hermes', 'kanban', 'boards', 'pay', 'kanban.db')
      mkdirSync(join(root, 'hermes', 'kanban', 'boards', 'pay'), { recursive: true })
      writeFileSync(defaultDb, 'x')
      writeFileSync(namedDb, 'x')

      setEnv('SIM_ROOT', root)
      expect(boardDbPathOrNull('default')).toBe(defaultDb)
      expect(boardDbPathOrNull('pay')).toBe(namedDb)
      expect(boardDbPathOrNull('missing')).toBeNull() // 板不存在如实缺席

      setEnv('HERMES_KANBAN_DB', namedDb)
      expect(boardDbPathOrNull('default')).toBe(namedDb) // 钉住覆盖板名
      setEnv('HERMES_KANBAN_DB', join(root, 'nope.db'))
      expect(boardDbPathOrNull('default')).toBeNull() // 钉了但不存在 → null 不猜
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('端点（fleet-utilization 同款：路由层直取 handler）', () => {
  const router: any = createBoardStalenessRouter()
  const handler = router.stack.find((l: any) => l.path === '/api/sim/board-staleness').stack.slice(-1)[0]
  const SAVED: Record<string, string | undefined> = {}
  function setEnv(k: string, v: string | undefined): void {
    if (!(k in SAVED)) SAVED[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED)) setEnv(k, v)
    for (const k of Object.keys(SAVED)) delete SAVED[k]
  })

  it('env 缺席 → 200 ok:true + available:false + note（K19 unavailable 出口）', async () => {
    setEnv('HERMES_KANBAN_DB', undefined)
    setEnv('OBS_SIM_ROOT', undefined)
    setEnv('SIM_ROOT', undefined)
    const ctx: any = { body: undefined, status: 0, query: {} }
    await handler(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.available).toBe(false)
    expect(ctx.body.note).toContain('HERMES_KANBAN_DB')
  })

  it('run23 形态夹具 → staleParents 检出（HERMES_KANBAN_DB 钉住测试库）', async () => {
    const db = run23Fixture()
    try {
      setEnv('HERMES_KANBAN_DB', db)
      const ctx: any = { body: undefined, status: 0, query: {} }
      await handler(ctx)
      expect(ctx.status).toBe(200)
      expect(ctx.body.available).toBe(true)
      expect(ctx.body.staleHours).toBe(DEFAULT_STALE_HOURS)
      expect(ctx.body.staleParents).toHaveLength(1)
      expect(ctx.body.staleParents[0].id).toBe('T06')
      expect(ctx.body.staleParents[0].children).toHaveLength(2)
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })

  it('库存在但非看板库（无 tasks 表）→ fail-soft available:false 不抛', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-stale-notkb-'))
    try {
      const db = join(dir, 'kanban.db')
      const d = new DatabaseSync(db)
      d.exec('CREATE TABLE other (x TEXT)')
      d.close()
      setEnv('HERMES_KANBAN_DB', db)
      const ctx: any = { body: undefined, status: 0, query: {} }
      await handler(ctx)
      expect(ctx.status).toBe(200)
      expect(ctx.body.available).toBe(false)
      expect(ctx.body.note).toContain('board=default')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('staleHours 查询参可调且夹取：负数回默认、超大夹到 168', async () => {
    const db = run23Fixture()
    try {
      setEnv('HERMES_KANBAN_DB', db)
      const run = async (q: Record<string, string>): Promise<any> => {
        const ctx: any = { body: undefined, status: 0, query: q }
        await handler(ctx)
        return ctx.body
      }
      expect((await run({ staleHours: '-5' })).staleHours).toBe(DEFAULT_STALE_HOURS)
      expect((await run({ staleHours: '99999' })).staleHours).toBe(168)
      expect((await run({ staleHours: '1' })).staleParents).toHaveLength(1)
      expect((await run({ staleHours: '30' })).staleParents).toHaveLength(0) // T06 仅 26h
    } finally {
      rmSync(join(db, '..'), { recursive: true, force: true })
    }
  })
})
