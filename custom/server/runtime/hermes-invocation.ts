// overlay/custom/server/runtime/hermes-invocation.ts
// hermes CLI 调用解析(跨平台)。内联自 upstream hermes-process.ts 并针对
// server 侧 dev 场景补 Windows .cmd 通道(2026-09-22 win-x64 排查):
//   - HERMES_BIN 指向 hermes.exe(桌面态) → 捆绑 python -m hermes_cli.main
//     (与 task-workspace-cache.ts / upstream runtime-manager 同款约定)
//   - win32 裸名/venv hermes.cmd → cmd.exe /c(PATHEXT 解析;execFile 直跑
//     .cmd 自 Node CVE-2024-27980 修复后抛 EINVAL)
//   - POSIX → 直 execFile,行为与原样完全一致
import { existsSync } from 'fs'
import { basename, dirname, resolve } from 'path'

export function resolveHermesBin(): string {
  return process.env.HERMES_BIN?.trim() || 'hermes'
}

function bundledCliPythonForWindows(hermesBin: string): string | null {
  const envPython = process.env.HERMES_AGENT_CLI_PYTHON?.trim()
  if (envPython) return envPython
  if (basename(hermesBin).toLowerCase() !== 'hermes.exe') return null
  const python = resolve(dirname(hermesBin), '..', 'python.exe')
  return existsSync(python) ? python : null
}

export interface HermesInvocation {
  command: string
  argsPrefix: string[]
}

export function resolveHermesInvocation(
  hermesBin: string = resolveHermesBin(),
  platform: NodeJS.Platform = process.platform,
): HermesInvocation {
  if (platform === 'win32') {
    const python = bundledCliPythonForWindows(hermesBin)
    if (python) return { command: python, argsPrefix: ['-m', 'hermes_cli.main'] }
    if (!hermesBin.toLowerCase().endsWith('.exe')) {
      // venv Scripts\hermes.cmd / PATH 裸名:经 cmd.exe 走 PATHEXT 解析
      return { command: process.env.ComSpec || 'cmd.exe', argsPrefix: ['/d', '/s', '/c', hermesBin] }
    }
  }
  return { command: hermesBin, argsPrefix: [] }
}
