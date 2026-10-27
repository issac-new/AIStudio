// 硬闸打回熔断守门（融合批一）：语义正本自 simharness mx_gate_breaker_trip/check
// （mx-scenario-lib.sh:1880-1923）提纯——跨调用持久与留痕副作用外置到调用方，
// 本模块只保留判定语义（阈值 2/证据变化复位/人工复议须带原因/记单幂等标志）。
import { describe, expect, it } from 'vitest'
import { BREAKER_THRESHOLD, checkBreaker, initialBreaker, tripBreaker } from '../lifecycle/breaker'

describe('tripBreaker（记 N 轮未过 + 证据签名快照）', () => {
  it('轮次累加并落签名', () => {
    const s1 = tripBreaker(initialBreaker(), 1, 'sig-a')
    expect(s1).toEqual({ failRounds: 1, tripSig: 'sig-a', trippedLogged: false })
    const s2 = tripBreaker(s1, 1, 'sig-b')
    expect(s2.failRounds).toBe(2)
    expect(s2.tripSig).toBe('sig-b')
  })
})

describe('checkBreaker（阈值/证据变化复位/人工复议）', () => {
  it('未达阈值放行', () => {
    expect(checkBreaker({ failRounds: 1, tripSig: 's', trippedLogged: false }, 's'))
      .toMatchObject({ action: 'allow' })
  })

  it('达阈值且证据零变化 → block；首次记单幂等标志只在第一次置位', () => {
    const s = { failRounds: 2, tripSig: 's', trippedLogged: false }
    const r1 = checkBreaker(s, 's')
    expect(r1.action).toBe('block')
    if (r1.action === 'block') expect(r1.firstLog).toBe(true)
    const r2 = checkBreaker({ ...s, trippedLogged: true }, 's')
    expect(r2.action).toBe('block')
    if (r2.action === 'block') expect(r2.firstLog).toBe(false)
  })

  it('证据变化自动复位（签名漂移=新尝试，拦空转不拦改进）', () => {
    const r = checkBreaker({ failRounds: 2, tripSig: 'old', trippedLogged: true }, 'new')
    expect(r.action).toBe('reset')
    if (r.action === 'reset') expect(r.state.failRounds).toBe(0)
  })

  it('人工复议缺原因 → 拒绝放行（overrideRefused）', () => {
    const r = checkBreaker(
      { failRounds: 2, tripSig: 's', trippedLogged: false },
      's',
      { flag: true, reason: '' },
    )
    expect(r.action).toBe('override-refused')
  })

  it('人工复议带原因 → 放行并复位（approved 事件由调用方落）', () => {
    const r = checkBreaker(
      { failRounds: 2, tripSig: 's', trippedLogged: false },
      's',
      { flag: true, reason: '卡面终判词与复审 PASS 已核实' },
    )
    expect(r.action).toBe('override')
    if (r.action === 'override') expect(r.state.failRounds).toBe(0)
  })

  it('阈值为 2（V3 硬闸口径）', () => {
    expect(BREAKER_THRESHOLD).toBe(2)
  })
})
