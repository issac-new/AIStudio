// 编辑器 gate 的服务端目录适配器：固定 argv + 真实 OS sandbox，任何降级都失败关闭。
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
// @ts-expect-error 本仓 harness 未开 allowImportingTsExtensions；显式 .ts 防止同名 CJS 镜像抢占本批新增字段。
import { detectSandboxSupport, runSandboxed, type SandboxRunOptions, type SandboxRunResult, type SandboxSupport } from '../../sandbox/exec-sandbox.ts'
import { registerLease } from '../../sandbox/sandbox-lease'
import { redactSensitive } from '../../toolcontract/contract'
import { NodeExecutionError, type NodeContext, type NodeResult } from './types'

export type GateCommandEntry = {
  command: string
  argv: string[]
  cwd: string
  timeoutMs: number
  envAllowlist?: string[]
  writableRoots?: string[]
}

export type GateExecutionEvidence = {
  command: string
  argv: string[]
  cwd: string
  backend: SandboxSupport['backend']
  leaseId: string
  status: SandboxRunResult['status']
  exitCode: number | null
  durationMs: number
  startedAt: string
  finishedAt: string
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

export interface GateExecutorDeps {
  /** 唯一受信目录；编辑器 config/spec.meta 不在此处合并。 */
  catalog: readonly GateCommandEntry[]
  /** 测试只替换 OS 进程边界；缺省始终是真实 runSandboxed，无宿主裸跑。 */
  runSandboxed?: (opts: SandboxRunOptions) => Promise<SandboxRunResult>
  detectSandboxSupport?: () => SandboxSupport
  registerLease?: typeof registerLease
  now?: () => number
}

export const GATE_EVIDENCE_OUTPUT_LIMIT = 4_096
export const GATE_NODE_TIMEOUT_GRACE_MS = 1_000
const MAX_TIMER_MS = 2_147_483_647
const SHELL_CONTROL = /["'`\\;&|<>$\n\r\0]/
const FORBIDDEN_CONFIG_KEYS = [
  'argv', 'cwd', 'env', 'envAllowlist', 'writableRoots', 'catalog', 'commandCatalog',
] as const

function fail(code: string): never {
  // 失败文案不拼接命令、路径、stderr 或异常原值，避免把秘密带入图事件。
  throw new NodeExecutionError(code, code)
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 ||
      timeoutMs + GATE_NODE_TIMEOUT_GRACE_MS > MAX_TIMER_MS) {
    fail('gate_command_invalid')
  }
}

/** 节点外层超时必须晚于沙箱超时，给结构化 timeout 证据留下返回窗口。 */
export function graphGateNodeTimeoutMs(entry: GateCommandEntry): number {
  validateTimeout(entry.timeoutMs)
  return entry.timeoutMs + GATE_NODE_TIMEOUT_GRACE_MS
}

function validateCommand(entry: GateCommandEntry): void {
  if (!Array.isArray(entry.argv) || entry.argv.length === 0) fail('gate_command_invalid')
  for (const arg of entry.argv) {
    if (typeof arg !== 'string' || arg.length === 0 || SHELL_CONTROL.test(arg)) {
      fail('gate_command_invalid')
    }
  }
  validateTimeout(entry.timeoutMs)
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

type CanonicalRoot = { configured: string; canonical: string }

function canonicalSandboxRoot(): CanonicalRoot {
  const configuredValue = process.env.HERMES_SANDBOX_WORKSPACES_ROOT?.trim()
  if (!configuredValue) fail('gate_root_missing')
  const configured = resolve(configuredValue)
  try {
    const stat = lstatSync(configured)
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('gate_path_invalid')
    return { configured, canonical: realpathSync(configured) }
  } catch (error) {
    if (error instanceof NodeExecutionError) throw error
    fail('gate_path_invalid')
  }
}

/** 同时做 lexical 与 realpath 双重根内检查，并拒绝根下任意路径组件 symlink。 */
function canonicalDirectoryWithin(root: CanonicalRoot, input: string): string {
  if (typeof input !== 'string' || !isAbsolute(input)) fail('gate_path_invalid')
  const candidate = resolve(input)
  if (!within(root.configured, candidate)) fail('gate_path_invalid')
  try {
    const rel = relative(root.configured, candidate)
    let current = root.configured
    for (const segment of rel ? rel.split(/[\\/]/) : []) {
      current = join(current, segment)
      const stat = lstatSync(current)
      if (stat.isSymbolicLink()) fail('gate_path_invalid')
      if (!stat.isDirectory()) fail('gate_path_invalid')
    }
    const canonical = realpathSync(candidate)
    if (!within(root.canonical, canonical)) fail('gate_path_invalid')
    return canonical
  } catch (error) {
    if (error instanceof NodeExecutionError) throw error
    fail('gate_path_invalid')
  }
}

function redactText(value: string, secretValues: readonly string[]): string {
  // 先复用统一脱敏入口，再处理命令输出这种“字符串内嵌秘密”的形态。
  const projected = redactSensitive({ output: value }) as { output: unknown }
  let text = typeof projected.output === 'string' ? projected.output : ''
  for (const secret of secretValues) {
    if (secret) text = text.split(secret).join('<redacted>')
  }
  text = text
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<redacted>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b/g, '<redacted>')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|authorization|cookie|credential|private[_-]?key|access[_-]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1<redacted>')
  return text
}

function boundedOutput(
  value: unknown, sourceTruncated: boolean, secretValues: readonly string[],
): { text: string; truncated: boolean } {
  const redacted = redactText(typeof value === 'string' ? value : '', secretValues)
  return {
    text: redacted.length > GATE_EVIDENCE_OUTPUT_LIMIT
      ? redacted.slice(-GATE_EVIDENCE_OUTPUT_LIMIT)
      : redacted,
    truncated: sourceTruncated || redacted.length > GATE_EVIDENCE_OUTPUT_LIMIT,
  }
}

function evidenceArgv(argv: readonly string[], secretValues: readonly string[]): string[] {
  const out: string[] = []
  let redactNext = false
  for (const arg of argv) {
    if (redactNext) {
      out.push('<redacted>')
      redactNext = false
      continue
    }
    out.push(redactText(arg, secretValues))
    if (/^(?:--?)?(?:api[_-]?key|token|secret|password|authorization|cookie|credential|access[_-]?key)$/i.test(arg)) {
      redactNext = true
    }
  }
  return out
}

function emptyErrorResult(): SandboxRunResult {
  return {
    status: 'error', exitCode: null, stdout: '', stderr: '',
    stdoutTruncated: false, stderrTruncated: false,
  }
}

export async function executeGraphGate(
  config: { id: string; command?: string },
  ctx: NodeContext,
  deps: GateExecutorDeps,
): Promise<NodeResult> {
  if (!config || typeof config.id !== 'string' || !config.id) fail('gate_config_invalid')
  if (config.command === undefined || config.command === null || !String(config.command).trim()) {
    fail('gate_command_missing')
  }
  const command = String(config.command)
  if (command !== command.trim() || SHELL_CONTROL.test(command)) fail('gate_command_invalid')

  const catalog = Array.isArray(deps.catalog) ? deps.catalog : []
  const entry = catalog.find(candidate => candidate.command === command)
  if (!entry) fail('gate_command_not_cataloged')

  const rawConfig = config as unknown as Record<string, unknown>
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    if (Object.hasOwn(rawConfig, key)) fail('gate_config_forbidden')
  }
  if (Object.hasOwn(rawConfig, 'retry') || ctx.retry !== undefined) fail('gate_retry_forbidden')
  if (Object.hasOwn(rawConfig, 'onError') || (ctx.onError !== undefined && ctx.onError.type !== 'fail')) {
    fail('gate_on_error_forbidden')
  }
  validateCommand(entry)

  const root = canonicalSandboxRoot()
  const cwd = canonicalDirectoryWithin(root, entry.cwd)
  const writableRoots: string[] = []
  for (const path of entry.writableRoots ?? []) {
    const canonical = canonicalDirectoryWithin(root, path)
    if (!writableRoots.includes(canonical)) writableRoots.push(canonical)
  }
  const envAllowlist: string[] = [...(entry.envAllowlist ?? [])]
  for (const key of envAllowlist) {
    if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail('gate_command_invalid')
  }

  // lease 名只含身份哈希；run/node/attempt 原值不会变成路径穿越材料。
  const attempt = ctx.superStep + 1
  const digest = createHash('sha256')
    .update(`${ctx.threadId}\0${config.id}\0${attempt}`)
    .digest('hex').slice(0, 24)
  const workspace = join(root.configured, `gate-${digest}`)
  try {
    mkdirSync(workspace, { recursive: true })
  } catch {
    fail('gate_lease_failed')
  }
  canonicalDirectoryWithin(root, workspace)

  const now = deps.now ?? Date.now
  const leaseFactory = deps.registerLease ?? registerLease
  let leaseId: string
  try {
    const lease = leaseFactory({
      runId: `${ctx.threadId}:gate:${config.id}:${attempt}`,
      sessionId: ctx.threadId,
      workspace,
      // registerLease 自身还有 60s 下限；这里确保长命令也不会先过期。
      ttlMs: Math.max(60_000, entry.timeoutMs + 60_000),
      now: now(),
    })
    if (!lease.ok) fail('gate_lease_failed')
    leaseId = lease.lease.id
  } catch (error) {
    if (error instanceof NodeExecutionError) throw error
    fail('gate_lease_failed')
  }

  let support: SandboxSupport
  try {
    support = (deps.detectSandboxSupport ?? detectSandboxSupport)()
  } catch {
    support = { backend: 'none', available: false, detail: 'sandbox support probe failed' }
  }
  const startedMs = now()
  let result: SandboxRunResult
  try {
    result = await (deps.runSandboxed ?? runSandboxed)({
      argv: [...entry.argv], cwd, timeoutMs: entry.timeoutMs,
      envAllowlist, writableRoots,
    })
    if (!result || typeof result !== 'object') result = emptyErrorResult()
  } catch {
    result = emptyErrorResult()
  }
  const finishedMs = now()
  const status = ['ok', 'unavailable', 'error', 'timeout'].includes(result.status)
    ? result.status
    : 'error'
  const secretValues = envAllowlist
    .map(key => process.env[key])
    .filter((value): value is string => value !== undefined && value.length > 0)
  const stdout = boundedOutput(result.stdout, result.stdoutTruncated === true, secretValues)
  const stderr = boundedOutput(result.stderr, result.stderrTruncated === true, secretValues)
  const evidence: GateExecutionEvidence = {
    command: redactText(entry.command, secretValues),
    argv: evidenceArgv(entry.argv, secretValues),
    cwd,
    backend: support.backend,
    leaseId,
    status,
    exitCode: typeof result.exitCode === 'number' && Number.isFinite(result.exitCode)
      ? result.exitCode
      : null,
    durationMs: Math.max(0, finishedMs - startedMs),
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
  }

  if (status !== 'ok' || evidence.exitCode !== 0) {
    throw new NodeExecutionError('gate_failed', 'gate_failed', evidence)
  }
  return {
    update: { [`${config.id}.gatePassed`]: true },
    evidence,
  }
}
