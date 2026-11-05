#!/usr/bin/env node
// 设计文档机械索引检查（v0.4 治理可信度修复）。
//
// 背景：docs/manuals/aistudio-design-document-index.md 手工维护，曾出现 554/101/96
// 三套计数与 1 个重复条目；interactive-training-manual 只断言「每个 spec 被包含」，
// 不查幽灵/重复/计数。本脚本做集合等式与计数核对；--write 留下一批（重写机器段）。
//
// 用法：
//   node scripts/maintenance/gen-doc-indexes.mjs [--check] [--json]
// 退出码：0=一致；1=有缺失/幽灵/重复/计数漂移；2=用法或文件缺失。

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const INDEX = 'docs/manuals/aistudio-design-document-index.md'
const SPECS_DIR = 'docs/superpowers/specs'

export function machineRegion(text) {
  const start = text.indexOf('## 2026-')
  if (start < 0) return text
  const end = text.indexOf('## archive', start)
  return text.slice(start, end >= 0 ? end : undefined)
}

export function parseListLinks(text) {
  const links = []
  for (const line of text.split('\n')) {
    const m = /^\s*-\s*\[[^\]]+\]\(([^)]+)\)/.exec(line)
    if (m) links.push(m[1])
  }
  return links
}

export function compareIndex({ links, specs, text }) {
  const rootLinks = links
    .filter((l) => l.startsWith('../superpowers/specs/') && !l.includes('/archive/'))
    .map((l) => l.replace('../superpowers/specs/', ''))
  const actual = new Set(specs)
  const linked = new Set(rootLinks)
  const missing = [...actual].filter((f) => !linked.has(f))
  const ghosts = [...linked].filter((f) => !actual.has(f))
  const duplicates = [...new Set(rootLinks.filter((t, i) => rootLinks.indexOf(t) !== i))]
  const nov = specs.filter((f) => f.startsWith('2026-11-')).length
  const declaredRoot = Number((/根目录：\*\*(\d+) 份/.exec(text) ?? [])[1])
  const declaredTotal = Number((/合计 (\d+) 份/.exec(text) ?? [])[1])
  const declaredNov = Number((/## 2026-11（(\d+) 份）/.exec(text) ?? [])[1])
  const problems = []
  if (missing.length) problems.push(`missing ${missing.length}: ${missing.slice(0, 5).join(', ')}`)
  if (ghosts.length) problems.push(`ghosts ${ghosts.length}: ${ghosts.slice(0, 5).join(', ')}`)
  if (duplicates.length) problems.push(`duplicates ${duplicates.length}: ${duplicates.slice(0, 5).join(', ')}`)
  if (declaredRoot !== specs.length) problems.push(`declared root ${declaredRoot} != actual ${specs.length}`)
  if (declaredTotal !== specs.length) problems.push(`declared total ${declaredTotal} != actual ${specs.length}`)
  if (declaredNov !== nov) problems.push(`declared 2026-11 ${declaredNov} != actual ${nov}`)
  return { problems, missing, ghosts, duplicates, actual: specs.length, linked: linked.size, nov, declared: { root: declaredRoot, total: declaredTotal, nov: declaredNov } }
}

export function groupSpecs(specs) {
  const groups = new Map()
  for (const f of [...specs].sort()) {
    const key = f.slice(0, 7)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  return groups
}

export function renderMachineRegion(specs) {
  const out = []
  for (const [month, files] of groupSpecs(specs)) {
    out.push(`## ${month}（${files.length} 份）`, '')
    for (const f of files) out.push(`- [${f}](../superpowers/specs/${f})`)
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}

export function updateHeaderCounts(text, specs) {
  const groups = groupSpecs(specs)
  let out = text.replace(/\*\*\d+ 份 Markdown\*\*/, `**${specs.length} 份 Markdown**`)
  const counts = [...groups.entries()].map(([m, f]) => `${m} 为 ${f.length} 份`).join('；')
  out = out.replace(/- 根目录分组计数：.*?。/, `- 根目录分组计数：${counts}；合计 ${specs.length} 份。`)
  return out
}

export function writeIndex(text, specs) {
  const start = text.indexOf('## 2026-')
  if (start < 0) throw new Error('month section not found')
  const end = text.indexOf('## archive', start)
  const replacement = renderMachineRegion(specs) + '\n'
  const next = text.slice(0, start) + replacement + (end >= 0 ? text.slice(end) : '')
  return updateHeaderCounts(next, specs)
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/maintenance/gen-doc-indexes.mjs [--check] [--write] [--json]\n')
    return 0
  }
  const indexFile = join(ROOT, INDEX)
  if (!existsSync(indexFile)) {
    err.write(`gen-doc-indexes: ${INDEX} missing\n`)
    return 2
  }
  const specs = readdirSync(join(ROOT, SPECS_DIR)).filter((f) => f.endsWith('.md')).sort()
  if (argv.includes('--write')) {
    const before = readFileSync(indexFile, 'utf8')
    writeFileSync(indexFile, writeIndex(before, specs))
    out.write(`gen-doc-indexes: wrote ${INDEX} (${specs.length} specs)\n`)
  }
  const text = readFileSync(indexFile, 'utf8')
  const report = compareIndex({ links: parseListLinks(machineRegion(text)), specs, text })
  if (argv.includes('--json')) out.write(JSON.stringify(report, null, 2) + '\n')
  else {
    out.write(`design-index: actual=${report.actual} linked=${report.linked} nov=${report.nov} declared=${JSON.stringify(report.declared)}\n`)
    for (const p of report.problems) out.write(`FAIL ${p}\n`)
    out.write(`gen-doc-indexes: ${report.problems.length} problem(s)\n`)
  }
  return report.problems.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
