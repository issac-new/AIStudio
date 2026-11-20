// overlay[judgment] 判定席位 · 回交与快路径裁决单测（Agnes Harness 吸收批二）。
import { describe, it, expect } from 'vitest'
import {
  advanceConsecutiveAuto,
  resolveSeatPolicy,
  seatMode,
  type FastPathEntry,
  type SeatRequest,
} from '../index'

function request(over: Partial<SeatRequest> = {}): SeatRequest {
  return {
    situationKey: 'input:abc',
    policyVersion: 'policy-1',
    modelVersion: 'model-1',
    options: ['PASS', 'BLOCK'],
    ...over,
  }
}

function entry(over: Partial<FastPathEntry> = {}): FastPathEntry {
  const now = Date.now()
  return {
    situationKey: 'input:abc',
    policyVersion: 'policy-1',
    modelVersion: 'model-1',
    option: 'PASS',
    confidence: 0.9,
    verifiedCount: 3,
    status: 'active',
    createdAt: now - 1000,
    lastVerifiedAt: now - 1000,
    ...over,
  }
}

describe('席位回交条件', () => {
  it('用户刚发言优先于其他条件：第一步永远交慢系统', () => {
    const seat = seatMode(request({ facts: { userJustSpoke: true, priorStepFailed: true } }), {}, () => entry())
    expect(seat.mode).toBe('hand-back')
    if (seat.mode === 'hand-back') expect(seat.reason).toBe('user_turn')
  })

  it('上一步失败：不走快路径', () => {
    const seat = seatMode(request({ facts: { priorStepFailed: true } }), {}, () => entry())
    expect(seat.mode).toBe('hand-back')
    if (seat.mode === 'hand-back') expect(seat.reason).toBe('prior_failure')
  })

  it('连续自动判定达上限：强制回交（默认 3）', () => {
    const seat = seatMode(request({ facts: { consecutiveAuto: 3 } }), {}, () => entry())
    expect(seat.mode).toBe('hand-back')
    if (seat.mode === 'hand-back') expect(seat.reason).toBe('consecutive_cap')
  })

  it('策略不一致：回交而不是继续用旧快路径', () => {
    const seat = seatMode(request({ facts: { policyMismatch: true } }), {}, () => entry())
    expect(seat.mode).toBe('hand-back')
    if (seat.mode === 'hand-back') expect(seat.reason).toBe('policy_mismatch')
  })

  it('情境键/版本缺失或选项为空：不可复现，回交', () => {
    expect(seatMode(request({ situationKey: '  ' })).mode).toBe('hand-back')
    expect(seatMode(request({ policyVersion: '' })).mode).toBe('hand-back')
    expect(seatMode(request({ modelVersion: '' })).mode).toBe('hand-back')
    expect(seatMode(request({ options: [] })).mode).toBe('hand-back')
  })
})

describe('快路径裁决', () => {
  it('active + 版本匹配 + 选项在允许集 + 置信度过线：命中', () => {
    const seat = seatMode(request(), {}, () => entry())
    expect(seat.mode).toBe('fast-path')
    if (seat.mode === 'fast-path') {
      expect(seat.entry.option).toBe('PASS')
      expect(seat.reason).toContain('3 次一致')
    }
  })

  it('未固化（candidate / 次数不足）：继续原判定', () => {
    expect(seatMode(request(), {}, () => entry({ status: 'candidate' })).mode).toBe('evaluate')
    expect(seatMode(request(), {}, () => entry({ verifiedCount: 2 })).mode).toBe('evaluate')
  })

  it('策略或模型版本不符：快路径失效', () => {
    const p = seatMode(request(), {}, () => entry({ policyVersion: 'policy-2' }))
    expect(p.mode).toBe('evaluate')
    if (p.mode === 'evaluate') expect(p.reason).toContain('策略版本不符')
    const m = seatMode(request(), {}, () => entry({ modelVersion: 'model-2' }))
    expect(m.mode).toBe('evaluate')
    if (m.mode === 'evaluate') expect(m.reason).toContain('模型版本不符')
  })

  it('快路径选项不在允许集：不命中（防止旧选项越权）', () => {
    const seat = seatMode(request({ options: ['PASS'] }), {}, () => entry({ option: 'BLOCK' }))
    expect(seat.mode).toBe('evaluate')
  })

  it('置信度低于阈值：不命中', () => {
    const seat = seatMode(request(), { minConfidence: 0.95 }, () => entry({ confidence: 0.9 }))
    expect(seat.mode).toBe('evaluate')
  })

  it('超过最大有效期：不命中', () => {
    const seat = seatMode(request(), {}, () => entry({ lastVerifiedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 }))
    expect(seat.mode).toBe('evaluate')
    if (seat.mode === 'evaluate') expect(seat.reason).toContain('过期')
  })

  it('条目情境键与请求不符：不命中（防串键/伪造）', () => {
    const seat = seatMode(request(), {}, () => entry({ situationKey: 'input:other' }))
    expect(seat.mode).toBe('evaluate')
    if (seat.mode === 'evaluate') expect(seat.reason).toContain('情境键不符')
  })

  it('无 lookup：永远 evaluate（默认不改变旧行为）', () => {
    expect(seatMode(request()).mode).toBe('evaluate')
  })
})

describe('席位策略', () => {
  it('默认值：3 步/0.8/3 次/30 天', () => {
    expect(resolveSeatPolicy()).toEqual({
      maxConsecutiveAuto: 3,
      minConfidence: 0.8,
      solidifyAfter: 3,
      maxEntryAgeMs: 30 * 24 * 60 * 60 * 1000,
    })
  })

  it('连续计数推进：快路径 +1，其余归零', () => {
    expect(advanceConsecutiveAuto(2, 'fast-path')).toBe(3)
    expect(advanceConsecutiveAuto(2, 'evaluate')).toBe(0)
    expect(advanceConsecutiveAuto(2, 'hand-back')).toBe(0)
  })
})
