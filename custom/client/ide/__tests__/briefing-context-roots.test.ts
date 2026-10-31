// 简报上下文扫描根守门（2026-10-31 全功能回归）：没有 docs/ 的工作区不得再发
// 必 404 的 docs 列表请求。
import { describe, expect, it } from 'vitest'
import { briefingRoots } from '../utils/briefing-context'

describe('briefingRoots 扫描根', () => {
  it('根目录有 docs 目录 → 扫根与 docs', () => {
    expect(briefingRoots([
      { name: 'README.md', isDir: false },
      { name: 'docs', isDir: true },
    ])).toEqual(['', 'docs'])
  })

  it('根目录没有 docs → 只扫根（不发必 404 的 docs 请求）', () => {
    expect(briefingRoots([{ name: 'README.md', isDir: false }])).toEqual([''])
    expect(briefingRoots([])).toEqual([''])
    expect(briefingRoots(null)).toEqual([''])
  })

  it('同名 docs 是文件而非目录 → 不扫 docs', () => {
    expect(briefingRoots([{ name: 'docs', isDir: false }])).toEqual([''])
  })
})
