// 摄取管线守门：真 sqlite fixture（kg-evolution 同款 DatabaseSync 建库）——
// 任务/执行人/依赖 → 本体实例+关系映射、taskRef 唯一键、坏 status 剔除+连带
// 悬空边剔除、重跑幂等（替换语义）、手工实例不受影响。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ingestFromKanban, INGEST_PREFIX } from '../ontology-ingest'
import { loadInstances, upsertInstance } from '../ontology-store'
import { listConflictInbox } from '../../knowledge/board-graph'

let home: string
let ontoDir: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ontoing-home-'))
  ontoDir = mkdtempSync(join(tmpdir(), 'ontoing-store-'))
  // HERMES_HOME 指到 .hermes 目录本身（kg-evolution 测试同款语义：
  // kanbanDbFiles 按 <home>/kanban/boards 展开查找）
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.ONTOLOGY_DIR = ontoDir
  // 收件箱指向 tmp（违规推送断言用）
  process.env.GOVERNANCE_CONFLICT_INBOX = join(ontoDir, 'inbox.jsonl')
  const dbDir = join(home, '.hermes', 'kanban', 'boards', 'b1')
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, estimate_days REAL)')
  db.exec('CREATE TABLE task_links (parent_id TEXT, child_id TEXT)')
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run('t1', '任务一', 'orchestrator', 'done', 2)
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run('t2', '任务二', 'worker-coder', 'running', null)
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run('t3', '坏状态', 'worker-coder', 'banana', 1)
  db.prepare('INSERT INTO task_links VALUES (?, ?)').run('t1', 't2')
  db.prepare('INSERT INTO task_links VALUES (?, ?)').run('t3', 't2')  // 坏任务的依赖边
  db.close()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.ONTOLOGY_DIR
  delete process.env.GOVERNANCE_CONFLICT_INBOX
  rmSync(home, { recursive: true, force: true })
  rmSync(ontoDir, { recursive: true, force: true })
})

describe('ingestFromKanban（看板 → 本体）', () => {
  it('映射完整：Task/Agent/Board 实例 + belongsTo/assignedTo/dependsOn 关系；坏 status 剔除且连带悬空边', async () => {
    const r = await ingestFromKanban()
    expect(r.boards).toEqual([{ slug: 'b1', tasks: 3, links: 2 }])
    expect(r.ingested.tasks).toBe(2)      // t3 被 field:enum 剔除
    expect(r.ingested.agents).toBe(2)     // orchestrator + worker-coder
    expect(r.ingested.boards).toBe(1)
    const inst = loadInstances()
    const t1 = inst.find((x) => x.id === 'kb:b1:task:t1')!
    expect(t1.type).toBe('Task')
    expect(t1.data.taskRef).toBe('b1#t1')
    expect(t1.data.estimate_days).toBe(2)
    const rels = t1.relations.map((x) => x.property).sort()
    expect(rels).toEqual(['assignedTo', 'belongsTo', 'dependsOn'])
    // 坏任务与它的边都不在
    expect(inst.some((x) => x.id === 'kb:b1:task:t3')).toBe(false)
    expect(r.skipped.some((v) => v.code === 'field:enum' && v.subject === 'kb:b1:task:t3')).toBe(true)
    // 健康度：摄取后全量零 error（脏数据已在门口拦下）
    expect(r.summary.error).toBe(0)
    // 冷启动种子 2（std-gbt-48000-3 + term-ontology）+ 摄取 5（2 task + 2 agent + 1 board）
    expect(r.instanceTotal).toBe(7)
  })

  it('重跑幂等（替换语义不翻倍）；手工实例不受影响', async () => {
    // 手工实例（非 kb: 前缀）
    upsertInstance({ id: 'manual-g1', type: 'Gate', label: '手工门禁', data: { name: 'g1' }, relations: [], updatedAt: 0 })
    await ingestFromKanban()
    await ingestFromKanban()
    const inst = loadInstances()
    expect(inst.filter((x) => x.id.startsWith(INGEST_PREFIX)).length).toBe(5)
    expect(inst.some((x) => x.id === 'manual-g1')).toBe(true)
    expect(inst.length).toBe(8)  // 种子 2 + 手工 1 + 摄取 5
    // taskRef 唯一键公理不报（重跑不产生重复登记）
    const again = await ingestFromKanban()
    expect(again.summary.error).toBe(0)
  })

  it('error 违规推冲突收件箱（kind=ontology，按 code 聚合，幂等不重复刷）', async () => {
    const r1 = await ingestFromKanban()
    // fixture：t3 越枚举（field:enum）+ 其悬空边（rel:dangling-target）——聚合后 2 类
    expect(r1.inboxPushed).toBeGreaterThanOrEqual(1)
    const box1 = listConflictInbox().filter((e) => e.kind === 'ontology' && !e.resolved)
    expect(box1.some((e) => e.field === 'field:enum' && String(e.incoming).includes('×1'))).toBe(true)
    expect(box1.every((e) => e.entityId.startsWith('(聚合) '))).toBe(true)
    // 重跑：同 code 未决不重复追加（幂等）
    await ingestFromKanban()
    const box2 = listConflictInbox().filter((e) => e.kind === 'ontology' && !e.resolved)
    expect(box2.filter((e) => e.field === 'field:enum').length).toBe(1)
  })
})
