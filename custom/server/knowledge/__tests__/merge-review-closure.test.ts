// 遗留②闭环守门（2026-10-03）：merge-review 裁决后死循环根治——
// keep-existing 裁决落台账 → 重同步不再重扣重问（幂等只挡未决条目，已裁决项若无台账
// 会被重新追加为新未决评审）；take-incoming 裁决后任务经 updates 路径自然记 marker。
// 复用 board-graph-governance.test.ts 的假 bridge/夹具范式（stdlib python3 真实 spawn 链路）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    added = 0
    for it in req.get('items', []):
        nid, ntype = it['id'], it.get('type', 'entity')
        props = dict(it.get('props') or {})
        props.setdefault('content', nid)
        if nid not in existing:
            g['nodes'].append({'id': nid, 'type': ntype, 'properties': props})
            added += 1
    if added:
        save(g)
    print(json.dumps({'ok': True, 'added': added, 'skipped': 0, 'conflicts': []}, ensure_ascii=False))
elif args.op == 'relation-batch':
    added = 0
    for it in req.get('items', []):
        g['edges'].append({'id': f'e{len(g["edges"])}', 'source_id': it['src'], 'target_id': it['dst'], 'type': it.get('type', 'related_to'), 'weight': 1.0, 'properties': {}})
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
  dir = mkdtempSync(join(tmpdir(), 'kgadj-'))
  const bridge = join(dir, 'fake-bridge.py')
  writeFileSync(bridge, FAKE_BRIDGE)
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

function makeBoardDb(slug: string, tasks: Array<{ id: string; title: string; assignee: string | null; status: string }>): void {
  const dbDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  for (const t of tasks) db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run(t.id, t.title, t.assignee, t.status)
  db.close()
}

const kgJson = (slug: string) => JSON.parse(readFileSync(join(dir, 'kgdir', `board-${slug}.json`), 'utf8')) as {
  nodes: Array<{ id: string; type: string; properties: Record<string, unknown> }>
  edges: Array<{ source_id: string; target_id: string; type: string }>
}
const adjudicatedFile = (slug: string) => join(dir, 'markers', `board-adjudicated-${slug}.json`)

