// 本体存储守门：spec/instances 往返、保存版本链（version+1/priorVersion/versionIri 重算）、
// 快照保留上限、回滚另存与恢复、种子重置可回滚。env 指向 tmpdir，不落宿主目录。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deleteInstance, listSpecSnapshots, loadInstances, loadSpec, resetToSeed, rollbackSpec, saveSpec, upsertInstance,
} from '../ontology-store'
import { seedSpec } from '../ontology-seed'
import type { OntologyInstance } from '../ontology-types'

let dir: string
const NOW = 1_700_000_000_000

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'onto-'))
  process.env.ONTOLOGY_DIR = dir
  process.env.ONTOLOGY_SNAPSHOT_MAX = '3'
  // 冷启动播种是生产语义（开箱可校验）；本组测试自控起始态，显式从空实例起
  writeFileSync(join(dir, 'instances.json'), '[]')
})

afterEach(() => {
  delete process.env.ONTOLOGY_DIR
  delete process.env.ONTOLOGY_SNAPSHOT_MAX
  rmSync(dir, { recursive: true, force: true })
})

function inst(id: string, type: string, data: Record<string, unknown>): OntologyInstance {
  return { id, type, label: id, data, relations: [], updatedAt: NOW }
}

describe('loadSpec 冷启动', () => {
  it('首次访问落种子 v1，二次读同一份（往返一致）', () => {
    const s1 = loadSpec()
    expect(s1.version).toBe(1)
    expect(s1.entityTypes.length).toBeGreaterThan(10)
    const s2 = loadSpec()
    expect(s2.updatedAt).toBe(s1.updatedAt)
  })

  it('损坏 ontology.json 只读返回内存种子，不覆盖原文件', () => {
    writeFileSync(join(dir, 'ontology.json'), '{broken')
    const s = loadSpec()
    expect(s.entityTypes.length).toBeGreaterThan(0)
    expect(readFileSync(join(dir, 'ontology.json'), 'utf8')).toBe('{broken')
  })
})

describe('saveSpec 版本链', () => {
  it('保存 version+1、priorVersion 记上一版、versionIri 重算', () => {
    loadSpec()
    const next = seedSpec(NOW)
    next.entityTypes.push({
      id: 'Extra', label: '扩展类型', category: '工作对象', modality: 'may', key: 'name',
      dataProperties: [{ id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' }],
    })
    const r = saveSpec(next, 'tester', NOW)
    expect(r.ok).toBe(true)
    expect(r.spec!.version).toBe(2)
    expect(r.spec!.priorVersion).toBe(1)
    expect(r.spec!.versionIri).toContain('/v2')
    expect(loadSpec().version).toBe(2)
  })

  it('模式层 error 拒写（保存前快照不产生，正本不动）', () => {
    const before = loadSpec()
    const bad = seedSpec(NOW)
    bad.namespace = 'broken'
    const r = saveSpec(bad)
    expect(r.ok).toBe(false)
    expect(loadSpec().version).toBe(before.version)
    expect(listSpecSnapshots()).toHaveLength(0)
  })
})

describe('upsertInstance 写入即校验', () => {
  it('error 违规拒写（status 越枚举）；warning 放行并带回', () => {
    const bad = inst('t1', 'Task', { title: 'x', status: 'banana' })
    const r1 = upsertInstance(bad)
    expect(r1.ok).toBe(false)
    expect(loadInstances()).toHaveLength(0)
    const soft = inst('w1', 'WikiPage', { path: 'docs/wiki/a.md' })  // 缺 documents（should→warning）
    const r2 = upsertInstance(soft)
    expect(r2.ok).toBe(true)
    expect(r2.violations.some((v) => v.severity === 'warning')).toBe(true)
    expect(loadInstances()).toHaveLength(1)
  })

  it('重复 id 新增拒绝；PUT 替换成功；删除后悬空关系放行', () => {
    const g = inst('g1', 'Gate', { name: 'vitest' })
    expect(upsertInstance(g).ok).toBe(true)
    expect(upsertInstance(g).ok).toBe(false)  // dup
    const d = inst('d1', 'Deliverable', { path: 'x.ts' })
    d.relations = [{ property: 'verifiedBy', target: 'g1' }]
    expect(upsertInstance(d).ok).toBe(true)
    const d2 = { ...d, label: '改', relations: [{ property: 'verifiedBy', target: 'g1' }] }
    expect(upsertInstance(d2, 'd1').ok).toBe(true)
    expect(loadInstances()).toHaveLength(2)
    expect(deleteInstance('g1')).toBe(true)   // d1 悬空——放行，跑批时呈现
    expect(deleteInstance('ghost')).toBe(false)
    expect(loadInstances()).toHaveLength(1)
  })
})

describe('快照与回滚', () => {
  it('快照保留上限 prune；回滚先另存 pre-rollback 再恢复快照态', () => {
    loadSpec()
    for (let i = 0; i < 5; i++) {
      const r = saveSpec(seedSpec(NOW + i), 't', NOW + i)
      expect(r.ok).toBe(true)
    }
    const snaps = listSpecSnapshots()
    expect(snaps.length).toBeLessThanOrEqual(3)  // ONTOLOGY_SNAPSHOT_MAX=3
    expect(snaps[0].ts).toBeGreaterThanOrEqual(snaps[snaps.length - 1].ts)  // ts 降序
    // 回滚到最旧可用快照
    const oldest = snaps[snaps.length - 1]
    const rb = rollbackSpec(oldest.ts, NOW + 99_999)
    expect(rb.ok).toBe(true)
    expect(rb.restoredVersion).toBe(oldest.version)
    expect(readdirSync(join(dir, 'snapshots')).some((f) => f.startsWith('pre-rollback-'))).toBe(true)
    expect(loadSpec().version).toBe(oldest.version)
    expect(rollbackSpec(999).ok).toBe(false)  // 不存在的快照
  })
})

describe('resetToSeed', () => {
  it('重置前快照可回滚；重置后种子实例就位', () => {
    loadSpec()
    saveSpec(seedSpec(NOW), 't', NOW)
    const r = resetToSeed(NOW + 1000)
    expect(r.ok).toBe(true)
    expect(r.instances.length).toBe(2)
    expect(loadSpec().version).toBe(1)
    expect(r.snapshot).toBeTruthy()
  })
})
