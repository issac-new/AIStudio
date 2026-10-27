// 红队 S1 分层复评测试（挂账清偿批）：判定链复用（judge 注入）、fail-open 如实、
// 幸存者确定性复放、分层口径（isolated/confirmed/passed/failOpen）。
import { describe, expect, it } from 'vitest'
import { JudgeUnavailableError } from '../../toolresultguard/client'
import type { EvaluateDeps } from '../../toolresultguard/decide'
import { attackSeeds } from '../corpus'
import { s0Detect } from '../detector'
import { s1Evaluate, s1Unavailable } from '../detector'
import { DEFAULT_REDTEAM_CONFIG, replaySurvivorTexts, runRedteam } from '../engine'

/** S0 能抓到的高分文本（保证过 s0Gate=1，S1 才会被付判定成本）。 */
function suspiciousText(): string {
  const seed = attackSeeds().find((s) => s0Detect(s.text, 1).detected)
  if (!seed) throw new Error('语料中无可疑样本（测试前提失效）')
  return seed.text
}

function judgeDeps(answers: { attackP: number; category: string | null; severity: number } | 'throw'): Pick<EvaluateDeps, 'judge'> {
  return {
    judge: async () => {
      if (answers === 'throw') throw new JudgeUnavailableError('judge endpoint down (test)')
      return answers
    },
  }
}

describe('s1Evaluate（toolresultguard 同源判定链复用）', () => {
  it('高置信攻击 → 重处置裁决（非 PASS），攻击概率/类别原样透传', async () => {
    const d = await s1Evaluate(suspiciousText(), judgeDeps({ attackP: 0.93, category: 'A2_prompt_injection', severity: 2.4 }))
    expect(['s1', 's1-calibrated']).toContain(d.via) // 类别+严重度双信号时走校准路径
    expect(d.verdict).not.toBe('PASS') // REWRITE/BLOCK 之一（重处置=分层口径的 isolated）
    expect(d.attackP).toBeCloseTo(0.93)
    expect(d.category).toBe('A2_prompt_injection')
  })

  it('低置信 → PASS 放行（S1 层完全逃逸口径）', async () => {
    const d = await s1Evaluate(suspiciousText(), judgeDeps({ attackP: 0.08, category: 'A0_not_an_attack', severity: 0.4 }))
    expect(d.verdict).toBe('PASS')
    expect(d.attackP).toBeCloseTo(0.08)
  })

  it('judge 不可用 → fail-open 不抛，via 如实（不可用桶）', async () => {
    const d = await s1Evaluate(suspiciousText(), judgeDeps('throw'))
    expect(d.via.startsWith('fail-open')).toBe(true)
    expect(s1Unavailable(d.via)).toBe(true)
  })

  it('S0 干净文本零 S1 成本（s0-clean 直通，judge 不被调用）', async () => {
    let called = 0
    const d = await s1Evaluate('今天天气不错，喝杯咖啡。', {
      judge: async () => { called += 1; return { attackP: 0.9, category: 'A9', severity: 3 } },
    })
    expect(d.via).toBe('s0-clean')
    expect(d.verdict).toBe('PASS')
    expect(called).toBe(0)
  })
})

describe('replaySurvivorTexts（确定性复放）', () => {
  it('同 config 两次复放完全一致，且与 runRedteam 幸存者同序同 id', () => {
    const config = { ...DEFAULT_REDTEAM_CONFIG, generations: 2, population: 10 }
    const run = runRedteam(config)
    expect(run.ok).toBe(true)
    const a = replaySurvivorTexts(config)
    const b = replaySurvivorTexts(config)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.survivors.map((s) => s.id)).toEqual(b.survivors.map((s) => s.id))
    if (run.ok) {
      expect(a.survivors.map((s) => s.id)).toEqual(run.run.survivors.map((s) => s.id))
    }
    // 复放体带原文（S1 复评即取即用），但不外泄到账本层——此处仅断言非空
    for (const s of a.survivors) expect(s.text.length).toBeGreaterThan(0)
  })

  it('非法 config 拒绝复放（不静默截断）', () => {
    const r = replaySurvivorTexts({ generations: 99 })
    expect(r.ok).toBe(false)
  })
})
