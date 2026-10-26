// B2（挂账清偿批）守门：特征哈希 bigram 向量——确定性、同文同向量、近义重排命中、
// 余弦边界（零向量 0）、fewshot 双口径召回（ROUGE-L 盲区被向量口径兜住）。
import { describe, expect, it } from 'vitest'
import { bigramVector, cosine, bigramSimilarity, HASH_DIM } from '../vectorizer'
import { recallFewshot } from '../fewshot'
import { similarityScore } from '../similarity'
import type { DistillLedgerEntry } from '../flywheel'

describe('vectorizer（特征哈希 bigram）', () => {
  it('确定性：同文本同向量；维度定长', () => {
    const a = bigramVector('支付收银台改造需求')
    const b = bigramVector('支付收银台改造需求')
    expect(a.length).toBe(HASH_DIM)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('余弦：自身=1；近义重排 > 无关文本；零文本=0', () => {
    const v = bigramVector('微信支付收银台退款')
    expect(cosine(v, bigramVector('微信支付收银台退款'))).toBeCloseTo(1, 5)
    const near = cosine(v, bigramVector('收银台的微信支付与退款处理'))
    const far = cosine(v, bigramVector('图片压缩算法调研'))
    expect(near).toBeGreaterThan(far)
    expect(cosine(v, bigramVector(''))).toBe(0)
    expect(bigramSimilarity('', '任何')).toBe(0)
  })

  it('词序重排场景：bigram 余弦显著高于字符 ROUGE-L（向量口径兜盲区）', () => {
    const q = '微信 支付宝 渠道 退款 逆向 流程'
    const ref = '退款逆向流程 支付宝 微信 渠道 处理'
    const rouge = similarityScore({ transcript: q, reference: ref, stopwords: [] })
    expect(bigramSimilarity(q, ref)).toBeGreaterThan(rouge)
  })
})

describe('recallFewshot 双口径（B2）', () => {
  const distills = [{
    id: 'd1', taskId: 'bd-1', sourceRunId: 'r1', sourceTaskId: 'q1', sampleIdx: 0,
    rootCause: 'action_loop', tabooActions: ['重复读文件'], failedSteps: 3, stepRedline: null,
    targetSetId: '回归样本库', at: 1,
    problem: '退款逆向流程在支付宝微信渠道的处理', expectedBehavior: '先查渠道再走逆向',
  }] as DistillLedgerEntry[]

  it('词序重排的查询仍召回（ROUGE-L 单口径会漏的场景）', () => {
    const r = recallFewshot('支付宝微信渠道怎么处理退款逆向流程', distills)
    expect(r.recalled.length).toBe(1)
    expect(r.recalled[0].ledgerId).toBe('d1')
  })

  it('无关查询不召回（阈值兜底，不造无效召回）', () => {
    const r = recallFewshot('图片压缩算法调研', distills)
    expect(r.recalled.length).toBe(0)
  })
})
