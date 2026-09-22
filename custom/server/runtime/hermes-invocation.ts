// overlay/custom/server/runtime/hermes-invocation.ts
// hermes CLI 调用解析(跨平台)。内联自 upstream hermes-process.ts 并针对
// server 侧 dev 场景补 Windows .cmd 通道(2026-09-22 win-x64 排查):
//   - HERMES_BIN 指向 hermes.exe(桌面态) → 捆绑 python -m hermes_cli.main
//     (与 task-workspace-cache.ts / upstream runtime-manager 同款约定)
//   - win32 裸名/venv hermes.cmd → cmd.exe /c(PATHEXT 解析;execFile 直跑
//     .cmd 自 Node CVE-2024-27980 修复后抛 EINVAL;参数经 assertCmdSafeArgs 把关)
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

// cmd.exe 对整条命令行做自己的解析（MS-C 运行时的 \" 转义不适用）：参数中的双引号
// 会终止 Node 写出的引号区间，后续 & | 等元字符即被当作命令执行（LLM/用户可控的
// prompt 文本经此通道即命令注入）；成对 %VAR% 在引号内也会被展开。cmd 通道下出现
// 这些字符一律拒绝执行并指引导级 python/.exe 通道。
const CMD_QUOTE_BREAK = /["&|<>^]/
const CMD_PERCENT_EXPANSION = /%[^%]*%/

export function assertCmdSafeArgs(invocation: HermesInvocation, args: string[]): void {
  if (!invocation.argsPrefix.includes('/c')) return
  for (const arg of args) {
    if (CMD_QUOTE_BREAK.test(arg) || CMD_PERCENT_EXPANSION.test(arg)) {
      throw new Error(
        `cmd.exe 通道参数含 shell 元字符，拒绝执行（防命令注入）: ${arg.slice(0, 40)}`
        + ' —— 请将 HERMES_BIN 指向 hermes.exe，或设置 HERMES_AGENT_CLI_PYTHON 走 python 通道',
      )
    }
  }
}
