// overlay/custom/server/loop/engine/worktree-manager.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'
import type { TaskContract } from '../types'

const execFileAsync = promisify(execFile)
const WORKTREE_DIR = '.loop/worktrees'
const MAX_WORKTREES = 20

export class WorktreeManager {
  constructor(private baseDir: string = '.loop') {}

  async create(contract: TaskContract): Promise<string> {
    const worktreeId = contract.id.replace('task/', 'wt-')
    const wtPath = resolve(this.baseDir, 'worktrees', worktreeId)

    // Prune if at max
    await this.pruneOldWorktrees()

    if (existsSync(wtPath)) {
      await fs.rm(wtPath, { recursive: true, force: true })
    }
    await fs.mkdir(resolve(this.baseDir, 'worktrees'), { recursive: true })

    // Create detached-HEAD worktree
    await execFileAsync('git', ['worktree', 'add', '--detach', wtPath, 'HEAD'])

    // Copy .worktreeinclude files
    await this.copyIncludedFiles(wtPath)

    return worktreeId
  }

  async remove(worktreeId: string): Promise<void> {
    const wtPath = resolve(this.baseDir, 'worktrees', worktreeId)
    if (existsSync(wtPath)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', wtPath])
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

  private async copyIncludedFiles(wtPath: string): Promise<void> {
    const includePath = resolve(this.baseDir, '.worktreeinclude')
    if (!existsSync(includePath)) return
    const content = await fs.readFile(includePath, 'utf-8')
    const files = content.trim().split('\n').filter(Boolean)
    for (const f of files) {
      const src = resolve(process.cwd(), f)
      if (existsSync(src)) {
        await fs.copyFile(src, resolve(wtPath, f))
      }
    }
  }
}
