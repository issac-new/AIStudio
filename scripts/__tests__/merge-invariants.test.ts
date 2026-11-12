// 守门:合并不变量的入口可用性与文档口径单一源（2026-11-12 收敛）。
// spec: docs/superpowers/specs/2026-11-12-doc-canon-single-source.md
//
// 覆盖义务已从「手维护的附录 A」迁到 gen-doc-indexes 生成的机械索引：
// 本文件只测 --help 与 main 的入口契约；索引覆盖由 custom/__tests__/docs-ssot-guard 守。
import { describe, expect, it } from 'vitest'
import { main } from '../merge-invariants.mjs'

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('merge-invariants')
  })
})
