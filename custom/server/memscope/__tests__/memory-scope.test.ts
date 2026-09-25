// 记忆两级分治守门（qoder：开关/清空/文件数/汇总）。
import { describe, it, expect } from 'vitest'
import { clearScope, scopeSummary, setFileCount, toggleScope } from '../memory-scope'

const board = {
  global: { enabled: true, fileCount: 3 },
  project: { enabled: false, fileCount: 5 },
}

describe('两级分治（qoder 语义）', () => {
  it('开关切换；清空只归零文件数；文件数下限 0', () => {
    let b = toggleScope(board, 'project')
    expect(b.project.enabled).toBe(true)
    b = clearScope(b, 'project')
    expect(b.project.fileCount).toBe(0)
    expect(b.project.enabled).toBe(true)  // 清空不动开关
    expect(scopeSummary(board)).toEqual({ enabledScopes: 1, totalFiles: 8 })
    expect(scopeSummary(b)).toEqual({ enabledScopes: 2, totalFiles: 3 })  // 清空后 global 3+project 0
    b = setFileCount(b, 'global', -5)
    expect(b.global.fileCount).toBe(0)  // 文件数下限 0
    expect(scopeSummary(b).totalFiles).toBe(0)
  })
})
