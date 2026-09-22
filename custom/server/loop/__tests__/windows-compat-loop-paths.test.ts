// 守门:loop 数据根解析(win-x64 排查 S1/S2)——env 覆盖 > cwd 可写 > homedir 降级。
// 背景见 custom/server/loop/paths.ts 头注:打包态 cwd 落 Windows 只读目录时,
// 旧行为 mkdir EPERM 直接 500 / SQLite 静默降级 InMemory。
import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { resolveLoopBaseDir, loopWorktreeDir } from '../paths'

describe('resolveLoopBaseDir(win-x64 兼容)', () => {
  const withEnv = (val: string | undefined, fn: () => void) => {
    const prev = process.env.HERMES_LOOP_DIR
    if (val === undefined) delete process.env.HERMES_LOOP_DIR
    else process.env.HERMES_LOOP_DIR = val
    try {
      fn()
    } finally {
      if (prev === undefined) delete process.env.HERMES_LOOP_DIR
      else process.env.HERMES_LOOP_DIR = prev
    }
  }

  it('HERMES_LOOP_DIR 显式覆盖优先(相对路径按 cwd 绝对化)', () => {
    withEnv(join('some', 'where'), () => {
      expect(resolveLoopBaseDir(() => true)).toBe(join(process.cwd(), 'some', 'where'))
    })
  })

  it('cwd 可写 → cwd/.loop(dev 语义不变)', () => {
    withEnv(undefined, () => {
      expect(resolveLoopBaseDir(() => true)).toBe(join(process.cwd(), '.loop'))
    })
  })

  it('cwd 不可写 → 降级 ~/.hermes-web-ui/loop(Windows 打包态)', () => {
    withEnv(undefined, () => {
      expect(resolveLoopBaseDir(() => false)).toBe(join(homedir(), '.hermes-web-ui', 'loop'))
    })
  })

  it('loopWorktreeDir 派生 worktrees 子路径,null/undefined 归一为根', () => {
    const prev = process.env.HERMES_LOOP_DIR
    delete process.env.HERMES_LOOP_DIR
    try {
      const base = join(process.cwd(), '.loop')
      expect(loopWorktreeDir('wt-abc')).toBe(join(base, 'worktrees', 'wt-abc'))
      expect(loopWorktreeDir(null)).toBe(base)
      expect(loopWorktreeDir()).toBe(base)
    } finally {
      if (prev !== undefined) process.env.HERMES_LOOP_DIR = prev
    }
  })
})
