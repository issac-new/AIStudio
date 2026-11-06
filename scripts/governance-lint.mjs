#!/usr/bin/env node
// 治理台账 lint（v0.4 治理可信度修复）。
//
// 背景：75 条 decisions 有 5 套字段形态、39 条缺 actor；192 条收据覆盖 122/555 份 spec；
// 提交标题里「根治/根因」586 次/90 天但同类故障跨轮复发。本脚本把「台账可机检」
// 从口号变成可执行入口：只读校验，不改写历史证据。
//
// 用法：
//   node scripts/governance-lint.mjs [--strict] [--budget] [--spec-coverage]
//        [--commits] [--range origin/main..HEAD] [--enforce] [--json]
// 退出码：
//   0=通过（可能有 legacy 警告）；1=有违规；2=用法错误或文件缺失。
// 纪律：
//   - 不原地重写 decisions/receipts（审计证据不可自动改写）；
//     --spec-coverage 只写生成物，--commits 只读 git log。
//   - legacy 行（id/decision、refs）在非 strict 模式只告警；新行必须符合标准形态。

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LEDGERS = {
  decisions: '.swarm-yuan/decisions.jsonl',
  receipts: '.swarm-yuan/spec-receipts.jsonl',
  gateDeny: '.swarm-yuan/gate-deny.jsonl',
  recurrence: '.swarm-yuan/recurrence.jsonl',
}
const SCHEMA_PATH = 'config/governance-schema.json'
const BUDGET_PATH = 'config/mechanism-budget.json'
const SILENT_BASELINE_PATH = 'config/silent-return-baseline.json'
const SPECS_DIR = 'docs/superpowers/specs'
const COVERAGE_OUT = '.swarm-yuan/spec-coverage.json'

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  } catch {
    return fallback
  }
}

export function parseJsonl(text, file = '<memory>') {
  const rows = []
  const problems = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const row = JSON.parse(line)
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        problems.push(`${file}:${i + 1} 不是 JSON 对象`)
      } else {
        rows.push({ row, line: i + 1 })
      }
    } catch {
      problems.push(`${file}:${i + 1} JSON 解析失败`)
    }
  }
  return { rows, problems }
}

function missingFields(row, fields) {
  return fields.filter((f) => row[f] === undefined || row[f] === null || row[f] === '')
}

function shapeOf(row, schema) {
  const legacy = schema?.legacyShapes ?? {}
  for (const [name, fields] of Object.entries(legacy)) {
    if (fields.every((f) => row[f] !== undefined)) return name
  }
  return 'standard'
}

export function validateDecisions(rows, schema, strict = false) {
  const problems = []
  const warnings = []
  const required = schema?.required ?? ['ts', 'type']
  const standardRequired = schema?.standardRequired ?? ['phase', 'ai_suggestion', 'user_action', 'outcome', 'rationale', 'actor']
  // 棘轮：历史行不改写，严格档只对 strictFrom 之后的新行生效。
  const strictFrom = schema?.strictFrom ? Date.parse(schema.strictFrom) : Number.POSITIVE_INFINITY
  const isNew = (row) => {
    const t = Date.parse(String(row.ts ?? ''))
    return Number.isFinite(t) && t >= strictFrom
  }
  for (const { row, line } of rows) {
    const miss = missingFields(row, required)
    if (miss.length > 0) {
      problems.push(`decisions.jsonl:${line} 缺必填 ${miss.join(',')}`)
      continue
    }
    const shape = shapeOf(row, schema)
    if (shape !== 'standard') {
      const msg = `decisions.jsonl:${line} legacy 形态 ${shape}（ts/type 在，标准字段不全）`
      if (strict && isNew(row)) problems.push(msg)
      else warnings.push(msg)
      continue
    }
    const missStd = missingFields(row, standardRequired)
    if (missStd.length > 0) {
      const msg = `decisions.jsonl:${line} 标准行缺 ${missStd.join(',')}`
      if (strict && isNew(row)) problems.push(msg)
      else warnings.push(msg)
    }
  }
  return { problems, warnings }
}

export function validateReceipts(rows, schema) {
  const problems = []
  const required = schema?.required ?? ['at', 'spec', 'receipt', 'commit']
  for (const { row, line } of rows) {
    const miss = missingFields(row, required)
    if (miss.length > 0) {
      problems.push(`spec-receipts.jsonl:${line} 缺必填 ${miss.join(',')}`)
      continue
    }
    // 收据哈希：git blob sha1（40）与一次 sha256 变体（64）都接受；拒绝占位/截断。
    if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(row.receipt))) {
      problems.push(`spec-receipts.jsonl:${line} receipt 不是 40/64 位十六进制哈希`)
    }
    if (!existsSync(join(ROOT, String(row.spec)))) {
      problems.push(`spec-receipts.jsonl:${line} spec 路径不存在: ${row.spec}`)
    }
  }
  return { problems, warnings: [] }
}

