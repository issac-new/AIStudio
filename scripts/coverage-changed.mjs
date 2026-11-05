#!/usr/bin/env node
// 改动行覆盖率（v0.4 治理可信度修复）。
//
// 背景：全仓覆盖率容易用老代码摊薄，掩盖「新代码零测试」。本脚本只看本次 diff 新增/修改的行，
// 用 lcov 的 DA 记录判断这些行是否被执行过；低于阈值即失败。
//
// 用法：
//   node scripts/coverage-changed.mjs [--base origin/main] [--threshold 70]
//        [--lcov coverage/lcov.info] [--json]
// 退出码：0=达标或无改动行；1=低于阈值；2=lcov 缺失/参数错误。
// 纪律：只读 lcov 与 git diff；不改测试、不生成假覆盖率。

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

export function parseLcov(text) {
  const files = new Map()
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      const p = line.slice(3).trim()
      current = { path: p, lines: new Map() }
      files.set(p, current)
    } else if (line.startsWith('DA:') && current) {
      const [ln, hits] = line.slice(3).split(',')
      const n = Number(ln)
      if (Number.isFinite(n)) current.lines.set(n, Number.isFinite(Number(hits)) ? Number(hits) : 0)
    } else if (line === 'end_of_record') {
      current = null
    }
  }
  return files
}

export function parseDiff(text) {
  const changed = new Map()
  let file = null
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ b/')) { file = line.slice(6).trim(); continue }
    if (line.startsWith('+++ ')) { file = null; continue }
    if (!file) continue
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!m) continue
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    if (count === 0) continue
    if (!changed.has(file)) changed.set(file, new Set())
    for (let i = 0; i < count; i += 1) changed.get(file).add(start + i)
  }
  return changed
}

function findLcovEntry(lcov, file) {
  if (lcov.has(file)) return lcov.get(file)
  for (const entry of lcov.values()) {
    if (entry.path === file || entry.path.endsWith(`/${file}`) || relative(ROOT, entry.path) === file) return entry
  }
  return undefined
}

export function computeChangedCoverage(lcov, diff) {
  const rows = []
  for (const [file, lines] of diff) {
    const entry = findLcovEntry(lcov, file)
    if (!entry) {
      rows.push({ file, covered: 0, total: lines.size, coverage: 0, uncovered: [...lines].sort((a, b) => a - b), missingCoverageData: true })
      continue
    }
    let covered = 0
    const uncovered = []
    for (const ln of lines) {
      const hits = entry.lines.get(ln)
      if (hits !== undefined && hits > 0) covered += 1
      else uncovered.push(ln)
    }
    rows.push({
      file,
      covered,
      total: lines.size,
      coverage: lines.size === 0 ? 1 : covered / lines.size,
      uncovered: uncovered.sort((a, b) => a - b),
      missingCoverageData: false,
    })
  }
  const total = rows.reduce((s, r) => s + r.total, 0)
  const covered = rows.reduce((s, r) => s + r.covered, 0)
  return { rows, total, covered, coverage: total === 0 ? 1 : covered / total }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/coverage-changed.mjs [--base origin/main] [--threshold 70] [--lcov coverage/lcov.info] [--json]\n')
    return 0
  }
  const get = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const base = get('--base', 'origin/main')
  const threshold = Number(get('--threshold', '70'))
  const lcovPath = join(ROOT, get('--lcov', 'coverage/lcov.info'))
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    err.write('coverage-changed: --threshold must be 0..100\n')
    return 2
  }
  if (!existsSync(lcovPath)) {
    err.write(`coverage-changed: ${lcovPath} missing — run: npm run test:coverage\n`)
    return 2
  }
  let diffText = ''
  try {
    diffText = execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`, '--', 'custom/'], { cwd: ROOT, encoding: 'utf8' })
  } catch (e) {
    err.write(`coverage-changed: git diff failed: ${e.message}\n`)
    return 2
  }
  const report = computeChangedCoverage(parseLcov(readFileSync(lcovPath, 'utf8')), parseDiff(diffText))
  report.base = base
  report.threshold = threshold
  report.pass = report.total === 0 || report.coverage * 100 >= threshold
  if (argv.includes('--json')) {
    out.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    out.write(`changed-line coverage: ${report.covered}/${report.total} = ${(report.coverage * 100).toFixed(1)}% (threshold ${threshold}%, base ${base})\n`)
    for (const r of report.rows) {
      out.write(`  ${r.missingCoverageData ? 'NO-LCOV' : `${(r.coverage * 100).toFixed(0)}%`} ${r.file} (${r.covered}/${r.total})${r.uncovered.length ? ` uncovered: ${r.uncovered.slice(0, 20).join(',')}${r.uncovered.length > 20 ? '…' : ''}` : ''}\n`)
    }
  }
  return report.pass ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
