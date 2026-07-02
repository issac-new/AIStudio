import { resolve, isAbsolute, relative } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

/**
 * 任务 workspace_path 放行缓存。
 *
 * 背景：overlay 的 SecFileRootSandbox patch 要求 files/download 的 `root`
 * 必须落在 hermes base (~/.hermes) 内。但系统级任务（如「升级 hermes-agent」）
 * 的 workspace_path 可能是用户 home（/Users/<user>）等 ~/.hermes 之外的目录，
 * 导致 cockpit 文件面板无法浏览这类任务的 workspace（被 sandbox 误拒）。
 *
 * 本模块收集所有 board 下任务的 workspace_path，作为「额外放行清单」：
 * 当 root 落在 hermes base 之外、但落在某个任务 workspace_path 之内时，放行。
 *
 * 为避免每次文件请求都 fork hermes CLI，采用 TTL 缓存 + 后台刷新：
 * 同步读接口 isWithinKnownTaskWorkspace() 永不阻塞，TTL 过期后返回旧值并
 * 触发后台刷新。冷启动时缓存为空，由 handler 调 await primeTaskWorkspaceCache()
 * 等待首次刷新完成后再校验。
 *
 * 注意：本模块不通过相对路径 import upstream services——ts-node/esbuild 用
 * 真实路径解析符号链接 custom/ → server/src/custom，会导致 ../../../ 找不到
 * （与 trace.ts 同理）。所有依赖（isPathWithin、CLI 调用等）均内联。
 */

const execFileAsync = promisify(execFile)
const TTL_MS = 60_000

// 内联 isPathWithin（避免通过 symlink 路径 import upstream）
function isPathWithin(targetPath: string, basePath: string): boolean {
  const rel = relative(basePath, targetPath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.startsWith('/'))
}

// hermes base：default profile 时 ~/.hermes，其它 profile 时 ~/.hermes（detectHermesRootHome 等价）
function getHermesBaseDir(): string {
  return resolve(homedir(), '.hermes')
}

interface KanbanBoard { slug: string }
interface KanbanTask { workspace_path: string | null }

async function execHermesJson(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync('hermes', args, {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true,
  })
  return JSON.parse(stdout)
}

function normalizeAbs(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(getHermesBaseDir(), p)
}

// 已放行的绝对路径前缀集合（任务的 workspace_path，归一化为绝对路径）
let allowedRoots: Set<string> = new Set()
let expiresAt = 0
let refreshing: Promise<void> | null = null

async function refresh(): Promise<void> {
  try {
    const boards = (await execHermesJson(['kanban', 'boards', 'list', '--json'])) as KanbanBoard[]
    const roots = new Set<string>()
    await Promise.all(
      boards.map(async (b) => {
        try {
          const tasks = (await execHermesJson(['kanban', '--board', b.slug, 'list', '--json', '--archived'])) as KanbanTask[]
          for (const t of tasks) {
            if (t.workspace_path) roots.add(normalizeAbs(t.workspace_path))
          }
        } catch {
          /* 单 board 失败忽略，不影响其它 board */
        }
      }),
    )
    allowedRoots = roots
    expiresAt = Date.now() + TTL_MS
  } catch {
    // 刷新失败：保留旧值，缩短 TTL 尽快重试
    expiresAt = Date.now() + 5_000
  }
}

function maybeRefresh(): void {
  if (refreshing || Date.now() < expiresAt) return
  refreshing = refresh().finally(() => { refreshing = null })
}

/**
 * 同步判断 `absPath` 是否落在某个已知任务的 workspace_path 之内。
 * 永不阻塞：命中缓存用缓存，过期则返回旧值并触发后台刷新。
 */
export function isWithinKnownTaskWorkspace(absPath: string): boolean {
  maybeRefresh()
  for (const root of allowedRoots) {
    if (isPathWithin(absPath, root)) return true
  }
  return false
}

/**
 * 显式预热缓存。返回 Promise：调用方可 await 以确保缓存就绪后再做校验
 * （避免冷启动首次请求因缓存为空被误拒）。不 await 时则后台刷新、不阻塞。
 */
export function primeTaskWorkspaceCache(): Promise<void> {
  maybeRefresh()
  return refreshing ?? Promise.resolve()
}
