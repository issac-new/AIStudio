// 受信 gate 目录：服务端 env 唯一来源 → GateCommandEntry[]。
// 目录键=命令行本体（简单无引号/无 shell 控制符语法，空白切分即 argv）；
// 编辑器 spec/config 只能引用目录键，任何扩权字段在 gate-executor/preflight 侧拒绝。
// 配置非法时抛 GateCatalogConfigError——装配层捕获后以空目录 fail-closed（gate 起跑
// 即 not-cataloged），绝不回退进程 cwd 或猜测解析。
import { isAbsolute } from 'node:path'
import type { GateCommandEntry } from './gate-executor'

export const GATE_CATALOG_DEFAULT_TIMEOUT_MS = 120_000

/** 目录构建失败：稳定错误码，消息不含 env 值（只描述哪个键非法，防秘密落日志）。 */
export class GateCatalogConfigError extends Error {
  readonly code = 'gate_catalog_config_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'GateCatalogConfigError'
  }
}

/** 简单命令语法：无引号/反斜线/shell 控制符/展开；元素内允许路径与版本字符。 */
const COMMAND_TOKEN = /^[A-Za-z0-9_./:@%+=-]+$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function parsePositiveInt(raw: string | undefined, key: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const value = Number(raw.trim())
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GateCatalogConfigError(`${key} must be a positive integer`)
  }
  return value
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * 从服务端 env 构建唯一受信目录。
 * - LOOP_GATE_COMMANDS：逗号分隔命令行（每条按空白切分为固定 argv）
 * - LOOP_GATE_CWD：非空命令表必填的绝对目录（真实根内校验归 gate-executor）
 * - LOOP_GATE_TIMEOUT_MS / LOOP_GATE_ENV_ALLOWLIST / LOOP_GATE_WRITABLE_ROOTS：可选
 */
export function buildTrustedGateCatalog(env: NodeJS.ProcessEnv = process.env): GateCommandEntry[] {
  const commands = splitList(env.LOOP_GATE_COMMANDS)
  if (commands.length === 0) return []

  const seen = new Set<string>()
  for (const command of commands) {
    if (seen.has(command)) {
      throw new GateCatalogConfigError('LOOP_GATE_COMMANDS contains a duplicate command')
    }
    seen.add(command)
    for (const token of command.split(/\s+/)) {
      if (!COMMAND_TOKEN.test(token)) {
        throw new GateCatalogConfigError(
          'LOOP_GATE_COMMANDS only supports simple unquoted commands without shell controls',
        )
      }
    }
  }

  const rawCwd = env.LOOP_GATE_CWD?.trim() ?? ''
  if (!rawCwd) {
    throw new GateCatalogConfigError('LOOP_GATE_CWD is required when LOOP_GATE_COMMANDS is set')
  }
  if (!isAbsolute(rawCwd)) {
    throw new GateCatalogConfigError('LOOP_GATE_CWD must be an absolute directory')
  }

  const timeoutMs = parsePositiveInt(env.LOOP_GATE_TIMEOUT_MS, 'LOOP_GATE_TIMEOUT_MS')
    ?? GATE_CATALOG_DEFAULT_TIMEOUT_MS

  const envAllowlist = splitList(env.LOOP_GATE_ENV_ALLOWLIST)
  for (const name of envAllowlist) {
    if (!ENV_NAME.test(name)) {
      throw new GateCatalogConfigError('LOOP_GATE_ENV_ALLOWLIST contains an invalid variable name')
    }
  }

  const writableRoots = splitList(env.LOOP_GATE_WRITABLE_ROOTS)
  for (const root of writableRoots) {
    if (!isAbsolute(root)) {
      throw new GateCatalogConfigError('LOOP_GATE_WRITABLE_ROOTS must be absolute directories')
    }
  }

  return commands.map(command => ({
    command,
    argv: command.split(/\s+/),
    cwd: rawCwd,
    timeoutMs,
    envAllowlist,
    writableRoots,
  }))
}
