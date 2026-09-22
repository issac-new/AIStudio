// overlay/custom/server/loop/paths.ts
// loop 子系统数据根解析(dev 语义保持 + 只读 cwd 降级)。
//
// 背景(2026-09-22 win-x64 排查):loop 全家(store/graph-events/worktrees)原以
// cwd 相对路径 '.loop' 落盘——dev 态 server cwd=仓库根成立;打包态 cwd=
// resources/webui,Windows per-machine 安装时落 C:\Program Files 只读区,
// mkdir EPERM 直接 500 / SQLite 静默降级 InMemory。
//
// 优先级:HERMES_LOOP_DIR 显式覆盖 > cwd 可写(cwd/.loop,dev 语义不变)
// > ~/.hermes-web-ui/loop 降级(打一次 warn)。
import { accessSync, constants } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export const DEFAULT_LOOP_DIRNAME = '.loop'

export type WritableProbe = (dir: string) => boolean

const defaultWritableProbe: WritableProbe = (dir) => {
  try {
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

let warnedFallback = false

export function resolveLoopBaseDir(probe: WritableProbe = defaultWritableProbe): string {
  const envDir = process.env.HERMES_LOOP_DIR?.trim()
  if (envDir) return resolve(envDir)
  const cwd = process.cwd()
  if (probe(cwd)) return resolve(cwd, DEFAULT_LOOP_DIRNAME)
  const fallback = join(homedir(), '.hermes-web-ui', 'loop')
  if (!warnedFallback) {
    warnedFallback = true
    console.warn(
      `[loop] cwd 不可写(${cwd}),loop 数据降级到 ${fallback};可用 HERMES_LOOP_DIR 显式指定`,
    )
  }
  return fallback
}

export function loopWorktreeDir(worktreeId?: string | null): string {
  const base = resolveLoopBaseDir()
  return worktreeId ? join(base, 'worktrees', worktreeId) : base
}
