/**
 * Terminal tool availability probe: GET /api/hermes/terminal-tools
 *
 * 扫描服务端 process.env.PATH，返回 cockpit 终端支持的编码工具
 * （claude / codex / dsh，按优先顺序）是否可执行。用 fs 扫描而非
 * spawn `which`：探测结果与 node-pty 子进程实际继承的 PATH 完全一致，
 * 且无子进程开销、可同步单测。
 *
 * 与 trace.ts 同形：default export @koa/router，由 patch 注入
 * packages/server/src/routes/index.ts 的 auth 保护段注册。
 */
import Router from '@koa/router'
import { existsSync } from 'fs'
import { join } from 'path'

export interface TerminalToolStatus {
  id: 'claude-code' | 'codex' | 'deepseek-harness'
  installed: boolean
  path: string | null
}

/** 与 client cockpit/terminal/terminal-tools.ts 的 TERMINAL_TOOLS 顺序保持一致 */
const TOOL_BINS: Array<{ id: TerminalToolStatus['id']; bin: string }> = [
  { id: 'claude-code', bin: 'claude' },
  { id: 'codex', bin: 'codex' },
  { id: 'deepseek-harness', bin: 'dsh' },
]

const WIN_DEFAULT_EXTENSIONS = ['.COM', '.EXE', '.BAT', '.CMD']

function windowsExtensions(env: Record<string, string | undefined>): string[] {
  const ext = env.PATHEXT
  if (!ext) return WIN_DEFAULT_EXTENSIONS
  const parts = ext.split(';').map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : WIN_DEFAULT_EXTENSIONS
}

function isExecutableFile(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

/**
 * 在 pathDirs 中查找 bin（unix 按原名；windows 依次尝试 PATHEXT 扩展名）。
 * 返回命中的绝对路径，未命中返回 null。
 */
export function findBinOnPath(
  bin: string,
  pathDirs: readonly string[],
  isWindows: boolean,
  extensions: readonly string[] = WIN_DEFAULT_EXTENSIONS,
): string | null {
  for (const dir of pathDirs) {
    if (!dir) continue
    if (!isWindows) {
      const candidate = join(dir, bin)
      if (isExecutableFile(candidate)) return candidate
      continue
    }
    // Windows: 先试无扩展名（bash shim 等），再试 PATHEXT 各扩展
    const bare = join(dir, bin)
    if (isExecutableFile(bare)) return bare
    for (const ext of extensions) {
      const candidate = join(dir, `${bin}${ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`}`)
      if (isExecutableFile(candidate)) return candidate
    }
  }
  return null
}

/** 纯函数探测：便于单测注入 env/platform */
export function detectTerminalTools(
  env: Record<string, string | undefined> = process.env,
  isWindows = process.platform === 'win32',
): TerminalToolStatus[] {
  const pathValue = env.PATH || env.Path || ''
  const pathDirs = pathValue.split(isWindows ? ';' : ':')
  const extensions = isWindows ? windowsExtensions(env) : []
  return TOOL_BINS.map(({ id, bin }) => {
    const path = findBinOnPath(bin, pathDirs, isWindows, extensions)
    return { id, installed: path !== null, path }
  })
}

const router = new Router()

router.get('/api/hermes/terminal-tools', (ctx) => {
  ctx.type = 'application/json'
  ctx.body = { tools: detectTerminalTools() }
})

export default router
