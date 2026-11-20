// overlay[judgment] 判定席位 · 快路径固化/撤回单测（Agnes Harness 吸收批二）。
import { describe, it, expect } from 'vitest'
import {
  newCandidate,
  observeEntry,
  revokeEntry,
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

function observe(over: Partial<Parameters<typeof observeEntry>[2]> = {}) {
  return { option: 'PASS', confidence: 0.9, verified: true, at: 10, ...over }
}

describe('快路径固化', () => {
  it('同情境同版本同选项连续 3 次 verified：active', () => {
    const req = request()
    let entry: FastPathEntry | null = null
    for (let i = 0; i < 3; i += 1) entry = observeEntry(entry, req, observe({ at: 10 + i }))
    expect(entry?.status).toBe('active')
    expect(entry?.verifiedCount).toBe(3)
  })

  it('只观察 2 次：仍是 candidate，不可命中', () => {
    const req = request()
    let entry: FastPathEntry | null = null
    for (let i = 0; i < 2; i += 1) entry = observeEntry(entry, req, observe({ at: 10 + i }))
    expect(entry?.status).toBe('candidate')
    expect(entry?.verifiedCount).toBe(2)
  })

  it('未验证的观察不计数（模型自己的输出不能给自己当证据）', () => {
    const req = request()
    const first = observeEntry(null, req, observe({ at: 10 }))
    const second = observeEntry(first, req, observe({ verified: false, at: 11 }))
    expect(second?.verifiedCount).toBe(1)
  })

  it('低置信观察不计数', () => {
    const req = request()
    const first = observeEntry(null, req, observe({ at: 10 }))
    const second = observeEntry(first, req, observe({ confidence: 0.1, at: 11 }))
    expect(second?.verifiedCount).toBe(1)
  })

  it('选项变化：重建候选，计数从 1 开始（不把两种结论混成一条）', () => {
    const req = request()
    let entry: FastPathEntry | null = null
    for (let i = 0; i < 2; i += 1) entry = observeEntry(entry, req, observe({ at: 10 + i }))
    entry = observeEntry(entry, req, observe({ option: 'BLOCK', at: 12 }))
    expect(entry?.status).toBe('candidate')
    expect(entry?.option).toBe('BLOCK')
    expect(entry?.verifiedCount).toBe(1)
  })

  it('策略/模型版本变化：旧计数不迁移，新版本从 1 开始', () => {
    const req = request()
    let entry: FastPathEntry | null = null
    for (let i = 0; i < 2; i += 1) entry = observeEntry(entry, req, observe({ at: 10 + i }))
    const next = observeEntry(entry, request({ policyVersion: 'policy-2' }), observe({ at: 12 }))
    expect(next?.policyVersion).toBe('policy-2')
    expect(next?.verifiedCount).toBe(1)
    expect(next?.status).toBe('candidate')
  })

  it('无既有条目且观察未验证：不落盘', () => {
    expect(observeEntry(null, request(), observe({ verified: false }))).toBeNull()
  })
})

describe('快路径撤回', () => {
  it('人工翻案：立即 revoked，不再累加', () => {
    const req = request()
    const active = observeEntry(observeEntry(observeEntry(null, req, observe()), req, observe()), req, observe())
    const revoked = observeEntry(active, req, observe({ overturned: true, at: 99 }))
    expect(revoked?.status).toBe('revoked')
    expect(revoked?.revokedAt).toBe(99)
  })

  it('已撤回的条目不会被后续验证自动复活', () => {
    const req = request()
    const revoked = revokeEntry({ ...newCandidate(req, 1), status: 'active', verifiedCount: 3, option: 'PASS', confidence: 0.9 } as FastPathEntry, 'manual', 5)
    const next = observeEntry(revoked, req, observe({ at: 10 }))
    expect(next?.status).toBe('revoked')
  })
})
