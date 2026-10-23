// 工具输出折叠守门（2026-10-23 HarnessPro 吸收轮 HP-4）。
// 锚：hook.py `_compact_text`——连续重复行折叠（>2 折叠/=2 保留）+ 头尾截断留省略标记。
import { describe, it, expect } from 'vitest'
import { compactOutput, foldRepeats } from '../fold'
import { truncateForState } from '../../eval/judge'

describe('foldRepeats：连续重复行折叠', () => {
  it('同一行连出 >2 次 → 保留 1 行 + 折叠标记；恰 2 次全保留', () => {
    expect(foldRepeats('x\nx\nx\nx')).toBe('x\n［上一行重复 3 次］')
    expect(foldRepeats('x\nx')).toBe('x\nx')
    expect(foldRepeats('a\nb\nb\nb\nc')).toBe('a\nb\n［上一行重复 2 次］\nc')
  })

  it('不连续的重复不折叠；无重复直通', () => {
    expect(foldRepeats('x\ny\nx')).toBe('x\ny\nx')
    expect(foldRepeats('one\ntwo')).toBe('one\ntwo')
  })

  it('空串与单行直通', () => {
    expect(foldRepeats('')).toBe('')
    expect(foldRepeats('solo')).toBe('solo')
  })
})

describe('compactOutput：两级压缩（折叠→头尾截断）', () => {
  it('短文（折叠后 ≤maxChars）直通，只记 fold 收益', () => {
    const r = compactOutput('x\nx\nx\nx\nx\nx\nx\nx', { maxChars: 100 })
    expect(r.text).toBe('x\n［上一行重复 7 次］')
    expect(r.savedByFold).toBeGreaterThan(0)
    expect(r.omittedByTruncate).toBe(0)
    expect(r.rawChars).toBe(15)
  })

  it('超长文本头尾截断 + 省略标记含两级口径', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n')
    const r = compactOutput(long, { maxChars: 200, headChars: 120, tailChars: 60 })
    expect(r.rawChars).toBe(long.length)
    expect(r.omittedByTruncate).toBeGreaterThan(0)
    expect(r.text).toContain('…［省略')
    expect(r.text.startsWith('line-0')).toBe(true)
    expect(r.text.trimEnd().endsWith('line-499')).toBe(true)
  })
})

describe('judge truncateForState 接线：判分输入先折叠再截断', () => {
  it('复读机噪音被折叠，判分语义不变（标记保留事实）', () => {
    const noisy = 'head\n' + 'ERROR same line\n'.repeat(50) + 'tail conclusion'
    const out = truncateForState(noisy, 10_000)
    expect(out).toContain('［上一行重复 49 次］')
    expect(out).toContain('tail conclusion')
    // 折叠后远短于原文：超长输入不再被无谓截断
    expect(out.length).toBeLessThan(noisy.length)
  })

  it('超长折叠后仍超限 → 保头尾语义不变（头为主、尾 1/4）', () => {
    const long = Array.from({ length: 2000 }, (_, i) => `unique-line-${i}`).join('\n')
    const out = truncateForState(long, 1000)
    expect(out).toContain('eval 截断')
    expect(out).toContain('重复行已折叠')
    expect(out.startsWith('unique-line-0')).toBe(true)
  })

  it('干净短文直通', () => {
    expect(truncateForState('clean', 100)).toBe('clean')
  })
})
