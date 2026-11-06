// AI-Friendly CLI 契约（Node 实现）。词表与退出码的唯一事实源是 config/cli-contract.json；
// Shell / Python 镜像由 custom/__tests__/cli-contract.test.ts 断言一致。
//
// 约束（2026-11-06 spec：2026-11-06-ai-friendly-cli-contract.md）：
//   1. --format 必须由调用方显式选择，默认 human；禁止按 TTY/CI 自动切换。
//   2. JSON 模式 stdout 只放最终结果信封；进度/告警/第三方输出一律 stderr。
//   3. 错误必须同时给 category / reason / remediation——只报「失败了」等于没报。
//   4. --events ndjson 与 --format json 互斥，避免两条 JSON 流混在一条管道里。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CONTRACT_URL = new URL('../../config/cli-contract.json', import.meta.url)

export const CONTRACT = JSON.parse(readFileSync(fileURLToPath(CONTRACT_URL), 'utf8'))
export const CONTRACT_VERSION = CONTRACT.contract_version
export const FORMATS = Object.freeze([...CONTRACT.formats])
export const STATUSES = Object.freeze([...CONTRACT.statuses])
export const ERROR_CATEGORIES = Object.freeze([...CONTRACT.error_categories])
export const EVENT_NAMES = Object.freeze([...CONTRACT.event_names])
export const EXIT = Object.freeze({ ...CONTRACT.exit_codes })

/** 业务类别 → 退出码。映射集中在 mapCategoryToExit，不在各入口手写数字。 */
export function mapCategoryToExit(category) {
  switch (category) {
    case 'usage':
      return EXIT.usage
    case 'partial_failure':
      return EXIT.partial
    case 'config':
    case 'auth_required':
    case 'environment':
    case 'upstream_unavailable':
    case 'timeout':
      return EXIT.environment
    case 'business_failure':
    case 'gate_failed':
    case 'internal':
      return EXIT.business_failure
    default:
      return EXIT.business_failure
  }
}

export class CliError extends Error {
  constructor(category, reason, remediation, options = {}) {
    super(reason)
    this.name = 'CliError'
    this.category = ERROR_CATEGORIES.includes(category) ? category : 'internal'
    this.reason = reason
    this.remediation = remediation || '查看 --help 或运行日志后重试'
    this.exitCode = options.exitCode ?? mapCategoryToExit(this.category)
  }
}

export const usageError = (reason, remediation = '运行 --help 查看可用参数') =>
  new CliError('usage', reason, remediation)

function needValue(argv, index, flag) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw usageError(`${flag} 缺少取值`)
  }
  return value
}

/**
 * 解析通用契约参数并保留业务位置参数。
 * spec.flags     布尔开关（--dry-run 等）
 * spec.options   带值选项（--base 等）
 * spec.legacyJson 是否接受 --json 作为 --format json 的兼容别名
 */
export function parseArgv(argv, spec = {}) {
  const flags = new Set(spec.flags || [])
  const options = new Set(spec.options || [])
  const values = {}
  const positionals = []
  let format = 'human'
  let events = null

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      values.help = true
      continue
    }
    if (arg === '--format' || arg.startsWith('--format=')) {
      const value = arg === '--format' ? needValue(argv, i, '--format') : arg.slice('--format='.length)
      if (arg === '--format') i += 1
      if (!FORMATS.includes(value)) {
        throw usageError(`未知格式 ${value}`, `--format 只接受 ${FORMATS.join('|')}`)
      }
      format = value
      continue
    }
    if (spec.legacyJson && arg === '--json') {
      format = 'json'
      continue
    }
    if (arg === '--events' || arg.startsWith('--events=')) {
      const value = arg === '--events' ? needValue(argv, i, '--events') : arg.slice('--events='.length)
      if (arg === '--events') i += 1
      if (value !== CONTRACT.events_format) {
        throw usageError(`未知事件格式 ${value}`, `--events 只接受 ${CONTRACT.events_format}`)
      }
      events = value
      continue
    }
    if (flags.has(arg)) {
      values[arg.replace(/^--/, '')] = true
      continue
    }
    if (options.has(arg)) {
      values[arg.replace(/^--/, '')] = needValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--')) {
      throw usageError(`未知参数 ${arg}`, '运行 --help 查看可用参数')
    }
    positionals.push(arg)
  }

  if (format === 'json' && events === CONTRACT.events_format) {
    throw usageError(
      '--events ndjson 与 --format json 互斥',
      '机读结果用 --format json；长任务进度用 --events ndjson，二选一',
    )
  }
  return { values, positionals, format, events }
}

