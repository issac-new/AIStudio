#!/usr/bin/env node
// 复发账本（v0.4 治理可信度修复）。
//
// 背景：近 90 天 586 次「根治/根因」提交，但采集类 28 次、复评类 9 次、闸门/G2/熔断类 14 次
// 跨 run23→run27 复发。没有账本时，「根治」只是一句完成声明；有账本后，同类第 3 次复发
// 必须升级为设计评审，而不是再发一个 fix。
//
// 用法：
//   node scripts/recurrence-report.mjs [--since 90.days] [--json] [--no-append]
// 退出码：0=报告生成（即使有复发项）；1=读取失败。
// 输出：
//   - 终端表格（默认）或 JSON；
//   - 每个 top 类一行 append 到 .swarm-yuan/recurrence.jsonl（--no-append 关闭）。
// 纪律：只读 git/台账；不修改历史提交、不评价个人。

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RECURRENCE_LEDGER = '.swarm-yuan/recurrence.jsonl'
const ERROR_HISTORY = '.swarm-yuan/error-history.jsonl'
const GATE_DENY = '.swarm-yuan/gate-deny.jsonl'
const DECISIONS = '.swarm-yuan/decisions.jsonl'

const CATEGORY_MAP = {
  harness: 'harness', mux: 'harness', sim: 'harness', simharness: 'harness', scenario: 'harness', run: 'harness',
  qgate: 'qgate', gate: 'qgate', review: 'review', spec: 'docs', docs: 'docs',
  client: 'client', server: 'server', ide: 'client', ia2: 'client', cockpit: 'client', kanban: 'client', ui: 'client', matrix: 'client',
  report: 'report', release: 'release', patches: 'patches', build: 'build', runtime: 'runtime', aipay: 'aipay',
}

function readJsonl(file) {
  const p = join(ROOT, file)
  if (!existsSync(p)) return []
  const out = []
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const row = JSON.parse(t)
      if (row && typeof row === 'object') out.push(row)
    } catch {
      /* 坏行跳过；governance-lint 会单独报 */
    }
  }
  return out
}

export function classifyTitle(title) {
  const t = String(title)
  // fix(scope): / feat(scope): / merge: fix/branch——取第一个 scope 词映射
  const m = /^(?:fix|feat|refactor|chore|test|docs|merge):?\s*(?:fix\/)?\(?([a-zA-Z0-9_,-]+)\)?/.exec(t)
  const raw = m ? m[1].split(',')[0].toLowerCase() : ''
  let category = CATEGORY_MAP[raw]
  if (!category) {
    // 无 scope 或 merge 分支名不可映射：按标题关键词兜底（只做粗分类，报告里标明是启发式）
    const keywords = [
      [/harness|sim|推演|采集|复评|闸门|熔断|监督器|派单|唤醒|run2[0-9]/, 'harness'],
      [/qgate|门禁|判词|锚钉|契约执行/, 'qgate'],
      [/release|发布|资产|版本/, 'release'],
      [/patch|补丁/, 'patches'],
      [/docs|spec|附录|索引|文档/, 'docs'],
      [/report|报告/, 'report'],
      [/client|客户端|驾驶舱|IA2|IDE|看板|工作台/, 'client'],
      [/server|服务端/, 'server'],
    ]
    category = keywords.find(([re]) => re.test(t))?.[1] ?? 'other'
  }
  return { category, rootCauseClaim: /根治|根因/.test(t), isFix: /^fix|^merge:\s*fix|fix\(/.test(t) }
}

const FAILURE_CLASS_PATTERNS = [
  ['collection', /采集|collection|补流|画面|帧/],
  ['review', /复评|评审|review|判词|锚钉/],
  ['gate-breaker', /闸门|熔断|G2|G3|G4|G5|breaker/],
  ['dispatch', /派单|唤醒|dispatch|失联|卡住/],
  ['patch', /补丁|patch/],
  ['timeout', /超时|timeout|卡死|挂起/],
  ['contract', /契约|contract|schema|信封/],
  ['test', /测试|用例|vitest|守门/],
]

export function aggregateFailureClasses(titles) {
  const byClass = new Map()
  for (const title of titles) {
    if (!/根治|根因/.test(String(title))) continue
    for (const [cls, re] of FAILURE_CLASS_PATTERNS) {
      if (!re.test(String(title))) continue
      const row = byClass.get(cls) ?? { failureClass: cls, count: 0, examples: [] }
      row.count += 1
      if (row.examples.length < 3) row.examples.push(String(title).slice(0, 120))
      byClass.set(cls, row)
    }
  }
  return [...byClass.values()]
    .map((r) => ({ ...r, needsDesignReview: r.count >= 3 }))
    .sort((a, b) => b.count - a.count)
}

export function aggregateCommits(titles) {
  const byCategory = new Map()
  for (const title of titles) {
    const { category, rootCauseClaim, isFix } = classifyTitle(title)
    const row = byCategory.get(category) ?? { category, rootCauseClaims: 0, fixes: 0 }
    if (rootCauseClaim) row.rootCauseClaims += 1
    if (isFix) row.fixes += 1
    byCategory.set(category, row)
  }
  return [...byCategory.values()]
}

function categoryOfPath(target) {
  const p = String(target)
  if (p.startsWith('custom/qgate')) return 'qgate'
  if (p.startsWith('custom/server/harness') || p.startsWith('simharness') || p.startsWith('custom/server/simrun')) return 'harness'
  if (p.startsWith('custom/server')) return 'server'
  if (p.startsWith('custom/client')) return 'client'
  if (p.startsWith('docs')) return 'docs'
  if (p.startsWith('patches')) return 'patches'
  if (p.startsWith('scripts')) return 'scripts'
  return 'other'
}

export function aggregateGateDenies(rows) {
  const byCategory = new Map()
  for (const row of rows) {
    const category = categoryOfPath(row.target ?? '')
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1)
  }
  return byCategory
}

