// 阶段交接键单测（C4）：结构、IO、链三段。
// 变异探针：删掉 notDone 非空校验 → 第 2 例红；删掉 sha 比对 → 第 8 例红；
// 删掉 verdict=fail 检查 → 第 12 例红；把 duplicate 检查删掉 → 第 13 例红。
import { describe, expect, it } from 'vitest'
import {
  judgeStageChain, toChainResponse, validateStageKeyStructure, verifyStageKeyIo,
  type StageKey,
} from '../stage-keys'

const SHA = 'a'.repeat(64)

function validKey(over: Partial<StageKey> = {}): StageKey {
  return {
    stage: 'dev-done',
    gate: 'G3',
    verdict: 'pass',
    actor: 'worker-coder',
    ts: 1_700_000_000_000,
    artifacts: [{ path: 'docs/evidence/dev-testlog.txt', sha256: SHA }],
    commitAnchors: ['abc1234'],
    evidence: ['docs/evidence/dev-testlog.txt'],
    notDone: ['无'],
    ...over,
  }
}

describe('validateStageKeyStructure（结构校验）', () => {
  it('齐备即过并归一化（sha/提交锚点小写）', () => {
    const { key, problems } = validateStageKeyStructure(validKey({ commitAnchors: ['ABC1234'] }))
    expect(problems).toEqual([])
    expect(key?.commitAnchors).toEqual(['abc1234'])
    expect(key?.artifacts[0].sha256).toBe(SHA)
  })

  it('notDone 空数组拒（空须显式写"无"）', () => {
    const { problems } = validateStageKeyStructure(validKey({ notDone: [] }))
    expect(problems.join('\n')).toContain('notDone')
  })

  it('artifacts 与 evidence 为空拒（键必须指向可核验产物与证据）', () => {
    const a = validateStageKeyStructure(validKey({ artifacts: [] }))
    expect(a.problems.join('\n')).toContain('artifacts')
    const b = validateStageKeyStructure(validKey({ evidence: [] }))
    expect(b.problems.join('\n')).toContain('evidence')
  })

  it('非法阶段名 / 非法裁决 / 非法提交锚点 / 非法 sha 都拒', () => {
    expect(validateStageKeyStructure({ ...validKey(), stage: 'done' }).problems.join()).toContain('stage')
    expect(validateStageKeyStructure({ ...validKey(), verdict: 'ok' }).problems.join()).toContain('verdict')
    expect(validateStageKeyStructure(validKey({ commitAnchors: ['zzz'] })).problems.join()).toContain('commitAnchors')
    expect(validateStageKeyStructure(validKey({ artifacts: [{ path: 'x', sha256: 'short' }] })).problems.join()).toContain('sha256')
  })

  it('缺 actor / ts 拒（谁签的、什么时候签的必填）', () => {
    expect(validateStageKeyStructure({ ...validKey(), actor: '' }).problems.join()).toContain('actor')
    expect(validateStageKeyStructure({ ...validKey(), ts: 0 }).problems.join()).toContain('ts')
  })
})

describe('verifyStageKeyIo（IO 校验，依赖注入）', () => {
  it('产物缺席点名', () => {
    const p = verifyStageKeyIo(validKey(), { fileExists: () => false })
    expect(p).toEqual(['artifact-missing:docs/evidence/dev-testlog.txt'])
  })

  it('哈希不符点名（篡改可检出）', () => {
    const p = verifyStageKeyIo(validKey(), { fileExists: () => true, sha256Of: () => 'b'.repeat(64) })
    expect(p).toEqual(['artifact-sha-mismatch:docs/evidence/dev-testlog.txt'])
  })

  it('读不到产物不猜（artifact-unreadable）', () => {
    const p = verifyStageKeyIo(validKey(), { fileExists: () => true, sha256Of: () => null })
    expect(p).toEqual(['artifact-unreadable:docs/evidence/dev-testlog.txt'])
  })

  it('提交锚点解析失败点名', () => {
    const p = verifyStageKeyIo(validKey(), { resolveCommit: () => false })
    expect(p).toEqual(['commit-unresolved:abc1234'])
  })

  it('未注入 deps 时只做结构面（如实弱保证）', () => {
    expect(verifyStageKeyIo(validKey())).toEqual([])
  })
})

