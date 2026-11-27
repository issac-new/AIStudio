// 上下文开销比（T8）与 AI Native 评分卡（T9）单元。
import { describe, it, expect } from 'vitest'
import { buildContextOverhead } from '../context-overhead'
import type { ObsSpanRow } from '../signals'
import type { PostureReading } from '../../harness/ai-native-scorecard'

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
  /** 一份健康的治理姿态夹具：总闸开、没有档案裸奔、有已加载规则。 */
  const healthyPosture = (): PostureReading => ({
    enforceMasterOn: true, bareProfiles: 0, partialProfiles: 1, totalProfiles: 4, loadedRuleTotal: 12,
  })

  it('12 条判据齐备、unknown 不计分母；治理姿态健康时两条权限判据都通过', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: healthyPosture })
    expect(r.criteria.length).toBe(12)
    expect(new Set(r.criteria.map((c) => c.id)).size).toBe(12)
    // unknown 只有一处（复制粘贴无机械判据）——两条权限判据有读数，不再写死
    expect(r.unknown).toBe(1)
    // 分母=12-unknown=11，score∈(0,1]
    expect(r.score).not.toBeNull()
    expect(r.score as number).toBeGreaterThan(0)
    expect(r.score as number).toBeLessThanOrEqual(1)
    expect(r.passed + r.partial + r.failed).toBe(11)
    const least = r.criteria.find((c) => c.id === 'least-privilege')!
    expect(least.status).toBe('pass')
    // 证据里是真实读数，不是写死的数字
    expect(least.evidence).toContain('执法总闸=开')
    expect(least.evidence).toContain('显式关闭审批 0 个')
    expect(least.evidence).toContain('已加载规则 12 条')
    expect(least.evidence).not.toContain('30/30')
    const broad = r.criteria.find((c) => c.id === 'no-broad-permission')!
    expect(broad.status).toBe('pass')
    expect(broad.evidence).toContain('执法总闸=开')
    // 每条都带证据
    expect(r.criteria.every((c) => c.evidence.length > 0)).toBe(true)
  })

  it('有档案显式关闭审批：权限最小化与权限不过宽都判部分，并写出裸奔档案数', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: () => ({ ...healthyPosture(), bareProfiles: 2 }) })
    const least = r.criteria.find((c) => c.id === 'least-privilege')!
    const broad = r.criteria.find((c) => c.id === 'no-broad-permission')!
    expect(least.status).toBe('partial')
    expect(broad.status).toBe('partial')
    expect(least.evidence).toContain('显式关闭审批 2 个')
    expect(broad.evidence).toContain('显式关闭审批 2 个')
  })

  it('执法总闸关：权限最小化不通过；权限不过宽（反向判据成立）也不通过——不再恒通过', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: () => ({ ...healthyPosture(), enforceMasterOn: false }) })
    const least = r.criteria.find((c) => c.id === 'least-privilege')!
    const broad = r.criteria.find((c) => c.id === 'no-broad-permission')!
    expect(least.status).toBe('fail')
    expect(broad.status).toBe('fail')
    expect(broad.evidence).toContain('执法总闸=关')
    expect(r.gaps.some((g) => g.startsWith('no-broad-permission'))).toBe(true)
  })

  it('总闸开但没有任何已加载规则：权限最小化判部分（没有规则可执行）', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: () => ({ ...healthyPosture(), loadedRuleTotal: 0 }) })
    expect(r.criteria.find((c) => c.id === 'least-privilege')!.status).toBe('partial')
    // 反向判据不看规则数：总闸开着、没有档案裸奔，就谈不上权限过大
    expect(r.criteria.find((c) => c.id === 'no-broad-permission')!.status).toBe('pass')
  })

  it('一个档案都没读到：两条都判部分，不判通过', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: () => ({ enforceMasterOn: true, bareProfiles: 0, partialProfiles: 0, totalProfiles: 0, loadedRuleTotal: 12 }) })
    expect(r.criteria.find((c) => c.id === 'least-privilege')!.status).toBe('partial')
    expect(r.criteria.find((c) => c.id === 'no-broad-permission')!.status).toBe('partial')
  })

  it('治理姿态取数抛错：两条判未知并写明原因，评分卡本身不报错；未知不计分母', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const r = buildAiNativeScorecard({ posture: () => { throw new Error('姿态域读盘失败') } })
    const least = r.criteria.find((c) => c.id === 'least-privilege')!
    const broad = r.criteria.find((c) => c.id === 'no-broad-permission')!
    expect(least.status).toBe('unknown')
    expect(broad.status).toBe('unknown')
    expect(least.evidence).toContain('治理姿态读取失败')
    expect(broad.evidence).toContain('治理姿态读取失败')
    // 复制粘贴那一条本来就是未知，加上这两条共 3 条；分母相应减到 9
    expect(r.unknown).toBe(3)
    expect(r.passed + r.partial + r.failed).toBe(9)
  })

  it('两条权限判据不再写死：结论随读数变', async () => {
    const { buildAiNativeScorecard } = await import('../../harness/ai-native-scorecard')
    const statusesOf = (p: PostureReading) =>
      buildAiNativeScorecard({ posture: () => p }).criteria
        .filter((c) => c.id === 'least-privilege' || c.id === 'no-broad-permission')
        .map((c) => `${c.id}=${c.status}`)
        .sort()
        .join(',')
    const healthy = statusesOf(healthyPosture())
    const masterOff = statusesOf({ ...healthyPosture(), enforceMasterOn: false })
    const bare = statusesOf({ ...healthyPosture(), bareProfiles: 1 })
    expect(new Set([healthy, masterOff, bare]).size).toBe(3)
  })
})
