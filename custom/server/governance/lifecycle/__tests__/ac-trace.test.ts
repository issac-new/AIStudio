// AC 追溯链单测（C1）：解析、绑定、判定三件。
// 变异探针：把 unbound 判定改成跳过，第 3 例会红；把 noResult 判定删掉，第 4 例会红；
// 把 failed 判定删掉，第 5 例会红。
import { describe, expect, it } from 'vitest'
import {
  buildAcTrace, classifyVerifiable, collectBindings, parseAcceptanceCriteria, parseCaseBindings,
  type AcceptanceCriterion, type CaseBinding,
} from '../ac-trace'

const DOC = [
  '## 验收标准',
  '',
  '- **AC-1** 下单接口返回 201 且金额按分返回',
  '- **AC-2** 重复回调不产生二次扣款 [auto]',
  '- **AC-3** 真机走查首帧渲染正常',
  '- **AC-4** 运营后台可查订单',
  '',
  '## Scope-Out',
  '- 不做退款',
].join('\n')

describe('parseAcceptanceCriteria（AC 解析）', () => {
  it('只认 AC 条目行，编号归一，重复编号只取首条', () => {
    const acs = parseAcceptanceCriteria(DOC)
    expect(acs.map((a) => a.id)).toEqual(['AC-1', 'AC-2', 'AC-3', 'AC-4'])
    expect(acs[0].text).toContain('201')
  })

  it('重复编号不静默覆盖', () => {
    const doc = '- **AC-1** 第一条\n- **AC-1** 第二条'
    const acs = parseAcceptanceCriteria(doc)
    expect(acs).toHaveLength(1)
    expect(acs[0].text).toBe('第一条')
  })

  it('可验证方式：显式标记优先，其次关键词，最后 unspecified', () => {
    expect(classifyVerifiable('重复回调不产生二次扣款 [auto]')).toBe('auto')
    expect(classifyVerifiable('下单接口返回 201')).toBe('auto')
    expect(classifyVerifiable('真机走查首帧渲染正常')).toBe('manual')
    expect(classifyVerifiable('留存截图')).toBe('evidence')
    expect(classifyVerifiable('运营后台可查订单')).toBe('unspecified')
  })
})

describe('parseCaseBindings（用例绑定）', () => {
  it('@ac 注释与 [AC-N] 标签都认；标题优先作用例标识', () => {
    const src = [
      "// @ac AC-1, AC-2",
      "it('dedupe works [AC-3]', () => {})",
      "test('无关用例', () => {})",
    ].join('\n')
    const b = parseCaseBindings(src, 'x.test.ts')
    expect(b).toHaveLength(2)
    expect(b[0].acs).toEqual(['AC-1', 'AC-2'])
    expect(b[0].case).toBe('x.test.ts:1')
    expect(b[1].acs).toEqual(['AC-3'])
    expect(b[1].case).toBe('dedupe works [AC-3]')
  })

  it('没有显式标记的行不产生绑定（不猜语义）', () => {
    expect(parseCaseBindings("it('AC-1 相关行为', () => {})")).toEqual([])
  })

  it('多文件汇总去重', () => {
    const src = '// @ac AC-1\n'
    const merged = collectBindings([
      { file: 'a.test.ts', content: src },
      { file: 'a.test.ts', content: src },
    ])
    expect(merged).toHaveLength(1)
  })
})

const ACS: AcceptanceCriterion[] = [
  { id: 'AC-1', text: 't1', verifiable: 'auto' },
  { id: 'AC-2', text: 't2', verifiable: 'auto' },
  { id: 'AC-3', text: 't3', verifiable: 'manual' },
  { id: 'AC-4', text: 't4', verifiable: 'unspecified' },
]

function bind(c: string, acs: string[]): CaseBinding {
  return { case: c, acs }
}

describe('buildAcTrace（追溯判定）', () => {
  it('全部绑定且有结果即过；孤儿用例只进提示', () => {
    const { judgement } = buildAcTrace(ACS, [
      bind('c1', ['AC-1']), bind('c2', ['AC-2']), bind('c3', ['AC-3']), bind('c4', ['AC-4']),
      bind('loose', ['AC-99']),
    ], { c1: 'pass', c2: 'pass', c3: 'pass', c4: 'skipped' })
    expect(judgement.ok).toBe(true)
    expect(judgement.orphanCases).toEqual(['loose'])
  })

  it('无绑定 AC 判 ac-unbound 并点名', () => {
    const { judgement } = buildAcTrace(ACS, [
      bind('c1', ['AC-1']), bind('c2', ['AC-2']), bind('c4', ['AC-4']),
    ], { c1: 'pass', c2: 'pass', c4: 'pass' })
    expect(judgement.ok).toBe(false)
    expect(judgement.unbound).toEqual(['AC-3'])
  })

  it('有绑定但无运行结果判 ac-no-result（没跑过不等于跑过）', () => {
    const { judgement } = buildAcTrace(ACS, [
      bind('c1', ['AC-1']), bind('c2', ['AC-2']), bind('c3', ['AC-3']), bind('c4', ['AC-4']),
    ], { c1: 'pass', c2: 'unknown', c3: 'pass', c4: 'pass' })
    expect(judgement.ok).toBe(false)
    expect(judgement.noResult).toEqual(['AC-2'])
  })

  it('绑定用例 fail 判 ac-failed', () => {
    const { judgement } = buildAcTrace(ACS, [
      bind('c1', ['AC-1']), bind('c2', ['AC-2']), bind('c3', ['AC-3']), bind('c4', ['AC-4']),
    ], { c1: 'pass', c2: 'fail', c3: 'pass', c4: 'pass' })
    expect(judgement.ok).toBe(false)
    expect(judgement.failed).toEqual(['AC-2'])
  })

  it('一条 AC 多个用例：任一 fail 即该 AC 失败；任一有结果即不算 noResult', () => {
    const { judgement } = buildAcTrace([ACS[0]], [
      bind('c1', ['AC-1']), bind('c2', ['AC-1']),
    ], { c1: 'pass', c2: 'fail' })
    expect(judgement.failed).toEqual(['AC-1'])
    expect(judgement.noResult).toEqual([])
  })

  it('rows 保留未绑定 AC 且 cases 为空（UI 矩阵红格来源）', () => {
    const { rows } = buildAcTrace(ACS, [bind('c1', ['AC-1'])], { c1: 'pass' })
    const ac3 = rows.find((r) => r.acId === 'AC-3')
    expect(ac3?.cases).toEqual([])
  })
})