export function aggregateErrorHistory(rows) {
  const byCategory = new Map()
  for (const row of rows) {
    const category = CATEGORY_MAP[String(row.category ?? '').toLowerCase()] ?? 'other'
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(row.count ?? 1))
  }
  return byCategory
}

export function buildReport({ titles, gateDenies, errorHistory, since }) {
  const commits = aggregateCommits(titles)
  const denies = aggregateGateDenies(gateDenies)
  const errors = aggregateErrorHistory(errorHistory)
  const categories = new Set([...commits.map((c) => c.category), ...denies.keys(), ...errors.keys()])
  const rows = [...categories].map((category) => {
    const c = commits.find((x) => x.category === category) ?? { rootCauseClaims: 0, fixes: 0 }
    const gateDeniesCount = denies.get(category) ?? 0
    const errorHistoryCount = errors.get(category) ?? 0
    const score = c.rootCauseClaims * 3 + gateDeniesCount * 1 + errorHistoryCount * 2
    return {
      category,
      rootCauseClaims: c.rootCauseClaims,
      fixes: c.fixes,
      gateDenies: gateDeniesCount,
      errorHistoryCount,
      score,
      // 规则三：同一子系统 3 次以上「根治」才要求设计评审；不是每一条 fix 都升级。
      needsDesignReview: c.rootCauseClaims >= 3 || errorHistoryCount >= 3,
    }
  }).sort((a, b) => b.score - a.score || b.rootCauseClaims - a.rootCauseClaims)
  return {
    since,
    generatedAt: new Date().toISOString(),
    commits: titles.length,
    rows,
    failureClasses: aggregateFailureClasses(titles),
  }
}

export function renderTable(report) {
  const lines = [`复发账本（since=${report.since}，commits=${report.commits}）`]
  lines.push('category      根治/根因  fix   gate-deny  error-history  score  判定')
  for (const r of report.rows) {
    lines.push(
      `${r.category.padEnd(13)} ${String(r.rootCauseClaims).padEnd(8)} ${String(r.fixes).padEnd(5)} ${String(r.gateDenies).padEnd(10)} ${String(r.errorHistoryCount).padEnd(13)} ${String(r.score).padEnd(6)} ${r.needsDesignReview ? 'NEEDS-DESIGN-REVIEW' : 'ok'}`,
    )
  }
  if (report.failureClasses.length > 0) {
    lines.push('')
    lines.push('failureClass    次数  判定')
    for (const c of report.failureClasses) {
      lines.push(`${c.failureClass.padEnd(15)} ${String(c.count).padEnd(5)} ${c.needsDesignReview ? 'NEEDS-DESIGN-REVIEW' : 'ok'}`)
    }
  }
  return lines.join('\n')
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/recurrence-report.mjs [--since 90.days] [--json] [--no-append]\n')
    return 0
  }
  const sinceIdx = argv.indexOf('--since')
  const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : '90.days'
  const json = argv.includes('--json')
  const noAppend = argv.includes('--no-append')
  let titles = []
  try {
    titles = execFileSync('git', ['log', `--since=${since}`, '--pretty=%s'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)
  } catch (e) {
    err.write(`recurrence-report: git log failed: ${e.message}\n`)
    return 1
  }
  const report = buildReport({
    titles,
    gateDenies: readJsonl(GATE_DENY),
    errorHistory: readJsonl(ERROR_HISTORY),
    since,
  })
  if (json) out.write(JSON.stringify(report, null, 2) + '\n')
  else out.write(renderTable(report) + '\n')
  if (!noAppend && !json) {
    const ts = new Date().toISOString()
    for (const row of report.rows) {
      // count = 该子系统本轮「根治/根因」声明数；schema 要求 ts/category/count 三件。
      appendFileSync(join(ROOT, RECURRENCE_LEDGER), JSON.stringify({ ts, ...row, count: row.rootCauseClaims }) + '\n')
    }
  }
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
