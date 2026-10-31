// D11 记忆压缩/遗忘策略（2026-10-31 RSI P2 批）＋保鲜层既有语义锚。
import { describe, it, expect } from 'vitest'
import {
  memoryConsolidationPolicy, ORPHAN_CANDIDATE_DAYS,
  experienceFreshness, decayedConfidence, HALF_LIFE_DAYS, FRESH_AGING_DAYS,
} from '../experience-freshness'

const NOW = new Date('2026-10-31T00:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('保鲜层语义锚（HP-7 既有）', () => {
  it('半衰期衰减：90 天恰好减半；band 阈值 fresh/aging/stale', () => {
    expect(decayedConfidence(0.9, HALF_LIFE_DAYS)).toBeCloseTo(0.45, 3)
    expect(experienceFreshness({ confidence: 'high', createdAt: daysAgo(10) }, NOW).band).toBe('fresh')
    expect(experienceFreshness({ confidence: 'high', createdAt: daysAgo(60) }, NOW).band).toBe('aging')
    expect(experienceFreshness({ confidence: 'high', createdAt: daysAgo(FRESH_AGING_DAYS + 1) }, NOW).band).toBe('stale')
  })
})

describe('D11 记忆压缩/遗忘策略', () => {
  it('stale 采纳→revalidate；孤儿候选→retire；健康面 hint 如实', () => {
    const policy = memoryConsolidationPolicy([
      { id: 'e-stale', statement: '先复现再改', status: 'adopted', confidence: 'high', createdAt: daysAgo(200) },
      { id: 'e-fresh', statement: '新采纳', status: 'adopted', confidence: 'medium', createdAt: daysAgo(5), lastValidatedAt: daysAgo(2) },
      { id: 'e-orphan', statement: '老候选', status: 'candidate', confidence: 'low', createdAt: daysAgo(ORPHAN_CANDIDATE_DAYS + 5) },
      { id: 'e-young', statement: '新候选', status: 'candidate', confidence: 'medium', createdAt: daysAgo(3) },
      { id: 'e-retired', statement: '已退役', status: 'retired', confidence: 'low', createdAt: daysAgo(300) },
    ], NOW)
    expect(policy.counts).toEqual({ adopted: 2, candidate: 2, retired: 1 })
    expect(policy.staleAdopted.map((x) => x.id)).toEqual(['e-stale'])
    expect(policy.staleAdopted[0].action).toBe('revalidate')
    expect(policy.orphanCandidates.map((x) => x.id)).toEqual(['e-orphan'])
    expect(policy.orphanCandidates[0].action).toBe('retire')
    expect(policy.hint).toContain('再验证')
    expect(policy.hint).toContain('退役')
    expect(policy.hint).toContain('不是保留依据')
  })

  it('再验证刷新锚：lastValidatedAt 近期 → adopted 不入 stale（HP-7 通道即再验证动作）', () => {
    const policy = memoryConsolidationPolicy([
      { id: 'e-revived', statement: '被再验证', status: 'adopted', confidence: 'high', createdAt: daysAgo(200), lastValidatedAt: daysAgo(10) },
    ], NOW)
    expect(policy.staleAdopted).toEqual([])
    expect(policy.hint).toContain('记忆面健康')
  })

  it('空库与边界龄（<14 天不入孤儿、恰 14 天入；恰 90 天入 stale）', () => {
    expect(memoryConsolidationPolicy([], NOW).hint).toContain('记忆面健康')
    const edge = memoryConsolidationPolicy([
      { id: 'e-edge-c', statement: '13 天候选', status: 'candidate', confidence: 'low', createdAt: daysAgo(ORPHAN_CANDIDATE_DAYS - 1) },
      { id: 'e-edge-o', statement: '恰 14 天候选', status: 'candidate', confidence: 'low', createdAt: daysAgo(ORPHAN_CANDIDATE_DAYS) },
      { id: 'e-edge-a', statement: '89 天采纳', status: 'adopted', confidence: 'high', createdAt: daysAgo(FRESH_AGING_DAYS - 1) },
      { id: 'e-edge-s', statement: '恰 90 天采纳', status: 'adopted', confidence: 'high', createdAt: daysAgo(FRESH_AGING_DAYS) },
    ], NOW)
    expect(edge.orphanCandidates.map((x) => x.id)).toEqual(['e-edge-o'])
    expect(edge.staleAdopted.map((x) => x.id)).toEqual(['e-edge-s'])
  })
})