describe('judgeStageChain（链校验）', () => {
  const k = (stage: StageKey['stage'], over: Partial<StageKey> = {}) => validKey({ stage, ...over })
  const all = () => [k('req-frozen', { gate: 'G1' }), k('design-approved', { gate: 'G2' }), k('dev-done', { gate: 'G3' }), k('verify-done', { gate: 'G5' })]

  it('四把键齐备且全过即放行', () => {
    const r = judgeStageChain(all())
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
    expect(r.problems).toEqual([])
    expect(r.unattributed).toEqual([])
  })

  it('缺键即拒并点名缺失阶段', () => {
    const keys = all().filter((x) => x.stage !== 'dev-done')
    const r = judgeStageChain(keys)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['dev-done'])
  })

  it('上游 verdict=fail 时下游不得进（failed 单列 + 问题项）', () => {
    const keys = all().map((x) => (x.stage === 'design-approved' ? { ...x, verdict: 'fail' as const } : x))
    const r = judgeStageChain(keys)
    expect(r.ok).toBe(false)
    expect(r.failed).toEqual(['design-approved'])
    expect(r.problems.find((p) => p.stage === 'design-approved')?.problems.join()).toContain('key-verdict-fail')
  })

  it('同阶段重复键拒（一把键一个声音）', () => {
    const r = judgeStageChain([...all(), k('dev-done')])
    expect(r.ok).toBe(false)
    expect(r.problems.find((p) => p.stage === 'dev-done')?.problems.join()).toContain('duplicate-stage-key')
  })

  it('stage 字段非法时不硬塞进某个阶段（unattributed）', () => {
    const r = judgeStageChain([{ ...validKey(), stage: 'done' }])
    expect(r.ok).toBe(false)
    expect(r.unattributed.length).toBeGreaterThan(0)
    expect(r.missing).toEqual([...['req-frozen', 'design-approved', 'dev-done', 'verify-done']])
  })

  it('required 可裁剪（只到 G3 时不必有 verify-done）', () => {
    const keys = all().filter((x) => x.stage !== 'verify-done')
    const r = judgeStageChain(keys, ['req-frozen', 'design-approved', 'dev-done'])
    expect(r.ok).toBe(true)
  })

  it('IO 问题进链报告（产物缺失阻断入口）', () => {
    const keys = [
      k('req-frozen', { gate: 'G1', artifacts: [{ path: 'docs/requirements/a.md' }] }),
      k('design-approved', { gate: 'G2', artifacts: [{ path: 'docs/design/b.md' }] }),
      k('dev-done', { gate: 'G3', artifacts: [{ path: 'docs/evidence/c.txt' }] }),
      k('verify-done', { gate: 'G5', artifacts: [{ path: 'docs/verify/d.md' }] }),
    ]
    const r = judgeStageChain(keys, undefined, { fileExists: (p) => !p.includes('design') })
    expect(r.ok).toBe(false)
    expect(r.problems.flatMap((p) => p.problems).join()).toContain('artifact-missing:docs/design/b.md')
  })
})

describe('toChainResponse（响应形状）', () => {
  // 回归：链结论字段曾叫 ok，被 lib/http 的 ok() 的 `{ok:true, ...data}` 覆盖成
  // 「200 却带失败语义」的假信号。响应体顶层 ok 是传输层保留键，结论必须改名 chainOk。
  it('不输出顶层 ok 键，结论落 chainOk', () => {
    const report = judgeStageChain([])
    const payload = toChainResponse(report)
    expect('ok' in payload).toBe(false)
    expect(payload.chainOk).toBe(false)
    expect(payload.missing).toEqual(['req-frozen', 'design-approved', 'dev-done', 'verify-done'])
  })

  it('通过时 chainOk 为 true，且与传输层 ok 不冲突', () => {
    const keys = (['req-frozen', 'design-approved', 'dev-done', 'verify-done'] as const)
      .map((stage) => validKey({ stage }))
    const payload = toChainResponse(judgeStageChain(keys))
    expect(payload.chainOk).toBe(true)
    expect('ok' in payload).toBe(false)
  })
})