export function validateGateDeny(rows, schema) {
  const problems = []
  const required = schema?.required ?? ['ts', 'tool', 'target', 'gates']
  for (const { row, line } of rows) {
    const miss = missingFields(row, required)
    if (miss.length > 0) problems.push(`gate-deny.jsonl:${line} 缺必填 ${miss.join(',')}`)
    else if (!(Array.isArray(row.gates) || typeof row.gates === 'string')) {
      // 历史行 gates 是字符串（single gate id）；新行允许数组。两者都接受，拒收数字/对象。
      problems.push(`gate-deny.jsonl:${line} gates 不是字符串或数组`)
    }
  }
  return { problems, warnings: [] }
}

export function validateRecurrence(rows, schema) {
  const problems = []
  const required = schema?.required ?? ['ts', 'category', 'count']
  for (const { row, line } of rows) {
    const miss = missingFields(row, required)
    if (miss.length > 0) problems.push(`recurrence.jsonl:${line} 缺必填 ${miss.join(',')}`)
    else if (typeof row.count !== 'number') problems.push(`recurrence.jsonl:${line} count 不是数字`)
  }
  return { problems, warnings: [] }
}

export function computeSpecCoverage(specsDir, receipts) {
  const files = readdirSync(specsDir).filter((f) => f.endsWith('.md')).map((f) => `${SPECS_DIR}/${f}`)
  const covered = new Set(receipts.rows.map(({ row }) => row.spec))
  const uncovered = files.filter((f) => !covered.has(f))
  return {
    total: files.length,
    covered: files.length - uncovered.length,
    coverage: files.length === 0 ? 1 : (files.length - uncovered.length) / files.length,
    uncovered,
  }
}

/** 历史台账不改写；生成标准形态副本供人工复核（legacy → standard 的默认值显式写 unknown）。 */
export function normalizeDecisions(rows) {
  return rows.map(({ row }) => ({
    ...row,
    phase: row.phase ?? 'unknown',
    ai_suggestion: row.ai_suggestion ?? row.decision ?? row.suggestion ?? '',
    user_action: row.user_action ?? 'unknown',
    outcome: row.outcome ?? 'unknown',
    rationale: row.rationale ?? '',
    actor: row.actor ?? 'unknown',
    category: row.category ?? 'uncategorized',
  }))
}

export function checkCommitTitles(titles, enforce = false) {
  const suspicious = []
  for (const t of titles) {
    if (/根治|根因/.test(t) && !/反证|复现|守门|测试|spec|复验/.test(t)) suspicious.push(t)
  }
  return { problems: enforce ? suspicious : [], warnings: enforce ? [] : suspicious }
}

/** silent-return：测试里「前置条件不满足就 return」会让用例静默通过（比 skip 更隐蔽）。
    基线棘轮只许减；新增一处即失败。 */
