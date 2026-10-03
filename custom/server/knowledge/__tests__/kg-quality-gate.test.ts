// A5 质量门禁守门（2026-10-03，动态本体三部曲③校准落地）：
// 纯函数（覆盖率/孤儿率/别名率+门禁两规则）+ 端到端（别名率超上限 → 自动回滚到
// pre 快照、marker 不写、收件箱 quality-gate 条目、废态不进版本史）+ 快照元数据
// label（auto-pre/auto-post）。复用治理测试的假 bridge 范式（真实 spawn 链路）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    existing = {n['id'] for n in g['nodes']}
    added = 0
    for it in req.get('items', []):
        if it['id'] not in existing:
            g['nodes'].append({'id': it['id'], 'type': it.get('type', 'entity'), 'properties': dict(it.get('props') or {})})
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
else:
    print(json.dumps({'ok': False, 'error': 'op-not-implemented: ' + args.op}))
`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kgqg-'))
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
  process.env.KG_MERGE_BREAKER_RATIO = '1'   // 门禁测试不与熔断耦合（上限 1.0：严格大于口径=不触发；注意 >1 会被 env 解析拒收回落 0.20）
  process.env.KG_QUALITY_ALIAS_CAP = '0.3'   // 低上限便于小夹具触发别名率档
})
afterEach(() => {
  for (const k of ['SEMANTICA_PYTHON', 'SEMANTICA_BOARD_KG_DIR', 'GOVERNANCE_CONFLICT_INBOX', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR', 'KG_VERSION_DIR', 'HERMES_HOME', 'KG_MERGE_BREAKER_RATIO', 'KG_QUALITY_ALIAS_CAP', 'KG_QUALITY_GATE']) {
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
const addTasks = (slug: string, ts: Array<{ id: string; title: string; assignee: string | null; status: string }>) => {
  const db = new DatabaseSync(join(dir, 'home', '.hermes', 'kanban', 'boards', slug, 'kanban.db'))
  for (const t of ts) db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run(t.id, t.title, t.assignee, t.status)
  db.close()
}
const kgJson = (slug: string) => JSON.parse(readFileSync(join(dir, 'kgdir', `board-${slug}.json`), 'utf8')) as {
  nodes: Array<{ id: string; properties: Record<string, unknown> }>
  edges: Array<{ source_id: string; target_id: string }>
}
const snapLabels = (slug: string) => readdirSync(join(dir, 'versions', `board-${slug}`))
  .filter((f) => /^kg-\d+\.json$/.test(f))
  .map((f) => { try { return (JSON.parse(readFileSync(join(dir, 'versions', `board-${slug}`, f.replace(/\.json$/, '.meta.json')), 'utf8')) as { label: string }).label } catch { return 'auto' } })
  .sort()

describe('A5 纯函数：指标与门禁规则', () => {
  it('evaluateKgQuality：覆盖率/孤儿率/别名率的结构语义（含空板=满覆盖）', async () => {
    const { evaluateKgQuality } = await import('../quality-gate')
    const nodes = [
      { id: 'task:t1', type: 'task', properties: {} },
      { id: 'task:t2', type: 'task', properties: {} },
      { id: 'agent:a', type: 'agent', properties: {} },
      { id: 'agent:b', type: 'agent', properties: { aliasOf: 'agent:a' } },
    ]
    const edges = [{ src: 'agent:a', dst: 'task:t1' }]
    const m = evaluateKgQuality({ nodes, edges, eligibleTasks: 4 })
    expect(m.coverage).toBeCloseTo(0.5)        // 2 task / 4 eligible
    expect(m.orphanRate).toBeCloseTo(2 / 4)    // task:t2 与 agent:b 无边
    expect(m.aliasRatio).toBeCloseTo(0.5)      // 1 别名 / 2 agent
    expect(evaluateKgQuality({ nodes: [], edges: [], eligibleTasks: 0 }).coverage).toBe(1) // 空板=满覆盖
  })

  it('checkQualityGate：覆盖率回退拒/别名率超上限拒/双过则过（边界恰等=过）', async () => {
    const { checkQualityGate } = await import('../quality-gate')
    const opts = { aliasCap: 0.5 }
    const base = { coverage: 0.8, orphanRate: 0, aliasRatio: 0.1, nodeCount: 10, edgeCount: 5 }
    expect(checkQualityGate(base, { ...base, coverage: 0.79 }, opts).passed).toBe(false)
    expect(checkQualityGate(base, { ...base, aliasRatio: 0.51 }, opts).passed).toBe(false)
    expect(checkQualityGate(base, { ...base, aliasRatio: 0.5 }, opts).passed).toBe(true)   // 恰等=不超
    expect(checkQualityGate(base, { ...base, coverage: 0.8, aliasRatio: 0.2 }, opts).passed).toBe(true)
    expect(checkQualityGate(base, { ...base, coverage: 0.9 }, opts).reason).toBeUndefined()
  })
})

describe('A5 端到端：门禁失败自动回滚 + 元数据 label', () => {
  it('别名率超上限 → 回滚到 pre 态：图复原、marker 不写、收件箱 quality-gate、无废态 post 快照', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    makeBoardDb('qg1', Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, title: `任务${i}`, assignee: `alice0${i}`, status: 'done' })))
    const r1 = await bg.syncBoardGraph('qg1')
    expect(r1.qualityGate).toBeUndefined()          // 冷启动无 pre 态=无门禁判定（post 快照前无基线可比）
    expect(snapLabels('qg1')).toEqual(['auto-post'])

    // 增量批：4 个归一化同名 assignee → 全走自动别名档（sim=1.0）→ 别名率 4/10=0.4 > 0.3
    addTasks('qg1', Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, title: `别名任务${i}`, assignee: `Alice0${i % 6}`.toUpperCase(), status: 'done' })))
    const r2 = await bg.syncBoardGraph('qg1')
    expect(r2.qualityGate?.passed).toBe(false)
    expect(r2.qualityGate?.rolledBack).toBe(true)
    expect(r2.qualityGate?.reason).toContain('别名率')
    expect(r2.qualityGate?.before.aliasRatio).toBeCloseTo(0)
    expect(r2.qualityGate?.after.aliasRatio).toBeCloseTo(0.4)
    // 图已复原到 pre 态：无别名节点、无新增任务节点（12 节点 = 6 task + 6 agent）
    const kg = kgJson('qg1')
    expect(kg.nodes).toHaveLength(12)
    expect(kg.nodes.some((n) => n.properties?.aliasOf !== undefined)).toBe(false)
    // marker 未写：4 个新任务下轮重试（收件箱不重复刷屏由幂等保证）
    const r3 = await bg.syncBoardGraph('qg1')
    expect(r3.qualityGate?.passed).toBe(false)      // 同因再失败=自愈重试语义
    // 收件箱有 quality-gate 条目（field=quality-gate，existing/incoming=前后别名率口径）
    const gateEntries = bg.listConflictInbox().filter((e) => e.kind === 'quality-gate')
    expect(gateEntries.length).toBeGreaterThanOrEqual(1)
    expect(gateEntries[0]!.entityId).toBe('board:qg1')
    // 版本史：无废态 post——r1 的 auto-post + r2/r3 各一次失败重试的 auto-pre
    // （每次重试先拍 pre 再判失败回滚；同态 pre 有 SNAP_MAX 上限兜底，不无限堆积）
    expect(snapLabels('qg1')).toEqual(['auto-post', 'auto-pre', 'auto-pre'])
  })

  it('正常增量（门禁通过）：qualityGate.passed=true + auto-pre/auto-post 双快照入史', { timeout: 30000 }, async () => {
    const bg = await import('../board-graph')
    makeBoardDb('qg2', [{ id: 't0', title: '种子', assignee: 'alice00', status: 'done' }])
    await bg.syncBoardGraph('qg2')
    addTasks('qg2', [{ id: 't1', title: '全新', assignee: 'carol-new', status: 'done' }])
    const r2 = await bg.syncBoardGraph('qg2')
    expect(r2.qualityGate?.passed).toBe(true)
    expect(r2.qualityGate?.before.coverage).toBeCloseTo(0.5)  // pre 图按当前 eligible 计（t1 未摄）：1/2
    expect(r2.qualityGate?.after.coverage).toBeCloseTo(1)     // 摄入后 2/2——门禁=同题集前后对照
    const labels = snapLabels('qg2')
    expect(labels).toHaveLength(3)
    expect(labels.filter((l) => l === 'auto-post')).toHaveLength(2)  // r1+r2 通过后正式版
    expect(labels.filter((l) => l === 'auto-pre')).toHaveLength(1)   // r2 门禁前基线
    // 门禁通过后正常记 marker：幂等重同步零摄取
    const r3 = await bg.syncBoardGraph('qg2')
    expect(r3.ingested).toBe(0)
  })

  it('总闸关闭（KG_QUALITY_GATE=0）：无门禁判定、别名照写（行为回退开关）', { timeout: 30000 }, async () => {
    process.env.KG_QUALITY_GATE = '0'
    const bg = await import('../board-graph')
    makeBoardDb('qg3', Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, title: `任务${i}`, assignee: `alice0${i}`, status: 'done' })))
    await bg.syncBoardGraph('qg3')
    addTasks('qg3', [{ id: 'a0', title: '别名任务', assignee: 'ALICE00', status: 'done' }])
    const r2 = await bg.syncBoardGraph('qg3')
    expect(r2.qualityGate).toBeUndefined()
    expect(kgJson('qg3').nodes.some((n) => n.properties?.aliasOf !== undefined)).toBe(true)
    expect(existsSync(join(dir, 'markers', 'board-sync-qg3.json'))).toBe(true)
  })
})
