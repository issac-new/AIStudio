import { execFile, spawn } from 'child_process'
import type { ChildProcess, ExecFileOptions, SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { basename, dirname, resolve } from 'path'
import {
  normalizeWindowsCommandPath,
  windowsCmdShimExecution,
  windowsCommandNeedsShell,
} from '../../../studio/public/windows-command'

export interface HermesInvocation {
  command: string
  argsPrefix: string[]
}

export interface HermesExecResult {
  stdout: string
  stderr: string
}

export function resolveHermesBin(customBin?: string): string {
  return customBin?.trim() || process.env.HERMES_BIN?.trim() || 'hermes'
}

function comparableWindowsCommand(command: string): string {
  return normalizeWindowsCommandPath(command.trim()).replace(/\//g, '\\').toLowerCase()
}

function bundledCliPythonForWindows(hermesBin: string, env: NodeJS.ProcessEnv): string | null {
  const envPython = env.HERMES_AGENT_CLI_PYTHON?.trim()
  const envHermesBin = env.HERMES_BIN?.trim()
  if (envPython && (!envHermesBin || comparableWindowsCommand(envHermesBin) === comparableWindowsCommand(hermesBin))) {
    return envPython
  }

  const launcher = basename(hermesBin).toLowerCase()
  if (launcher !== 'hermes.exe' && launcher !== 'hermes.cmd') return null
  const candidates = [
    resolve(dirname(hermesBin), 'python.exe'),
    resolve(dirname(hermesBin), 'python3.exe'),
    resolve(dirname(hermesBin), '..', 'python.exe'),
  ]
  return candidates.find(existsSync) || null
}

function withWindowsHide<T extends ExecFileOptions | SpawnOptions>(options?: T): T {
  if (process.platform !== 'win32') return (options || {}) as T
  return { windowsHide: true, ...(options || {}) } as T
}

export function resolveHermesInvocation(
  hermesBin = resolveHermesBin(),
  env: NodeJS.ProcessEnv = process.env,
): HermesInvocation {
  if (process.platform === 'win32') {
    const python = bundledCliPythonForWindows(hermesBin, env)
    if (python) return { command: python, argsPrefix: ['-m', 'hermes_cli.main'] }
  }

  return { command: hermesBin, argsPrefix: [] }
}

export function execHermesWithBin(
  hermesBin: string,
  args: readonly string[],
  options?: ExecFileOptions,
): Promise<HermesExecResult> {
  // overlay[perf]（2026-09-30 根治批）：短生命周期查询 exec 显式关闭托管安装
  // 机制——CLI 启动时 venv 货币性检查（48 个插件选择 YAML 的 ruamel 纯 Python
  // 解析）实测 3.9s/exec，配 hermes-agent patch 529 的 check_runtime 旗标短路；
  // 调用方已设值时不覆写。长连流（spawnHermes：看板 watcher/网关）不注入。
  const baseEnv = { ...(options?.env || process.env) }
  if (!baseEnv.HERMES_DISABLE_LAZY_INSTALLS) baseEnv.HERMES_DISABLE_LAZY_INSTALLS = '1'
  const invocation = resolveHermesInvocation(hermesBin, baseEnv)
  const invocationArgs = [...invocation.argsPrefix, ...args]
  const execution = process.platform === 'win32' && windowsCommandNeedsShell(invocation.command)
    ? windowsCmdShimExecution(invocation.command, invocationArgs)
    : { command: invocation.command, args: invocationArgs }
  return new Promise((resolveExec, rejectExec) => {
    execFile(
      execution.command,
      execution.args,
      {
        ...withWindowsHide({ ...options, env: baseEnv }),
        encoding: 'utf8',
        ...('windowsVerbatimArguments' in execution
          ? { windowsVerbatimArguments: execution.windowsVerbatimArguments }
          : {}),
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectExec(Object.assign(error, { stdout, stderr }))
          return
        }
        resolveExec({ stdout: String(stdout || ''), stderr: String(stderr || '') })
      },
    )
  })
}

export function execHermes(args: readonly string[], options?: ExecFileOptions) {
  return execHermesWithBin(resolveHermesBin(), args, options)
}

export function spawnHermesWithBin(
  hermesBin: string,
  args: readonly string[],
  options?: SpawnOptions,
): ChildProcess {
  const invocation = resolveHermesInvocation(hermesBin, options?.env || process.env)
  const invocationArgs = [...invocation.argsPrefix, ...args]
  const execution = process.platform === 'win32' && windowsCommandNeedsShell(invocation.command)
    ? windowsCmdShimExecution(invocation.command, invocationArgs)
    : { command: invocation.command, args: invocationArgs }
  return spawn(execution.command, execution.args, {
    ...withWindowsHide(options),
    ...('windowsVerbatimArguments' in execution
      ? { windowsVerbatimArguments: execution.windowsVerbatimArguments }
      : {}),
  })
}

export function spawnHermes(args: readonly string[], options?: SpawnOptions): ChildProcess {
  return spawnHermesWithBin(resolveHermesBin(), args, options)
}
