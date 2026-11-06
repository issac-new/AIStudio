// CLI 契约静态检查器（2026-11-06 spec：2026-11-06-ai-friendly-cli-contract.md）。
//
// 不执行业务脚本，只读源码判定四项：显式 --format、共享契约模块、stdout 净度、错误信封/凭据脱敏。
// 基线 config/cli-contract-baseline.json 记录存量违规；棘轮规则：
//   - 基线内条目：违规集合不得新增（新增即 fail）
//   - 基线外条目：任何违规即 fail（新入口必须合规）
//   - 已修复项：只告警 baseline 需收紧，不阻断（避免每次改进都要改基线）
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const VIOLATION_KINDS = [
  'no-format',
  'no-contract',
  'stdout-log',
  'no-error-envelope',
  'no-redact',
]

const MX_LIBS = new Set([
  'mx-lib.sh',
  'mx-node.sh',
  'mx-hb.sh',
  'mx-eval-lib.sh',
  'mx-delivery-lib.sh',
  'mx-gate-lib.sh',
  'mx-recovery-lib.sh',
  'mx-scenario-lib.sh',
  'mx-platform.sh',
  'mx-contract.sh',
  'mx_cli_contract.py',
])

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function nodeEntryFromCommand(command) {
  // 只认 `node scripts/...` 形态；env 前缀（cross-env、NODE_OPTIONS=...）不影响。
  const match = /(?:^|\s)node\s+(scripts\/[^\s]+\.mjs)/.exec(command)
  return match ? match[1] : null
}

export function enumerateEntries(root) {
  const entries = new Set()
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      for (const command of Object.values(pkg.scripts || {})) {
        const entry = nodeEntryFromCommand(String(command))
        if (entry && existsSync(join(root, entry))) entries.add(entry)
      }
    } catch {
      // package.json 解析失败由其它门负责；这里不制造第二个错误源。
    }
  }
  const muxDir = join(root, 'simharness/mux')
  if (existsSync(muxDir)) {
    for (const name of readdirSync(muxDir)) {
      if (!/^mx-[a-z0-9-]+\.(sh|mjs|py)$/.test(name)) continue
      if (MX_LIBS.has(name)) continue
      entries.add(`simharness/mux/${name}`)
    }
  }
  return [...entries].sort()
}

export function inspectEntry(root, entry) {
  const source = readText(join(root, entry))
  const violations = []
  const usesContract =
    source.includes('cli-contract.mjs') ||
    source.includes('mx-contract.sh') ||
    source.includes('mx_cli_contract') ||
    source.includes('parseArgv(')
  const declaresFormat =
    source.includes('--format') || source.includes('add_common_args(') || usesContract
  const hasErrorEnvelope =
    source.includes('error_category') ||
    source.includes('mx_fail_json') ||
    source.includes('fail(') ||
    usesContract
  const acceptsSecret =
    /--(token|api-key|password|cookie)\b/.test(source) || /\bapi_key\b/.test(source)
  const hasRedaction = source.includes('redact') || source.includes('mx_redact')

  if (!declaresFormat) violations.push('no-format')
  if (!usesContract) violations.push('no-contract')
  if (!hasErrorEnvelope) violations.push('no-error-envelope')
  if (acceptsSecret && !hasRedaction) violations.push('no-redact')

  // stdout 净度：Node 的 console.log / Shell 未接契约的 echo 进度 / Python 未接契约的 print。
  if (entry.endsWith('.mjs') && /console\.log\(/.test(source)) violations.push('stdout-log')
  if (entry.endsWith('.sh') && !usesContract && /(^|\n)\s*echo\s+"/.test(source)) {
    violations.push('stdout-log')
  }
  if (entry.endsWith('.py') && !usesContract && /(^|\n)\s*print\(/.test(source)) {
    violations.push('stdout-log')
  }
  return { entry, violations: violations.sort() }
}

export function compareWithBaseline(entries, baseline) {
  const baseEntries = baseline?.entries || {}
  const problems = []
  const warnings = []
  const fixed = []
  for (const { entry, violations } of entries) {
    const allowed = new Set(baseEntries[entry] || [])
    const regressions = violations.filter((kind) => !allowed.has(kind))
    if (regressions.length > 0) {
      if (Object.prototype.hasOwnProperty.call(baseEntries, entry)) {
        problems.push(`${entry}: 基线新增违规 ${regressions.join(',')}`)
      } else {
        problems.push(`${entry}: 新入口未接 CLI 契约（${violations.join(',')}）`)
      }
    }
    const healed = [...allowed].filter((kind) => !violations.includes(kind))
    if (healed.length > 0) fixed.push(`${entry}: 已修复 ${healed.join(',')}`)
  }
  for (const entry of Object.keys(baseEntries)) {
    if (!entries.some((item) => item.entry === entry)) {
      warnings.push(`基线条目已不存在：${entry}（可用 --update-baseline 收紧）`)
    }
  }
  if (fixed.length > 0) warnings.push(`基线可收紧 ${fixed.length} 项（--update-baseline）`)
  return { problems, warnings }
}

export function checkCliContract({ root, baseline }) {
  const entries = enumerateEntries(root).map((entry) => inspectEntry(root, entry))
  const { problems, warnings } = compareWithBaseline(entries, baseline)
  const violating = entries.filter((item) => item.violations.length > 0)
  return {
    entries,
    baselineNext: {
      generatedAt: new Date().toISOString(),
      entries: Object.fromEntries(
        violating.map((item) => [item.entry, item.violations]),
      ),
    },
    problems,
    warnings,
    stats: {
      total: entries.length,
      compliant: entries.length - violating.length,
      violating: violating.length,
    },
  }
}
