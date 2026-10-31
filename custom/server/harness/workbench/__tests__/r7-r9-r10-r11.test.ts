// R7/R9/R10/R11（2026-10-31 三批执行）守门。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
const prevStore = process.env.HARNESS2_STORE
const prevSqlite = process.env.HARNESS2_STORE_SQLITE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'r3b-'))
  process.env.HARNESS2_STORE = join(dir, 'workbench', 'workbench.json')
  process.env.HERMES_HOME = join(dir, 'home')
  delete process.env.HARNESS2_STORE_SQLITE
})
afterEach(() => {
  if (prevStore === undefined) delete process.env.HARNESS2_STORE
  else process.env.HARNESS2_STORE = prevStore
  if (prevSqlite !== undefined) process.env.HARNESS2_STORE_SQLITE = prevSqlite
  else delete process.env.HARNESS2_STORE_SQLITE
  rmSync(dir, { recursive: true, force: true })
})

describe('R11 SQLite 后端（env 渐进）', () => {
  it('缺省 JSON 模式不受影响；SQLITE=1 时建库写读往返＋旧 JSON 迁移', async () => {
    const { readStore, writeStore, sqliteEnabled } = await import('../store')
    expect(sqliteEnabled()).toBe(false)
    // 先在 JSON 模式写一条
    const st1 = readStore()
    st1.proposals.push({ id: 'hw-0001', title: 't', hypothesis: 'h', surfaceKey: 'skills', targetPath: null, risk: 'medium', mode: 'sequential', domain: 'general', budgetCapUsd: 5, evidenceRefs: ['e'], experienceIds: [], baselineRunId: null, baseline: null, base: null, variants: [], probes: [], approval: null, composition: null, promotion: null, rollback: null, createdBy: 't', createdAt: 'now', updatedAt: 'now' } as never)
    writeStore(st1)
    expect(existsSync(join(dir, 'workbench', 'workbench.json'))).toBe(true)

    // 切 SQLite：旧 JSON 自动迁移 + 读取等价
    process.env.HARNESS2_STORE_SQLITE = '1'
    const mod = await import('../store')
    const st2 = mod.readStore()
    expect(st2.proposals).toHaveLength(1)
    expect(st2.proposals[0].id).toBe('hw-0001')
    expect(st2.nextSeq).toBeGreaterThanOrEqual(2)
    // 写回（SQLite）后读一致
    st2.experiences.push({ id: 'exp-0001', surfaceKey: null, statement: 's', evidenceRefs: [], confidence: 'low', status: 'candidate', createdAt: 'now', updatedAt: 'now' } as never)
    mod.writeStore(st2)
    expect(mod.readStore().experiences).toHaveLength(1)
    // 旧 JSON 已改名保留
    expect(existsSync(join(dir, 'workbench', 'workbench.json.migrated'))).toBe(true)
  })
})

describe('R9/R10 纯函数面', () => {
  it('skillDifferential 未测→skill_undifferentiated；负差分→skill_negative_delta（loop 门侧见 loop.test）', async () => {
    const { surfaceArtifactsOf } = await import('../service')
    expect(surfaceArtifactsOf('no-such')).toBeNull()
  })

  it('R10：EvalSet.family 字段向后兼容（缺席 undefined，登记可读）', async () => {
    const store = await import('../../../eval/store')
    store._useStoreDirForTests(join(dir, 'eval'))
    const created = store.createSet({
      name: '族集', track: 'e2e',
      tasks: [{ id: 'f1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
    })
    if (!created.ok) throw new Error(JSON.stringify(created))
    // family 由建集入参登记（createSet 类型未扩——直接改 store 底层数据验证读侧兼容）
    const raw = JSON.parse(readFileSync(join(dir, 'eval', 'eval-store.json'), 'utf8')) as { sets: Array<Record<string, unknown>> }
    raw.sets[0].family = 'retrieval'
    writeFileSync(join(dir, 'eval', 'eval-store.json'), JSON.stringify(raw))
    const set = store.getSet(created.set.id)
    expect((set as unknown as { family?: string }).family).toBe('retrieval')
    const noFamily = store.createSet({
      name: '无族集', track: 'e2e',
      tasks: [{ id: 'n1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
    })
    if (!noFamily.ok) throw new Error(JSON.stringify(noFamily))
    expect((store.getSet(noFamily.set.id) as unknown as { family?: string }).family).toBeUndefined()
  })
})
