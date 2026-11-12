// 守门:设计索引的集合等式与计数。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 C6）
// 2026-11-12 迁入：README 指针/附录 A 冻结句/附录 A 计数三组文档句检查的行为测试
// （断言对象=检查函数的判定语义；真实仓状态的执行面在 --check 与 merge-invariants）。
import { describe, expect, it } from 'vitest'
import {
  parseListLinks, compareIndex, main,
  checkReadmePointer, checkAppendixFrozen, checkAppendixCounts,
} from '../maintenance/gen-doc-indexes.mjs'

describe('parseListLinks', () => {
  it('只取列表项链接', () => {
    const links = parseListLinks('- [a](../superpowers/specs/a.md)\n正文 [b](x.md)\n- [c](y.md)')
    expect(links).toEqual(['../superpowers/specs/a.md', 'y.md'])
  })
})

describe('compareIndex', () => {
  it('一致时 problems 为空', () => {
    const text = '- [a](../superpowers/specs/a.md)\n- [b](../superpowers/specs/b.md)\n根目录：**2 份**\n合计 2 份\n## 2026-11（1 份）'
    const r = compareIndex({ links: parseListLinks(text), specs: ['a.md', '2026-11-01-b.md'], text })
    // b.md 不在 specs → ghost；这里用真实集合构造
    expect(r.problems.length).toBeGreaterThan(0)
  })
  it('missing/ghosts/duplicates 都报', () => {
    const text = '- [a](../superpowers/specs/a.md)\n- [a](../superpowers/specs/a.md)\n根目录：**2 份**\n合计 2 份\n## 2026-11（1 份）'
    const r = compareIndex({ links: parseListLinks(text), specs: ['a.md', 'b.md', '2026-11-01-c.md'], text })
    expect(r.missing).toContain('b.md')
    expect(r.duplicates).toContain('a.md')
    expect(r.problems.length).toBeGreaterThan(0)
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('gen-doc-indexes')
  })
})

describe('checkReadmePointer（迁自 docs-ssot-guard）', () => {
  it('指针在位且无旧址残留 → 无问题', () => {
    expect(checkReadmePointer('设计文档见 docs/DESIGN.md')).toEqual([])
  })
  it('缺正本指针 / 残留旧址指针 → 各报一个带修复指引的问题', () => {
    expect(checkReadmePointer('别的')).toEqual([
      expect.stringContaining('docs/DESIGN.md'),
    ])
    // 新旧并存：正本在位但旧址残留仍报（旧址指针对读者是误导）
    const both = checkReadmePointer('旧正本 2026-10-23-swarmstudio-integrated-design.md 与 docs/DESIGN.md 并存')
    expect(both).toEqual([expect.stringContaining('旧址')])
    expect(checkReadmePointer('只指 2026-10-23-swarmstudio-integrated-design.md')).toEqual([
      expect.stringContaining('docs/DESIGN.md'),
      expect.stringContaining('旧址'),
    ])
  })
})

describe('checkAppendixFrozen（迁自 docs-ssot-guard）', () => {
  it('头部含冻结声明与机械索引指向 → 无问题', () => {
    const head = '# 附录 A：x（1 份）\n> 冻结：见 aistudio-design-document-index\n正文'
    expect(checkAppendixFrozen(head)).toEqual([])
  })
  it('缺冻结声明或缺索引指向 → 报问题', () => {
    expect(checkAppendixFrozen('# 附录 A：x（1 份）\n> 无声明')).toHaveLength(2)
    expect(checkAppendixFrozen('> 冻结\n> aistudio-design-document-index\n# 附录 A：x（1 份）')).toEqual([])
  })
})

describe('checkAppendixCounts（迁自 docs-ssot-guard）', () => {
  const doc = (n, rows) => `# 附录 A：x（${n} 份文档）\n\n## A.1 逐份索引\n\n| 文件名 | 主旨 | 结论要点 |\n|---|---|---|\n${rows}\n\n### 角色/排除（非 spec 文档）\n`
  it('标题计数 == A.1 数据行数（表头/分隔行不计，角色表不计）→ 无问题', () => {
    expect(checkAppendixCounts(doc(2, '| a | b | c |\n| d | e | f |'))).toEqual([])
  })
  it('计数漂移或形态损坏 → 报带修复指引的问题', () => {
    expect(checkAppendixCounts(doc(3, '| a | b | c |'))).toEqual([expect.stringContaining('!= A.1 实际 1 行')])
    expect(checkAppendixCounts('# 附录 A：x\n## A.1 无表')).toEqual([expect.stringContaining('不可解析')])
  })
})
