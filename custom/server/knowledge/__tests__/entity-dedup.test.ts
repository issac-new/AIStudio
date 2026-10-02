// A2 守门（KG 演化治理 2026-10-02）：三档阈值边界（≥auto 别名 / [review,auto) 转人工 /
// <review 新实体）、归一化、形状坑剔除（props 名称非字符串一律不比）。
import { describe, it, expect } from 'vitest'
import { threeTierDedup, nameSimilarity, normalizeName, dedupOptsFromEnv } from '../entity-dedup'

const CAND = (id: string, name: string, type = 'agent') => ({ id, type, props: { name, type } })
const EX = (id: string, name: unknown, type = 'agent') => ({ id, type, name })

describe('normalizeName / nameSimilarity', () => {
  it('归一化：小写+去标点+压缩空白', () => {
    expect(normalizeName('  ZCode--Agent!! ')).toBe('zcode agent')
  })
  it('完全同名=1；无共享=0（Jaccard 与 Levenshtein 各占 0.5）', () => {
    expect(nameSimilarity('alice', 'alice')).toBe(1)
    expect(nameSimilarity('alice', 'bob')).toBe(0)
  })
})

describe('threeTierDedup：三档边界', () => {
  const pair = ['zcode agents', 'zcode agent']  // 实测相似度 ≈0.625（Jaccard 1/3 × Lev 11/12）
  const sim = nameSimilarity(pair[0], pair[1])

  it(`边界锚定：实测 sim=${sim.toFixed(4)} 落在默认 [0.6, 0.85) → review 档`, () => {
    expect(sim).toBeGreaterThanOrEqual(0.6)
    expect(sim).toBeLessThan(0.85)
    const r = threeTierDedup([CAND('agent:x', pair[0])], [EX('agent:y', pair[1])])
    expect(r.review).toHaveLength(1)
    expect(r.review[0].matchId).toBe('agent:y')
    expect(r.review[0].similarity).toBeCloseTo(sim, 10)
    expect(r.review[0].candidateName).toBe(pair[0])
    expect(r.review[0].existingName).toBe(pair[1])
    expect(r.alias).toHaveLength(0)
    expect(r.fresh).toHaveLength(0)
  })

  it('阈值含等于：sim 恰等于 autoAliasThreshold → alias（≥）；恰等于 reviewThreshold → review（≥）', () => {
    // auto 阈=实测值 → 别名档（>= 含边界）
    const asAlias = threeTierDedup([CAND('agent:x', pair[0])], [EX('agent:y', pair[1])], { autoAliasThreshold: sim, reviewThreshold: 0.3 })
    expect(asAlias.alias).toHaveLength(1)
    expect(asAlias.alias[0].aliasOf).toBe('agent:y')
    // review 阈=实测值、auto 阈更高 → 评审档（>= 含边界，< auto）
    const asReview = threeTierDedup([CAND('agent:x', pair[0])], [EX('agent:y', pair[1])], { autoAliasThreshold: 0.99, reviewThreshold: sim })
    expect(asReview.review).toHaveLength(1)
    expect(asReview.alias).toHaveLength(0)
  })

  it('≥0.85 自动别名（带 aliasOf）；<0.6 正常新实体', () => {
    const r = threeTierDedup(
      [CAND('agent:a2', 'Alice!  '), CAND('agent:far', 'database migration runner')],
      [EX('agent:a1', 'alice'), EX('agent:y', 'zcode agent')],
    )
    expect(r.alias).toHaveLength(1)
    expect(r.alias[0].aliasOf).toBe('agent:a1')  // 归一化后完全一致 → 1.0
    expect(r.alias[0].similarity).toBe(1)
    expect(r.fresh.map((f) => f.id)).toEqual(['agent:far'])
    expect(r.review).toHaveLength(0)
  })

  it('task 默认跳过（task id 天然唯一）；dedupTypes 开启后按 title 比', () => {
    const task = { id: 'task:t1', type: 'task', props: { title: 'zcode agent', status: 'done', type: 'task' } }
    const off = threeTierDedup([task], [EX('task:t0', 'zcode agent', 'task')])
    expect(off.skipped.map((s) => s.id)).toEqual(['task:t1'])  // 默认档：task 不比，透传
    const on = threeTierDedup([task], [EX('task:t0', 'zcode agent', 'task')], { dedupTypes: ['agent', 'task'] })
    expect(on.alias).toHaveLength(1)  // 同 title → 别名档
  })

  it('形状坑：已有实体名称非字符串/空串一律剔除不比（宁可漏报不误并）', () => {
    const r = threeTierDedup(
      [CAND('agent:x', 'alice')],
      [EX('agent:n1', 123), EX('agent:n2', null), EX('agent:n3', '   '), EX('agent:n4', undefined)],
    )
    expect(r.alias).toHaveLength(0)
    expect(r.review).toHaveLength(0)
    expect(r.fresh.map((f) => f.id)).toEqual(['agent:x'])  // 无可比对象 → 正常新实体
  })

  it('候选自身名称形状不可比 → skipped；不同 type 不跨比', () => {
    const noName = { id: 'agent:x', type: 'agent', props: { type: 'agent' } }
    const taskCand = { id: 'task:t1', type: 'task', props: { title: 'same', type: 'task' } }
    const r = threeTierDedup([noName, taskCand], [EX('agent:y', 'same')])
    // agent 无名=形状不可比跳过；task 默认档不参与去重 → 双双透传 skipped
    expect(r.skipped.map((s) => s.id)).toEqual(['agent:x', 'task:t1'])
    // agent 候选不与 task 既有实体跨 type 比（同名也判 fresh）
    const cross = threeTierDedup([CAND('agent:t', 'same')], [EX('task:t0', 'same', 'task')])
    expect(cross.fresh.map((f) => f.id)).toEqual(['agent:t'])
  })
})

describe('dedupOptsFromEnv', () => {
  it('env 阈值可调；非法或 review≥auto 回落默认；KG_DEDUP_TASKS=1 开 task 档', () => {
    expect(dedupOptsFromEnv().dedupTypes).toBeUndefined()
    process.env.KG_DEDUP_TASKS = '1'
    expect(dedupOptsFromEnv().dedupTypes).toEqual(['agent', 'task'])
    delete process.env.KG_DEDUP_TASKS

    process.env.KG_DEDUP_AUTO = '0.9'
    process.env.KG_DEDUP_REVIEW = '0.7'
    expect(dedupOptsFromEnv()).toMatchObject({ autoAliasThreshold: 0.9, reviewThreshold: 0.7 })

    process.env.KG_DEDUP_AUTO = '0.5'
    process.env.KG_DEDUP_REVIEW = '0.8'  // review ≥ auto：非法组合 → 双回落默认
    expect(dedupOptsFromEnv()).toMatchObject({ autoAliasThreshold: 0.85, reviewThreshold: 0.6 })

    process.env.KG_DEDUP_AUTO = 'junk'
    delete process.env.KG_DEDUP_REVIEW
    expect(dedupOptsFromEnv().autoAliasThreshold).toBe(0.85)
    delete process.env.KG_DEDUP_AUTO
  })
})
