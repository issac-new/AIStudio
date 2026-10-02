// A3 守门（KG 演化治理 2026-10-02）：合并治理分级三档 + 熔断边界口径
//（**严格大于**阈值才熔断，恰好 0.20 归 auto）+ env 覆盖回落。
import { describe, it, expect } from 'vitest'
import { classifyBatch, breakerRatioFromEnv, DEFAULT_BREAKER_RATIO } from '../merge-governance'

const E = (id: string, type = 'agent') => ({ id, type, props: { name: id, type } })
const R = (src: string, dst: string, type = 'performed') => ({ src, dst, type })

describe('classifyBatch：auto/manual 分级', () => {
  it('普通新增实体 + 已知谓词关系 = 全 auto（performed 冷启动白名单）', () => {
    const r = classifyBatch({
      newEntities: [E('task:t1', 'task'), E('agent:a')],
      newRelations: [R('agent:a', 'task:t1')],
      existingNodeCount: 0,
      existingRelationTypes: new Set<string>(),  // 空图：performed 也视为已知（摄取原生谓词）
    })
    expect(r.breaker).toBe(false)
    expect(r.auto.entities.map((e) => e.id)).toEqual(['task:t1', 'agent:a'])
    expect(r.auto.relations).toHaveLength(1)
    expect(r.manual.entities).toHaveLength(0)
  })

  it('新关系谓词（existingRelationTypes 没有）→ 实体+关系均 manual（结构性变更）', () => {
    const r = classifyBatch({
      newEntities: [E('task:t1', 'task'), E('agent:a')],
      newRelations: [{ src: 'agent:a', dst: 'task:t1', type: 'supervised' }],
      existingNodeCount: 10,
      existingRelationTypes: new Set(['performed']),
    })
    expect(r.auto.entities).toHaveLength(0)
    expect(r.manual.entities.map((e) => e.id)).toEqual(['task:t1', 'agent:a'])
    expect(r.manual.relations).toHaveLength(1)
    expect(r.auto.relations).toHaveLength(0)
  })

  it('单实体新增关系数 >3 → manual；恰好 3 条仍 auto（边界：> 严格）', () => {
    // agent:a 连出 3 条 performed（恰好阈值）→ auto
    const ok = classifyBatch({
      newEntities: [E('agent:a'), E('task:t1', 'task'), E('task:t2', 'task'), E('task:t3', 'task')],
      newRelations: [R('agent:a', 'task:t1'), R('agent:a', 'task:t2'), R('agent:a', 'task:t3')],
      existingNodeCount: 100,
      existingRelationTypes: new Set(['performed']),
    })
    expect(ok.auto.entities).toHaveLength(4)
    expect(ok.auto.relations).toHaveLength(3)

    // 第 4 条 → 超阈 → agent:a 转 manual，其关系牵连扣（不写悬空边）；task 实体不受牵连
    const over = classifyBatch({
      newEntities: [E('agent:a'), E('task:t1', 'task'), E('task:t2', 'task'), E('task:t3', 'task'), E('task:t4', 'task')],
      newRelations: [R('agent:a', 'task:t1'), R('agent:a', 'task:t2'), R('agent:a', 'task:t3'), R('agent:a', 'task:t4')],
      existingNodeCount: 100,
      existingRelationTypes: new Set(['performed']),
    })
    expect(over.manual.entities.map((e) => e.id)).toEqual(['agent:a'])
    expect(over.manual.relations).toHaveLength(4)
    expect(over.auto.entities.map((e) => e.id)).toEqual(['task:t1', 'task:t2', 'task:t3', 'task:t4'])
  })
})

describe('classifyBatch：熔断边界口径', () => {
  it('恰好等于 0.20（2/10）不熔断；超过（3/10）熔断且全批转 manual 附原因', () => {
    const at = classifyBatch({
      newEntities: [E('a'), E('b')],
      newRelations: [],
      existingNodeCount: 10,
      existingRelationTypes: new Set(['performed']),
    })
    expect(at.breaker).toBe(false)  // 2/10 = 0.20 恰好等于 → 归 auto（口径：严格大于）
    expect(at.auto.entities).toHaveLength(2)

    const over = classifyBatch({
      newEntities: [E('a'), E('b'), E('c')],
      newRelations: [R('agent:a', 'task:x', 'task')],
      existingNodeCount: 10,
      existingRelationTypes: new Set(['performed']),
    })
    expect(over.breaker).toBe(true)
    expect(over.reason).toContain('熔断')
    expect(over.manual.entities).toHaveLength(3)
    expect(over.manual.relations).toHaveLength(1)  // 全批转 manual（含关系）
    expect(over.auto.entities).toHaveLength(0)
  })

  it('空图冷启动豁免：existingNodeCount=0 不评估熔断', () => {
    const r = classifyBatch({
      newEntities: Array.from({ length: 50 }, (_, i) => E(`a${i}`)),
      newRelations: [],
      existingNodeCount: 0,
      existingRelationTypes: new Set<string>(),
    })
    expect(r.breaker).toBe(false)
    expect(r.auto.entities).toHaveLength(50)
  })

  it('breakerRatio 可调：0.5 时 3/10 不熔断', () => {
    const r = classifyBatch({
      newEntities: [E('a'), E('b'), E('c')],
      newRelations: [],
      existingNodeCount: 10,
      existingRelationTypes: new Set(['performed']),
      opts: { breakerRatio: 0.5 },
    })
    expect(r.breaker).toBe(false)
  })
})

describe('breakerRatioFromEnv', () => {
  it('env 覆盖生效；非法值/缺席回落默认 0.20', () => {
    expect(breakerRatioFromEnv()).toBe(DEFAULT_BREAKER_RATIO)
    process.env.KG_MERGE_BREAKER_RATIO = '0.5'
    expect(breakerRatioFromEnv()).toBe(0.5)
    process.env.KG_MERGE_BREAKER_RATIO = 'abc'
    expect(breakerRatioFromEnv()).toBe(0.2)
    delete process.env.KG_MERGE_BREAKER_RATIO
  })
})
