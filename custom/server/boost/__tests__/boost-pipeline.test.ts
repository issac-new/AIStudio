// /boost 管线守门（antigravity：断言回灌/一致数胜出/多数一致 verified）。
import { describe, it, expect } from 'vitest'
import { boostPipeline, type BoostCandidate } from '../boost-pipeline'

const c = (id: string, answer: string, assertions: string[] = []): BoostCandidate => ({ candidateId: id, answer, assertions })

describe('/boost 管线（antigravity 语义）', () => {
  it('断言回灌聚合；一致数胜出；多数一致才算 verified', () => {
    const r = boostPipeline([
      c('a', 'X', ['断言1']), c('b', 'X', ['断言1', '断言2']), c('c', 'Y', ['断言3']),
    ])
    expect(r.winner).toBe('a')  // X 答案 2 路一致
    expect(r.mergedAssertions.sort()).toEqual(['断言1', '断言2', '断言3'])  // 回灌去重
    expect(r.verified).toBe(true)  // 2/3 过半
    expect(boostPipeline([])).toMatchObject({ winner: null, verified: false })
    // 单路候选不 verified（无独立验证）。
    expect(boostPipeline([c('x', 'Z')])).toMatchObject({ verified: false })
  })
})
