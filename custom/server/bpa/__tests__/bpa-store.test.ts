// bpa 存储面测试：fail-soft 读、upsert 结构完整性、级联删除引用清理、编号字典。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readArchitecture, writeArchitecture, upsertNode, deleteNodeCascade,
  isValidNodeId, BpaUpsertError, appendMaturity, readMaturityHistory, pemmOverall,
} from '../bpa-store'
import type { BpaNode } from '../bpa-types'

let dir: string
const archFile = () => join(dir, 'arch.json')
const matFile = () => join(dir, 'mat.json')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpa-store-'))
  process.env.BPA_STORE = archFile()
  process.env.BPA_MATURITY_STORE = matFile()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.BPA_STORE
  delete process.env.BPA_MATURITY_STORE
})

function n(partial: Partial<BpaNode> & { id: string; level: number; parentId: string | null }): BpaNode {
  return { name: `节点${partial.id}`, updatedAt: 0, ...partial } as BpaNode
}

describe('bpa-store', () => {
  it('fail-soft：文件缺失 → 空架构+默认配置', () => {
    const arch = readArchitecture()
    expect(arch.nodes).toEqual([])
    expect(arch.config.framework).toBe('OES+PCF6')
    expect(arch.config.maxDepth).toBe(6)
  })

  it('fail-soft：文件损坏 → 空架构（不抛）', () => {
    writeFileSync(archFile(), '{broken json', 'utf8')
    expect(readArchitecture().nodes).toEqual([])
  })

  it('编号字典：层级与编号前缀一致性', () => {
    expect(isValidNodeId('L1-06', 1)).toBe(true)
    expect(isValidNodeId('L3-06-02-01', 3)).toBe(true)
    expect(isValidNodeId('L3-06-02', 3)).toBe(false)   // 段数不够
    expect(isValidNodeId('L2-06-02-01', 2)).toBe(false) // 前缀层级不符
    expect(isValidNodeId('X1-06', 1)).toBe(false)
  })

  it('upsert：跨级悬挂被 forbidSkippingLevel 拦截', () => {
    const arch = readArchitecture()
    upsertNode(arch, n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }))
    expect(() => upsertNode(arch, n({ id: 'L3-01-01-01', level: 3, parentId: 'L1-01' }))).toThrow(BpaUpsertError)
  })

  it('upsert：编号与层级不匹配被拦截；L1 带父节点被拦截', () => {
    const arch = readArchitecture()
    expect(() => upsertNode(arch, n({ id: 'L2-01', level: 1, parentId: null }))).toThrow(BpaUpsertError)
    expect(() => upsertNode(arch, n({ id: 'L1-02', level: 1, parentId: 'L1-01' }))).toThrow(BpaUpsertError)
  })

  it('upsert：合法链路可写入且覆盖更新', () => {
    const arch = readArchitecture()
    upsertNode(arch, n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING', owner: '甲' }))
    upsertNode(arch, n({ id: 'L2-01-01', level: 2, parentId: 'L1-01', owner: '乙' }))
    upsertNode(arch, n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', owner: '丙' }))
    expect(arch.nodes).toHaveLength(3)
    upsertNode(arch, n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01', owner: '丙改', name: '改名' }))
    expect(arch.nodes).toHaveLength(3)
    expect(arch.nodes.find((x) => x.id === 'L3-01-01-01')?.owner).toBe('丙改')
  })

  it('级联删除：子孙连删 + drivers/supports 引用就地摘除', () => {
    const arch = readArchitecture()
    upsertNode(arch, n({ id: 'L1-01', level: 1, parentId: null, section: 'OPERATING' }))
    upsertNode(arch, n({ id: 'L2-01-01', level: 2, parentId: 'L1-01' }))
    upsertNode(arch, n({ id: 'L3-01-01-01', level: 3, parentId: 'L2-01-01' }))
    upsertNode(arch, n({ id: 'L1-02', level: 1, parentId: null, section: 'SUPPORTING', drivers: ['L3-01-01-01'] }))
    const removed = deleteNodeCascade(arch, 'L1-01')
    expect(removed.sort()).toEqual(['L1-01', 'L2-01-01', 'L3-01-01-01'])
    expect(arch.nodes.find((x) => x.id === 'L1-02')?.drivers).toEqual([])
  })

  it('成熟度：历史追加截尾 50 + 短板决定论', () => {
    expect(pemmOverall({ design: 2, leadership: 3 })).toBe(2)
    expect(pemmOverall({})).toBeNull()
    for (let i = 0; i < 55; i++) {
      appendMaturity({ id: `p${i}`, scoredAt: i, scores: { design: (i % 5) as 0 | 1 | 2 | 3 | 4 } })
    }
    const history = readMaturityHistory()
    expect(history).toHaveLength(50)
    expect(history[0]?.id).toBe('p5')
  })
})
