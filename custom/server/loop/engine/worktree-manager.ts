// overlay/custom/server/loop/engine/worktree-manager.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import type { TaskContract } from '../types'
import { resolveLoopBaseDir } from '../paths'

const execFileAsync = promisify(execFile)
const MAX_WORKTREES = 20

export interface WorktreeRepoOpts {
  /** git 主仓根;缺省 process.cwd()(引擎 dev 语义不变)。
   *  IDE worktree 端点显式传 repoRoot,保证建/绑/回收落在同一 repo 的
   *  .loop/worktrees(此前 create 落 cwd、bind 取 repo,两路径分叉)。 */
  repoRoot?: string
}

export class WorktreeManager {
  // 缺省经 resolveLoopBaseDir:cwd 可写时等价 '.loop'(dev 语义不变),
  // 不可写(Windows 打包态落只读目录)时降级 homedir,详见 loop/paths.ts。
  constructor(private baseDir: string = resolveLoopBaseDir()) {}

  async create(contract: TaskContract, opts: WorktreeRepoOpts = {}): Promise<string> {
    const worktreeId = contract.id.replace('task/', 'wt-')
    const repoRoot = opts.repoRoot ?? process.cwd()
    const base = opts.repoRoot ? resolve(opts.repoRoot, '.loop') : this.baseDir
    const wtPath = resolve(base, 'worktrees', worktreeId)

    // Prune if at max
    await this.pruneOldWorktrees()

    if (existsSync(wtPath)) {
      await fs.rm(wtPath, { recursive: true, force: true })
    }
    await fs.mkdir(resolve(base, 'worktrees'), { recursive: true })

    // Create detached-HEAD worktree(-C 显式锚定主仓,不再依赖 server cwd 恰好是仓库)
    await execFileAsync('git', ['-C', repoRoot, 'worktree', 'add', '--detach', wtPath, 'HEAD'], { windowsHide: true })

    // Copy .worktreeinclude files
    await this.copyIncludedFiles(wtPath, repoRoot)

    return worktreeId
  }

  async remove(worktreeId: string, opts: WorktreeRepoOpts = {}): Promise<void> {
    const base = opts.repoRoot ? resolve(opts.repoRoot, '.loop') : this.baseDir
    const wtPath = resolve(base, 'worktrees', worktreeId)
    if (existsSync(wtPath)) {
      try {
        await execFileAsync('git', ['-C', opts.repoRoot ?? process.cwd(), 'worktree', 'remove', '--force', wtPath], { windowsHide: true })
      } catch {
        await fs.rm(wtPath, { recursive: true, force: true })
      }
    }
  }

  async cleanupStale(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const worktreesDir = resolve(this.baseDir, 'worktrees')
    if (!existsSync(worktreesDir)) return
    const entries = await fs.readdir(worktreesDir)
    const now = Date.now()
    for (const entry of entries) {
      const p = resolve(worktreesDir, entry)
      try {
        const stat = await fs.stat(p)
        if (now - stat.mtimeMs > maxAgeMs) {
          await this.remove(entry)
        }
      } catch {}
    }
  }

  private async pruneOldWorktrees(): Promise<void> {
    const worktreesDir = resolve(this.baseDir, 'worktrees')
    if (!existsSync(worktreesDir)) return
    const entries = await fs.readdir(worktreesDir)
    if (entries.length < MAX_WORKTREES) return
    // Remove oldest by mtime
    const stats = await Promise.all(entries.map(async e => {
      const stat = await fs.stat(resolve(worktreesDir, e))
      return { name: e, mtime: stat.mtimeMs }
    }))
    stats.sort((a, b) => a.mtime - b.mtime)
    const toRemove = stats.slice(0, stats.length - MAX_WORKTREES + 1)
    for (const s of toRemove) {
      await this.remove(s.name)
    }
  }

  private async copyIncludedFiles(wtPath: string, repoRoot: string): Promise<void> {
    const includePath = resolve(this.baseDir, '.worktreeinclude')
    if (!existsSync(includePath)) return
    const content = await fs.readFile(includePath, 'utf-8')
    const files = content.trim().split('\n').filter(Boolean)
    for (const f of files) {
      const src = resolve(repoRoot, f)
      if (existsSync(src)) {
        await fs.copyFile(src, resolve(wtPath, f))
      }
    }
  }
}