export function countSilentReturns() {
  let files = []
  try {
    // 只列测试面（custom/scripts/simharness/tests），并显式放宽 maxBuffer：
    // 整仓 git ls-files 5.5 万条会触发 spawnSync ENOBUFS（本仓 2026-11-05 实测）。
    files = execFileSync('git', ['ls-files', '--', 'custom', 'scripts', 'simharness/tests'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter((f) => f.endsWith('.test.ts'))
  } catch {
    return { count: 0, offenders: [] }
  }
  let count = 0
  const offenders = []
  for (const f of files) {
    let text
    try {
      text = readFileSync(join(ROOT, f), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\s*if \(.*\)\s*return;?\s*$/.test(lines[i])) {
        count += 1
        offenders.push(`${f}:${i + 1}`)
      }
    }
  }
  return { count, offenders }
}

export function checkSilentReturns(baseline) {
  const problems = []
  const warnings = []
  const { count, offenders } = countSilentReturns()
  if (!baseline) {
    problems.push(`${SILENT_BASELINE_PATH} 缺失`)
    return { problems, warnings, count, offenders }
  }
  if (count > baseline.count) {
    problems.push(`silent-return 新增: ${count} > 基线 ${baseline.count}（末 10 处：${offenders.slice(-10).join(', ')}）`)
  } else if (count < baseline.count) {
    warnings.push(`silent-return 已降到 ${count}，基线 ${baseline.count} 可下调`)
  }
  return { problems, warnings, count, offenders }
}

function countLines(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length
  } catch {
    return 0
  }
}

function countFiles(pattern) {
  try {
    return readdirSync(join(ROOT, pattern)).filter((f) => f.endsWith('.mjs')).length
  } catch {
    return 0
  }
}

// 递归统计 scripts 下所有 .mjs（预算口径是整棵脚本树，不是只有根层）。
function countScriptsRecursive(dir = 'scripts') {
  let n = 0
  const visit = (rel) => {
    let entries
    try {
      entries = readdirSync(join(ROOT, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'vendor' || e.name.startsWith('.')) continue
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) visit(child)
      else if (e.name.endsWith('.mjs')) n += 1
    }
  }
  visit(dir)
  return n
}

// 退役机可机检（2026-11-06 复盘 P2-1）：登记墙不能替代退役判定。
// 检测三类失真：reviewBy 过期、retireWhen 无判定器、声称退役却仍在册。
export function checkSunset(budget, asOf = new Date()) {
  const problems = []
  const warnings = []
  const sunset = budget?.sunset ?? []
  const ids = new Set(sunset.map(e => e?.id))
  for (const e of sunset) {
    if (!e || !e.id) continue
    const by = Date.parse(`${e.reviewBy}T23:59:59Z`)
    if (Number.isFinite(by) && by < asOf.getTime()) {
      problems.push(`sunset ${e.id}: reviewBy ${e.reviewBy} 已过期，须复核或退役`)
    }
    if (!e.check) {
      warnings.push(`sunset ${e.id}: retireWhen 仅为自然语言，无机检判定器`)
    } else if (e.check.type === 'filePresent' && !existsSync(join(ROOT, e.check.path ?? ''))) {
      warnings.push(`sunset ${e.id}: 判定器已达退役条件（${e.check.path} 缺席），须移出 sunset 册`)
    }
  }
  for (const c of budget?.changes ?? []) {
    for (const note of c?.pairedRemovals ?? []) {
      const m = /^([a-z0-9-]+)\s+按既有 sunset 退役/.exec(String(note))
      if (m && ids.has(m[1])) problems.push(`pairedRemovals 声称 ${m[1]} 已退役，但仍在 sunset 册`)
    }
  }
  return { problems, warnings, checked: sunset.length }
}

export function checkBudget(budget) {
  const problems = []
  const warnings = []
  if (!budget) return { problems: ['config/mechanism-budget.json 缺失'], warnings, stats: {} }
  const stats = {
    gates: 0,
    patches: countLines('patches/series'),
    zcodePatches: countLines('zcode-patches/series'),
    scripts: countScriptsRecursive(),
    ledgers: Object.values(LEDGERS).filter((f) => existsSync(join(ROOT, f))).length,
    npmScripts: Object.keys(readJson('package.json', { scripts: {} }).scripts ?? {}).length,
  }
  try {
    stats.gates = execFileSync('bash', ['-lc', 'ls custom/qgate/gate-packs/*/gates/*.yaml 2>/dev/null | wc -l'], { cwd: ROOT, encoding: 'utf8' }).trim() * 1
  } catch {
    stats.gates = 0
  }
  for (const [key, limit] of Object.entries(budget.limits ?? {})) {
    if (typeof stats[key] === 'number' && stats[key] > limit) {
      problems.push(`机制预算超限: ${key}=${stats[key]} > ${limit}`)
    }
  }
  for (const entry of budget.sunset ?? []) {
    const miss = missingFields(entry, ['id', 'owner', 'reviewBy', 'retireWhen'])
    if (miss.length > 0) problems.push(`sunset 条目 ${entry.id ?? '(no-id)'} 缺 ${miss.join(',')}`)
  }
  const retirement = checkSunset(budget)
  problems.push(...retirement.problems)
  warnings.push(...retirement.warnings)
  return { problems, warnings, stats }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  const flags = new Set(argv)
  if (flags.has('--help') || flags.has('-h')) {
    out.write('usage: node scripts/governance-lint.mjs [--strict] [--budget] [--spec-coverage] [--silent-returns] [--normalize-decisions] [--commits] [--only-commits] [--range origin/main..HEAD] [--enforce] [--json]\n')
    return 0
  }
  const known = new Set(['--strict', '--budget', '--spec-coverage', '--silent-returns', '--normalize-decisions', '--commits', '--only-commits', '--enforce', '--json', '--range'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--range') { i += 1; continue }
    if (!known.has(a) && a.startsWith('--')) {
      err.write(`governance-lint: unknown argument: ${a}\n`)
      return 2
    }
  }
  const schema = readJson(SCHEMA_PATH, null)
  const allProblems = []
  const allWarnings = []
  const results = {}
  const onlyCommits = flags.has('--only-commits')

  if (!onlyCommits) {
    const decisionsText = readJsonlFile(LEDGERS.decisions)
    if (decisionsText) {
      const { rows, problems } = parseJsonl(decisionsText, LEDGERS.decisions)
      allProblems.push(...problems)
      const v = validateDecisions(rows, schema?.decisions, flags.has('--strict'))
      allProblems.push(...v.problems); allWarnings.push(...v.warnings)
      results.decisions = { rows: rows.length }
    }
    const receiptsText = readJsonlFile(LEDGERS.receipts)
    if (receiptsText) {
      const { rows, problems } = parseJsonl(receiptsText, LEDGERS.receipts)
      allProblems.push(...problems)
      const v = validateReceipts(rows, schema?.receipts)
      allProblems.push(...v.problems)
      results.receipts = { rows: rows.length, ...(flags.has('--spec-coverage') ? computeSpecCoverage(join(ROOT, SPECS_DIR), { rows }) : {}) }
      if (flags.has('--spec-coverage') && results.receipts.total !== undefined) {
        const coverage = {
          generatedAt: new Date().toISOString(),
          total: results.receipts.total,
          covered: results.receipts.covered,
          coverage: results.receipts.coverage,
          uncovered: results.receipts.uncovered,
        }
        writeFileSync(join(ROOT, COVERAGE_OUT), JSON.stringify(coverage, null, 2) + '\n')
      }
    }
    const gateDenyText = readJsonlFile(LEDGERS.gateDeny)
    if (gateDenyText) {
      const { rows, problems } = parseJsonl(gateDenyText, LEDGERS.gateDeny)
      allProblems.push(...problems)
      const v = validateGateDeny(rows, schema?.gateDeny)
      allProblems.push(...v.problems)
      results.gateDeny = { rows: rows.length }
    }
    const recurrenceText = readJsonlFile(LEDGERS.recurrence)
    if (recurrenceText) {
      const { rows, problems } = parseJsonl(recurrenceText, LEDGERS.recurrence)
      allProblems.push(...problems)
      const v = validateRecurrence(rows, schema?.recurrence)
      allProblems.push(...v.problems)
      results.recurrence = { rows: rows.length }
    }
  }

  if (flags.has('--budget')) {
    const budget = readJson(BUDGET_PATH, null)
    const v = checkBudget(budget)
    allProblems.push(...v.problems); allWarnings.push(...v.warnings)
    results.budget = v.stats
  }

  if (flags.has('--silent-returns')) {
    const baseline = readJson(SILENT_BASELINE_PATH, null)
    const v = checkSilentReturns(baseline)
    allProblems.push(...v.problems); allWarnings.push(...v.warnings)
    results.silentReturns = { count: v.count }
  }

  if (flags.has('--normalize-decisions')) {
    const text = readJsonlFile(LEDGERS.decisions)
    if (text) {
      const { rows } = parseJsonl(text, LEDGERS.decisions)
      const normalized = normalizeDecisions(rows)
      writeFileSync(join(ROOT, '.swarm-yuan/decisions.normalized.jsonl'), normalized.map((r) => JSON.stringify(r)).join('\n') + '\n')
      results.normalizeDecisions = { rows: normalized.length, out: '.swarm-yuan/decisions.normalized.jsonl' }
    }
  }

  if (flags.has('--commits')) {
    const rangeIdx = argv.indexOf('--range')
    const range = rangeIdx >= 0 ? argv[rangeIdx + 1] : 'origin/main..HEAD'
    let titles = []
    try {
      titles = execFileSync('git', ['log', '--pretty=%s', range], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    } catch {
      allWarnings.push(`无法读取提交范围 ${range}（git log 失败）`)
    }
    const v = checkCommitTitles(titles, flags.has('--enforce'))
    allProblems.push(...v.problems); allWarnings.push(...v.warnings)
    results.commits = { range, count: titles.length, suspicious: v.warnings.length + v.problems.length }
  }

  if (flags.has('--json')) {
    out.write(JSON.stringify({ problems: allProblems, warnings: allWarnings, results }, null, 2) + '\n')
  } else {
    for (const w of allWarnings) out.write(`WARN ${w}\n`)
    for (const p of allProblems) out.write(`FAIL ${p}\n`)
    out.write(`governance-lint: ${allProblems.length} problem(s), ${allWarnings.length} warning(s)\n`)
  }
  return allProblems.length > 0 ? 1 : 0
}

function readJsonlFile(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8')
  } catch {
    return null
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