describe('遗留②：merge-review 裁决闭环（keep-existing 不再死循环）', () => {
  it('keep-existing：裁决落台账 → 重同步零重扣零重问 → 任务记 marker → 图中永无该实体', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    // 种子批：bob worker 在图；评审批：bob workers ≈0.72 相似度进 review 档（t13 被牵连扣）
    const seed = [{ id: 't00', title: '种子', assignee: 'bob worker', status: 'done' }] as Array<{ id: string; title: string; assignee: string | null; status: string }>
    for (let i = 1; i <= 9; i++) seed.push({ id: `s${String(i).padStart(2, '0')}`, title: `种子${i}`, assignee: `seed${i}`, status: 'done' })
    makeBoardDb('adj1', seed)
    await bg.syncBoardGraph('adj1')
    const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', 'adj1', 'kanban.db'))
    db.prepare("INSERT INTO tasks VALUES ('t13', '评审任务', 'bob workers', 'done', 1, 1, 2)").run()
    db.close()
    const r1 = await bg.syncBoardGraph('adj1')
    expect(r1.dedup?.review).toBe(1)
    const review = bg.listConflictInbox().find((e) => e.kind === 'merge-review' && e.field === 'name')!
    expect(review.entityId).toBe('agent:bob workers')

    // 人工裁决 keep-existing（不并这个近义 agent）→ 台账必须落盘
    const resolved = bg.resolveConflictInbox(review.inboxId, 'keep-existing')
    expect(resolved?.resolved).toMatchObject({ action: 'keep-existing' })
    expect(existsSync(adjudicatedFile('adj1'))).toBe(true)
    expect(JSON.parse(readFileSync(adjudicatedFile('adj1'), 'utf8'))['agent:bob workers'].action).toBe('keep-existing')

    // 闭环断言：重同步不再产生任何新评审条目（旧行为=已裁决项被重新追加为未决，死循环）
    const r2 = await bg.syncBoardGraph('adj1')
    expect(r2.adjudicated).toBe(1)          // 台账豁免了 agent:bob workers
    expect(r2.dedup?.review ?? 0).toBe(0)   // 不再重扣
    const reviews2 = bg.listConflictInbox().filter((e) => e.kind === 'merge-review')
    expect(reviews2).toHaveLength(1)        // 只有已裁决那条，无新增
    expect(reviews2[0].resolved).toBeTruthy()
    // t13 落定：task 实体照写（其 agent 被 keep 豁免）、marker 记账、再同步零摄取
    expect(kgJson('adj1').nodes.some((n) => n.id === 'task:t13')).toBe(true)
    expect(kgJson('adj1').nodes.some((n) => n.id === 'agent:bob workers')).toBe(false)
    const r3 = await bg.syncBoardGraph('adj1')
    expect(r3.ingested).toBe(0)
    expect(r3.adjudicated ?? 0).toBe(0)          // marker 已记，t13 不再进管线
  })

  it('take-incoming：裁决 force 写入 → 下轮同步实体在图走 updates → 任务记 marker 闭环', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    const seed = [{ id: 't00', title: '种子', assignee: 'bob worker', status: 'done' }] as Array<{ id: string; title: string; assignee: string | null; status: string }>
    for (let i = 1; i <= 9; i++) seed.push({ id: `s${String(i).padStart(2, '0')}`, title: `种子${i}`, assignee: `seed${i}`, status: 'done' })
    makeBoardDb('adj2', seed)
    await bg.syncBoardGraph('adj2')
    const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', 'adj2', 'kanban.db'))
    db.prepare("INSERT INTO tasks VALUES ('t13', '评审任务', 'bob workers', 'done', 1, 1, 2)").run()
    db.close()
    await bg.syncBoardGraph('adj2')
    const review = bg.listConflictInbox().find((e) => e.kind === 'merge-review' && e.field === 'name')!

    // 人工裁决 take-incoming（force 写入该 agent）→ 台账同样落档（防再问）
    bg.resolveConflictInbox(review.inboxId, 'take-incoming')
    expect(JSON.parse(readFileSync(adjudicatedFile('adj2'), 'utf8'))['agent:bob workers'].action).toBe('take-incoming')
    // force 写入是异步桥调用：轮询等实体落图（≤5s）
    for (let i = 0; i < 50 && !kgJson('adj2').nodes.some((n) => n.id === 'agent:bob workers'); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(kgJson('adj2').nodes.some((n) => n.id === 'agent:bob workers')).toBe(true)

    // 重同步：实体已在图（updates 路径），不再进治理面；t13 全部产出落定 → marker 记账
    const r2 = await bg.syncBoardGraph('adj2')
    expect(r2.dedup?.review ?? 0).toBe(0)
    expect(r2.adjudicated ?? 0).toBe(0)
    expect(bg.listConflictInbox().filter((e) => e.kind === 'merge-review' && !e.resolved)).toHaveLength(0)
    const r3 = await bg.syncBoardGraph('adj2')
    expect(r3.ingested).toBe(0)  // marker 已记
  })

  it('熔断扣留项裁决 keep-existing 后同样闭环：洪峰任务不再反复重扣', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    makeBoardDb('adj3', [{ id: 't1', title: '种子', assignee: 'seed-agent', status: 'done' }])
    await bg.syncBoardGraph('adj3')
    const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', 'adj3', 'kanban.db'))
    db.prepare("INSERT INTO tasks VALUES ('t2', '洪峰', NULL, 'done', 1, 1, 2)").run()
    db.close()
    const r1 = await bg.syncBoardGraph('adj3')
    expect(r1.governed?.breaker).toBe(true)  // 2 新增 / 2 既有 = 超 0.20 熔断（严格大于口径）
    const hold = bg.listConflictInbox().find((e) => e.kind === 'merge-review' && e.entityId === 'task:t2')!
    bg.resolveConflictInbox(hold.inboxId, 'keep-existing')

    // 重同步：t2 的 task 实体被台账豁免，零重扣零新增条目；t2 记 marker
    const r2 = await bg.syncBoardGraph('adj3')
    expect(r2.adjudicated).toBe(1)
    expect(bg.listConflictInbox().filter((e) => e.kind === 'merge-review').length).toBe(1)  // 仅原已裁决条
    const r3 = await bg.syncBoardGraph('adj3')
    expect(r3.ingested).toBe(0)
    expect(kgJson('adj3').nodes.some((n) => n.id === 'task:t2')).toBe(false)  // 裁决语义=不并入
  })
})
