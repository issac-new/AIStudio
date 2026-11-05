#!/usr/bin/env node
// 发布/推送前的 qgate 健康体检代理（v0.4 治理可信度修复）。
//
// 背景：`.qgate/state.json` 只留每门最新一条，且 CONDITIONAL 同时代表
// 「失败被 warn 容忍 / 证据不足 / 执行器报错」。pre-push 只看 CLI 退出码，
// 4/5 个 L0 门 error→CONDITIONAL 仍会放行。本脚本把 `qgate health --json`
// 包成稳定入口，供 pre-push、release:preflight、人工巡检共用。
//
// 用法：
//   node scripts/qgate-health.mjs [--scope pre-push|release|all] [--require-fresh]
//        [--max-age-hours N] [--consecutive N] [--json]
// 退出码：
//   0=健康；1=存在 degraded/fail/inconclusive/stale（--require-fresh 时含 never/skip）；
//   2=用法错误或 qgate dist 缺失。

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(ROOT, 'custom', 'qgate', 'dist', 'cli.js')

function parseArgs(argv) {
  const out = { scope: 'all', requireFresh: false, maxAgeHours: undefined, consecutive: undefined, json: false, noBaseline: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--scope') out.scope = argv[++i]
    else if (a === '--require-fresh') out.requireFresh = true
    else if (a === '--max-age-hours') out.maxAgeHours = argv[++i]
    else if (a === '--consecutive') out.consecutive = argv[++i]
    else if (a === '--json') out.json = true
    else if (a === '--no-baseline') out.noBaseline = true
    else if (a === '--help' || a === '-h') out.help = true
    else throw new Error(`unknown argument: ${a}`)
  }
  if (!['pre-push', 'release', 'all'].includes(out.scope)) throw new Error('--scope must be pre-push|release|all')
  if (out.maxAgeHours !== undefined && (!Number.isFinite(Number(out.maxAgeHours)) || Number(out.maxAgeHours) <= 0)) {
    throw new Error('--max-age-hours must be a positive number')
  }
  if (out.consecutive !== undefined && (!Number.isInteger(Number(out.consecutive)) || Number(out.consecutive) <= 0)) {
    throw new Error('--consecutive must be a positive integer')
  }
  return out
}

function cliArgs(opts) {
  const args = ['health', '--scope', opts.scope, '--json']
  if (opts.requireFresh) args.push('--require-fresh')
  if (opts.maxAgeHours !== undefined) args.push('--max-age-hours', String(opts.maxAgeHours))
  if (opts.consecutive !== undefined) args.push('--consecutive', String(opts.consecutive))
  return args
}

function renderHuman(report) {
  const lines = [`qgate health: scope=${report.scope} exit=${report.exitCode}`]
  for (const row of report.gates) {
    const label = row.allowed ? `KNOWN-${row.health.toUpperCase()}` : row.health.toUpperCase()
    lines.push(
      `  ${label} ${row.gateId} [${row.domain}] verdict=${row.verdict}` +
      `${row.executionStatus ? `/${row.executionStatus}` : ''} freshness=${row.freshness}` +
      `${row.consecutiveNonPass ? ` consecutiveNonPass=${row.consecutiveNonPass}` : ''}` +
      `${row.reason ? ` — ${row.reason}` : ''}` +
      `${row.allowed ? ` — 豁免至 ${row.knownReviewBy ?? '?'}（${row.knownReason ?? 'baseline'}）` : ''}`,
    )
  }
  lines.push(`  summary: ${Object.entries(report.summary).map(([k, v]) => `${k}=${v}`).join(' ')}`)
  if (report.known?.length) lines.push(`  known-degraded（基线豁免，不阻断）：${report.known.join(', ')}`)
  if (report.expired?.length) lines.push(`  baseline-expired（豁免已失效，按 strict 处理）：${report.expired.join(', ')}`)
  return lines.join('\n')
}

/** 把「已知欠债」与「新退化」分开：基线只豁免表内且未过期的 gate；新 gate 退化仍然失败。
    baseline 条目缺少 reviewBy 或已过期 → 不豁免（fail-closed），并在 expired 里列出。 */
export function applyBaseline(report, baseline, now = Date.now()) {
  const allow = new Map()
  const expired = []
  for (const entry of baseline?.allow ?? []) {
    if (!entry?.gateId) continue
    const due = entry.reviewBy ? Date.parse(entry.reviewBy) : NaN
    if (!Number.isFinite(due) || due < now) {
      expired.push(entry.gateId)
      continue
    }
    allow.set(entry.gateId, entry)
  }
  let hard = 0
  const known = []
  for (const row of report.gates) {
    const entry = allow.get(row.gateId)
    const isFail = (report.failOn ?? []).includes(row.health) || row.consecutiveBreach === true
    if (entry && isFail) {
      row.allowed = true
      row.knownReason = entry.reason
      row.knownReviewBy = entry.reviewBy
      known.push(row.gateId)
      continue
    }
    if (isFail) hard += 1
  }
  return { ...report, exitCode: hard > 0 ? 1 : 0, known, expired }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (e) {
    err.write(`qgate-health: ${e.message}\n`)
    return 2
  }
  if (opts.help) {
    out.write('usage: node scripts/qgate-health.mjs [--scope pre-push|release|all] [--require-fresh] [--max-age-hours N] [--consecutive N] [--json]\n')
    return 0
  }
  if (!existsSync(CLI)) {
    err.write(`qgate-health: ${CLI} missing — run: npm run qgate:build\n`)
    return 2
  }
  const res = spawnSync(process.execPath, [CLI, ...cliArgs(opts)], { cwd: ROOT, encoding: 'utf8' })
  if (res.error) {
    err.write(`qgate-health: failed to run qgate: ${res.error.message}\n`)
    return 2
  }
  let raw
  try {
    raw = JSON.parse(res.stdout)
  } catch {
    err.write(`qgate-health: qgate returned non-JSON output (status=${res.status})\n${res.stdout}\n${res.stderr}\n`)
    return 2
  }
  let baseline = null
  if (!opts.noBaseline) {
    try {
      baseline = JSON.parse(readFileSync(join(ROOT, 'config', 'qgate-health-baseline.json'), 'utf8'))
    } catch {
      baseline = null
    }
  }
  const report = applyBaseline(raw, baseline)
  if (opts.json) out.write(JSON.stringify(report, null, 2) + '\n')
  else out.write(renderHuman(report) + '\n')
  return report.exitCode === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { parseArgs, cliArgs, renderHuman, main }
