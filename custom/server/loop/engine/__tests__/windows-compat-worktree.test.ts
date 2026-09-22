// 守门:WorktreeManager repoRoot 锚定(win-x64 排查 S4 路径分叉修复)——
// IDE worktree 端点此前 create 落 server cwd、bind 取 repo,两路径分叉;
// 现统一锚定 repoRoot/.loop/worktrees,git 经 -C 显式锚定主仓。
import { describe, it, expect, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WorktreeManager } from '../worktree-manager'

const tmpDirs: string[] = []
afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }) } catch { /* 并发清理容忍 */ }
  }
})

describe('WorktreeManager repoRoot 锚定', () => {
  it('create({repoRoot}) 落 repoRoot/.loop/worktrees 且可回收', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wtm-reporoot-'))
    tmpDirs.push(tmp)
    execSync('git init -q .', { cwd: tmp })
    execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: tmp })

    const m = new WorktreeManager(join(tmp, '.loop'))
    const id = await m.create({ id: 'task/demo-1' } as never, { repoRoot: tmp })
    expect(id).toBe('wt-demo-1')
    expect(existsSync(join(tmp, '.loop', 'worktrees', 'wt-demo-1'))).toBe(true)

    await m.remove('wt-demo-1', { repoRoot: tmp })
    expect(existsSync(join(tmp, '.loop', 'worktrees', 'wt-demo-1'))).toBe(false)
  }, 30000)
})
