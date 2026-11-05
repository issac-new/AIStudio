// 上下文开销比（T8）与 AI Native 评分卡（T9）单元。
import { describe, it, expect } from 'vitest'
import { buildContextOverhead } from '../context-overhead'
import type { ObsSpanRow } from '../signals'

function row(partial: Partial<ObsSpanRow>): ObsSpanRow {
  return { type: 'span', ...partial } as ObsSpanRow
}

describe('buildContextOverhead（token 真值口径）', () => {
  it('空输入=available:false 不猜数', () => {
    const r = buildContextOverhead([])
    expect(r.available).toBe(false)
    expect(r.p50).toBeNull()
    expect(r.notes.some((n) => n.includes('不猜数'))).toBe(true)
  })

  it('两会话比值分布与聚合比（零产出版本不计比值）', () => {
    const rows: ObsSpanRow[] = [
      row({ type: 'header', session_id: 's1' }),
      row({ session_id: 's1', usage: { input_tokens: 800, cache_read_tokens: 7200, output_tokens: 100 } }), // 8000/100=80
      row({ type: 'header', session_id: 's2' }),
      row({ session_id: 's2', usage: { input_tokens: 90, output_tokens: 10 } }), // 90/10=9
      row({ type: 'header', session_id: 's3' }),
      row({ session_id: 's3', usage: { input_tokens: 500, output_tokens: 0 } }), // 零产出
    ]
    const r = buildContextOverhead(rows, { days: 7 })
    expect(r.available).toBe(true)
    expect(r.sessions).toBe(3)
    expect(r.ratioSamples).toBe(2)
    expect(r.zeroOutputSessions).toBe(1)
    expect(r.p50).toBeCloseTo(9)
    expect(r.p95).toBeCloseTo(80)
    expect(r.max).toBeCloseTo(80)
    // 聚合比=Σin/Σout=(8000+90+500)/(100+10+0)=8590/110
    expect(r.aggregateRatio).toBeCloseTo(8590 / 110)
    expect(r.topSessions[0].sessionId).toBe('s1')
    expect(r.topSessions[0].ratio).toBe(80)
  })

  it('全部零产出=aggregateRatio null、分布空', () => {
    const rows: ObsSpanRow[] = [
      row({ session_id: 's', usage: { input_tokens: 100, output_tokens: 0 } }),
    ]
    const r = buildContextOverhead(rows)
    expect(r.aggregateRatio).toBeNull()
    expect(r.ratioSamples).toBe(0)
    expect(r.p50).toBeNull()
  })
})

describe('buildAiNativeScorecard（T9 判据面）', () => {
  it('12 条判据齐备、unknown 不计分母、D1 权限项如实 fail', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard()
    expect(r.criteria.length).toBe(12)
    expect(new Set(r.criteria.map((c) => c.id)).size).toBe(12)
    // unknown 只有一处（复制粘贴无机械判据）
    expect(r.unknown).toBe(1)
    // 分母=12-unknown=11，score∈(0,1]
    expect(r.score).not.toBeNull()
    expect(r.score as number).toBeGreaterThan(0)
    expect(r.score as number).toBeLessThanOrEqual(1)
    expect(r.passed + r.partial + r.failed).toBe(11)
    // D1 权限最小化：用户裁决本轮不动 → 如实 fail 进 gaps（两处：正向 5 与反向 5 同源）
    const least = r.criteria.find((c) => c.id === 'least-privilege')
    expect(least?.status === 'fail' || least?.status === 'partial').toBe(true)
    expect(r.gaps.some((g) => g.includes('least-privilege') || g.includes('HERMES_TOOL_ENFORCE'))).toBe(true)
    // 每条都带证据
    expect(r.criteria.every((c) => c.evidence.length > 0)).toBe(true)
  })
})
