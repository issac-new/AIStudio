// 守门:治理 lint 的纯函数（JSONL/决策形态/提交标题/收据）。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 B2）
import { describe, expect, it } from 'vitest'
import { parseJsonl, validateDecisions, validateReceipts, checkCommitTitles, main } from '../governance-lint.mjs'

const schema = { required: ['ts', 'type'], standardRequired: ['ts', 'type', 'actor'], strictFrom: '2026-11-05T00:00:00+08:00', legacyShapes: { legacy: ['ts', 'id', 'decision', 'type'] } }

describe('parseJsonl', () => {
  it('合法行/坏行分别记账', () => {
    const r = parseJsonl('{"a":1}\nnot-json\n\n{"b":2}\n')
    expect(r.rows).toHaveLength(2)
    expect(r.problems).toHaveLength(1)
  })
})

describe('validateDecisions', () => {
  it('strict 只对新行生效；历史 legacy 行只警告', () => {
    const old = { row: { ts: '2026-11-04T00:00:00Z', id: 'x', decision: 'd', type: 'Mechanical' }, line: 1 }
    const neu = { row: { ts: '2026-11-05T12:00:00+08:00', id: 'x', decision: 'd', type: 'Mechanical' }, line: 2 }
    const r = validateDecisions([old, neu], schema, true)
    expect(r.problems.some((p) => p.includes(':2'))).toBe(true)
    expect(r.warnings.some((w) => w.includes(':1'))).toBe(true)
  })
  it('缺 ts/type 直接 problem', () => {
    const r = validateDecisions([{ row: { ts: '2026-11-05T00:00:00Z' }, line: 1 }], schema, false)
    expect(r.problems).toHaveLength(1)
  })
})

describe('validateReceipts', () => {
  it('坏哈希与缺失 spec 路径都报', () => {
    const r = validateReceipts([
      { row: { at: 't', spec: 'docs/nope.md', receipt: 'zzz', commit: 'c' }, line: 1 },
    ], { required: ['at', 'spec', 'receipt', 'commit'] })
    expect(r.problems.length).toBe(2)
  })
})

describe('checkCommitTitles', () => {
  it('裸「根治」warn；带反证/守门不 warn；enforce 时变 problem', () => {
    const titles = ['fix(x): 采集链路根治', 'fix(x): 根治＋反证测试']
    const warn = checkCommitTitles(titles, false)
    expect(warn.warnings).toHaveLength(1)
    expect(warn.problems).toHaveLength(0)
    const hard = checkCommitTitles(titles, true)
    expect(hard.problems).toHaveLength(1)
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('governance-lint')
  })
})
