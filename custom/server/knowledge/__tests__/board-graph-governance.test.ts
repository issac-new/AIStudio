// KG 演化治理接线守门（A2/A3/A4 → syncBoardGraph，2026-10-02）：
// 造 fixture 板 → 假 bridge（stdlib python3 复刻 entity-batch/relation-batch/entity
// 三操作的真实 JSON 协议，走真实 spawn 链路）→ 断言去重三档/治理分级/熔断/收件箱
// merge-review/幂等/自动快照。venv 无关，python3 缺席如实 skip。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string

const FAKE_BRIDGE = String.raw`
import argparse, json, os, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument('op')
ap.add_argument('--kg', required=True)
args = ap.parse_args()

def load():
    if os.path.exists(args.kg):
        try:
            with open(args.kg) as f:
                return json.load(f)
        except Exception:
            pass
    return {"nodes": [], "edges": []}

def save(g):
    d = os.path.dirname(os.path.abspath(args.kg)) or '.'
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.kg-', suffix='.json')
    os.close(fd)
    with open(tmp, 'w') as f:
        json.dump(g, f, ensure_ascii=False)
    os.replace(tmp, args.kg)

req = json.loads(sys.stdin.read() or '{}')
g = load()
if args.op == 'entity-batch':
    existing = {n['id']: (n.get('properties') or {}) for n in g['nodes']}
    added, conflicts = 0, []
    for it in req.get('items', []):
        nid, ntype = it['id'], it.get('type', 'entity')
        props = dict(it.get('props') or {})
        props.setdefault('content', nid)
        ex = existing.get(nid)
        ex_cmp = {k: v for k, v in (ex or {}).items() if k != 'content'}
        new_cmp = {k: v for k, v in props.items() if k != 'content'}
        if ex is not None and ex_cmp != new_cmp:
            changed = {k: (ex.get(k), props.get(k)) for k in (set(ex_cmp) | set(new_cmp)) if ex_cmp.get(k) != new_cmp.get(k)}
            conflicts.append({'entityId': nid, 'fields': [{'field': k, 'existing': v[0], 'incoming': v[1]} for k, v in changed.items()]})
            continue
        if ex is None:
            g['nodes'].append({'id': nid, 'type': ntype, 'properties': props})
            added += 1
    if added:
        save(g)
    print(json.dumps({'ok': True, 'added': added, 'skipped': 0, 'conflicts': conflicts}, ensure_ascii=False))
elif args.op == 'relation-batch':
    added = 0
    for it in req.get('items', []):
        s, t, ty = it['src'], it['dst'], it.get('type', 'related_to')
        g['edges'].append({'id': f'e{len(g["edges"])}', 'source_id': s, 'target_id': t, 'type': ty, 'weight': 1.0, 'properties': {}})
        added += 1
    if added:
        save(g)
    print(json.dumps({'ok': True, 'added': added}))
elif args.op == 'entity':
    props = dict(req.get('props') or {})
    props.setdefault('content', req['id'])
    for n in g['nodes']:
        if n['id'] == req['id']:
            n['properties'] = props
            break
    else:
        g['nodes'].append({'id': req['id'], 'type': req.get('type', 'entity'), 'properties': props})
    save(g)
    print(json.dumps({'ok': True, 'added': True, 'conflicts': []}))
else:
    print(json.dumps({'ok': False, 'error': 'op-not-implemented: ' + args.op}))
`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kggov-'))
  const bridge = join(dir, 'fake-bridge.py')
  writeFileSync(bridge, FAKE_BRIDGE)
  // 包装器：吃掉 runKgOp 固定注入的真实 bridge 脚本路径（$1），其余透传给假 bridge
  const wrapper = join(dir, 'pywrap')
  writeFileSync(wrapper, `#!/bin/sh\nshift\nexec python3 "${bridge}" "$@"\n`)
  chmodSync(wrapper, 0o755)
  process.env.SEMANTICA_PYTHON = wrapper
  process.env.SEMANTICA_BOARD_KG_DIR = join(dir, 'kgdir')
  process.env.GOVERNANCE_CONFLICT_INBOX = join(dir, 'inbox.jsonl')
  process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR = join(dir, 'markers')
  process.env.KG_VERSION_DIR = join(dir, 'versions')
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
})
afterEach(() => {
  for (const k of ['SEMANTICA_PYTHON', 'SEMANTICA_BOARD_KG_DIR', 'GOVERNANCE_CONFLICT_INBOX', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR', 'KG_VERSION_DIR', 'HERMES_HOME']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function makeBoardDb(slug: string, tasks: Array<{ id: string; title: string; assignee: string | null; status: string }>): string {
  const dbDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  for (const t of tasks) db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run(t.id, t.title, t.assignee, t.status)
  db.close()
  return join(dbDir, 'kanban.db')
}

function addTasks(slug: string, tasks: Array<{ id: string; title: string; assignee: string | null; status: string }>): void {
  const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', slug, 'kanban.db'))
  for (const t of tasks) db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run(t.id, t.title, t.assignee, t.status)
  db.close()
}

const kgJson = (slug: string) => JSON.parse(readFileSync(join(dir, 'kgdir', `board-${slug}.json`), 'utf8')) as {
  nodes: Array<{ id: string; type: string; properties: Record<string, unknown> }>
  edges: Array<{ source_id: string; target_id: string; type: string }>
}
const snaps = (slug: string) => readdirSync(join(dir, 'versions', `board-${slug}`)).filter((f) => /^kg-\d+\.json$/.test(f))

describe('A2/A3/A4 接线：去重三档 + 治理分级 + 自动快照', () => {
  it('冷启动全 auto → 增量批：别名写入带 aliasOf、review 进收件箱、恰好 0.20 不熔断', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    // 首批：10 任务 ×（task+agent）=20 节点（含两词 assignee，供 review 档比对）
    const first = Array.from({ length: 10 }, (_, i) => ({
      id: `t${String(i + 1).padStart(2, '0')}`,
      title: `任务${i}`,
      assignee: i === 2 ? 'bob worker' : `alice${String(i + 1).padStart(2, '0')}`,
      status: 'done',
    }))
    makeBoardDb('gov1', first)
    const r1 = await bg.syncBoardGraph('gov1')
    expect(r1.kgAvailable).toBe(true)
    expect(r1.ingested).toBe(20)
    expect(r1.relations).toBe(10)
    expect(r1.governed).toMatchObject({ auto: 20, manual: 0, breaker: false })  // 空图冷启动：不评估熔断
    expect(r1.dedup).toEqual({ autoAlias: 0, review: 0 })
    expect(snaps('gov1')).toHaveLength(1)  // A4+A5：冷启动无 KG 文件=无 pre 态，仅门禁通过后的 post 正式版

    // 增量批：别名档（归一化后同名）+ 评审档（≈0.62）+ 全新档；fresh=4/20=恰好 0.20 → 不熔断
    addTasks('gov1', [
      { id: 't11', title: '别名任务', assignee: 'Alice01', status: 'done' },
      { id: 't12', title: '全新任务', assignee: 'carol-new', status: 'done' },
      { id: 't13', title: '评审任务', assignee: 'bob workers', status: 'done' },
    ])
    const r2 = await bg.syncBoardGraph('gov1')
    expect(r2.ingested).toBe(5)  // 3 task + 别名 agent + 全新 agent（评审 agent 不写）
    expect(r2.relations).toBe(2)  // 评审 agent 的 performed 被牵连扣
    expect(r2.dedup).toEqual({ autoAlias: 1, review: 1 })
    expect(r2.governed).toMatchObject({ auto: 4, manual: 0, breaker: false })
    // 别名实体已写入且带 aliasOf
    const aliasNode = kgJson('gov1').nodes.find((n) => n.id === 'agent:Alice01')
    expect(aliasNode?.properties.aliasOf).toBe('agent:alice01')
    // 评审档进收件箱：kind=merge-review、field=name、带相似度与双方名称
    const reviews = bg.listConflictInbox().filter((e) => e.kind === 'merge-review')
    expect(reviews).toHaveLength(1)
    expect(reviews[0].entityId).toBe('agent:bob workers')
    expect(reviews[0].field).toBe('name')
    expect(reviews[0].existing).toBe('bob worker')
    expect(reviews[0].incoming).toBe('bob workers')
    expect(reviews[0].similarity).toBeGreaterThan(0.6)
    expect(reviews[0].similarity).toBeLessThan(0.85)
    expect(snaps('gov1')).toHaveLength(3)  // 第二次有新增 → pre+post 两份（pre 态此刻可拍）

    // 幂等：被扣任务（t13）不记 marker，重同步重新过治理面——收件箱不重复、零写入
    const r3 = await bg.syncBoardGraph('gov1')
    expect(r3.ingested).toBe(0)
    expect(r3.relations).toBe(0)
    expect(bg.listConflictInbox().filter((e) => e.kind === 'merge-review')).toHaveLength(1)
    expect(snaps('gov1')).toHaveLength(3)  // 幂等重同步零结构新增=无 pre 无 post
    // 图里没有评审扣留的实体（悬空防线）
    expect(kgJson('gov1').nodes.some((n) => n.id === 'agent:bob workers')).toBe(false)
  })

  it('熔断：3 新增/2 既有 → 全转 manual 附原因、零写入、收件箱 governance 条目幂等', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    makeBoardDb('gov2', [{ id: 't1', title: '种子', assignee: 'seed-agent', status: 'done' }])
    await bg.syncBoardGraph('gov2')  // 2 节点
    addTasks('gov2', [
      { id: 't2', title: '洪峰1', assignee: null, status: 'done' },
      { id: 't3', title: '洪峰2', assignee: null, status: 'done' },
      { id: 't4', title: '洪峰3', assignee: null, status: 'done' },
    ])
    const r = await bg.syncBoardGraph('gov2')
    expect(r.ingested).toBe(0)  // 熔断=全转 manual，零写入
    expect(r.relations).toBe(0)
    expect(r.governed?.breaker).toBe(true)
    expect(r.governed?.manual).toBe(3)
    expect(r.governed?.reason).toContain('熔断')
    const holds = bg.listConflictInbox().filter((e) => e.kind === 'merge-review' && e.field === 'governance')
    expect(holds.map((h) => h.entityId).sort()).toEqual(['task:t2', 'task:t3', 'task:t4'])
    // 幂等：重同步不重复追加（marker 未记，但收件箱去重）
    await bg.syncBoardGraph('gov2')
    expect(bg.listConflictInbox().filter((e) => e.kind === 'merge-review' && e.field === 'governance')).toHaveLength(3)
    expect(kgJson('gov2').nodes).toHaveLength(2)  // 图未被洪峰冲入
  })

  it('旧冲突路径默认 kind=field-conflict（additive 字段不改老行为）', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    makeBoardDb('gov3', [{ id: 't1', title: 'x', assignee: 'alice', status: 'done' }])
    await bg.syncBoardGraph('gov3')
    rmSync(join(dir, 'markers', 'board-sync-gov3.json'))  // 清 marker 模拟重复上报
    const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', 'gov3', 'kanban.db'))
    db.prepare("UPDATE tasks SET status='archived' WHERE id='t1'").run()
    db.close()
    const r = await bg.syncBoardGraph('gov3')
    expect(r.conflicts.length).toBeGreaterThanOrEqual(1)
    const fieldConflicts = bg.listConflictInbox().filter((e) => e.kind === 'field-conflict')
    expect(fieldConflicts.length).toBeGreaterThanOrEqual(1)
    expect(fieldConflicts[0].incoming).toBe('archived')
  })

  it('python 缺席路径：governed/dedup 仍如实报告决策面，kgAvailable=false', async () => {
    const emptyPy = join(dir, 'pyfake')
    writeFileSync(emptyPy, '#!/bin/sh\n')
    process.env.SEMANTICA_PYTHON = emptyPy
    const bg = await import('../board-graph')
    makeBoardDb('gov4', [{ id: 't1', title: 'x', assignee: 'alice', status: 'done' }])
    const r = await bg.syncBoardGraph('gov4')
    expect(r.kgAvailable).toBe(false)
    expect(r.ingested).toBe(0)
    expect(r.governed).toMatchObject({ auto: 2, manual: 0, breaker: false })  // 决策面照常报告
    expect(r.dedup).toEqual({ autoAlias: 0, review: 0 })
    expect(existsSync(join(dir, 'versions', 'board-gov4'))).toBe(false)  // 失败路径不快照
  })
})