/** 结果信封。status 与 error 必须自洽：failed 必须带 error，其余不得带。 */
export function buildResult({ status = 'ok', summary, artifacts, data, error, events } = {}) {
  if (!STATUSES.includes(status)) throw new CliError('internal', `非法状态 ${status}`)
  if (status === 'failed' && !error) {
    throw new CliError('internal', 'status=failed 必须携带 error 信封')
  }
  if (status !== 'failed' && error) {
    throw new CliError('internal', `status=${status} 不得携带 error 信封`)
  }
  const envelope = { schema_version: CONTRACT_VERSION, status }
  if (summary !== undefined) envelope.summary = summary
  if (artifacts !== undefined) envelope.artifacts = artifacts
  if (data !== undefined) envelope.data = data
  if (error !== undefined) {
    envelope.error = {
      category: error.category,
      reason: error.reason,
      remediation: error.remediation,
    }
  }
  if (events !== undefined) envelope.events = events
  return envelope
}

export function emitResult({ format = 'human', result, human } = {}) {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  const line = typeof human === 'function' ? human(result) : human
  if (line !== undefined && line !== null && line !== '') process.stdout.write(`${line}\n`)
}

/** NDJSON 事件：一行一个完整 JSON，写完即刷新，调用方可逐行消费。 */
export function emitEvent(event) {
  if (!event || typeof event !== 'object' || !EVENT_NAMES.includes(event.event)) {
    throw new CliError('internal', `事件名必须是 ${EVENT_NAMES.join('|')}`)
  }
  const line = { ts: new Date().toISOString(), ...event }
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/g, '$1 ***'],
  [
    /\b(api[_-]?key|token|secret|password|authorization|cookie)\b(["']?\s*[:=]\s*["']?)([^\s"',}]{4,})/gi,
    '$1$2***',
  ],
]

/** 诊断输出脱敏：只处理常见凭据形态，不改变普通文本。 */
export function redactSecrets(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return String(value)
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement)
  return text
}

export function redactDeep(value) {
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]))
  }
  return value
}

/**
 * 配置分层解析：按 precedence 顺序取第一个「有值」的层，并保留来源。
 * 文章二的 `config inspect` 要回答的不是值本身，而是「值来自哪一层」。
 */
function resolveConfigIndex(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new CliError('internal', 'resolveConfig 需要至少一层配置')
  }
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    if (step.value !== undefined && step.value !== null && step.value !== '') {
      return { index, value: step.value, source: step.source }
    }
  }
  const index = steps.length - 1
  return { index, value: steps[index].value, source: steps[index].source }
}

export function resolveConfig(steps) {
  const { value, source } = resolveConfigIndex(steps)
  return { value, source }
}

export function configInspect(steps) {
  const resolved = resolveConfigIndex(steps)
  return {
    precedence: steps.map((step) => step.source),
    resolved: { value: redactDeep(resolved.value), source: resolved.source },
    layers: steps.map((step, index) => ({
      source: step.source,
      value: step.value === undefined ? null : redactDeep(step.value),
      used: index === resolved.index,
    })),
  }
}

/** 失败出口：JSON 模式向 stderr 写单行信封；human 模式写可读原因与下一条命令。 */
export function fail(error, options = {}) {
  const format = options.format || 'human'
  const normalized =
    error instanceof CliError
      ? error
      : new CliError('internal', error?.message || String(error), '查看运行日志后重试')
  if (format === 'json') {
    const envelope = {
      schema_version: CONTRACT_VERSION,
      status: 'failed',
      error: {
        category: normalized.category,
        reason: redactSecrets(normalized.reason),
        remediation: redactSecrets(normalized.remediation),
      },
    }
    process.stderr.write(`${JSON.stringify(envelope)}\n`)
  } else {
    process.stderr.write(`[${normalized.category}] ${normalized.reason}\n`)
    process.stderr.write(`修复: ${normalized.remediation}\n`)
  }
  if (options.exit !== false) process.exit(normalized.exitCode)
  return normalized.exitCode
}

/** 把「部分成功」表达成可机读状态，而不是让它冒充 ok 或 failed。 */
export function partialResult({ summary, artifacts, data, failures } = {}) {
  return buildResult({
    status: 'completed_with_errors',
    summary: { ...(summary || {}), failures: failures || [] },
    artifacts,
    data,
  })
}
