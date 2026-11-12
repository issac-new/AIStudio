#!/usr/bin/env node
// 设计文档机械索引检查（v0.4 治理可信度修复）。
//
// 背景：docs/manuals/aistudio-design-document-index.md 手工维护，曾出现 554/101/96
// 三套计数与 1 个重复条目；interactive-training-manual 只断言「每个 spec 被包含」，
// 不查幽灵/重复/计数。本脚本做集合等式与计数核对；--write 留下一批（重写机器段）。
//
// 2026-11-12 守卫测试迁 lint 首批（spec 2026-11-12-guard-tests-migration-plan）：
// 并入原 docs-ssot-guard.test.ts 的三组纯文本断言——README 唯一正本指针、
// 附录 A 冻结声明句、附录 A 标题计数与 A.1 行数互洽。这类「文档含某句/某计数」
// 断言属可生成物校验，失败信息直接给修复指引，不再占测试套件席位。
//
// 用法：
//   node scripts/maintenance/gen-doc-indexes.mjs [--check] [--json]
// 退出码：0=一致；1=有缺失/幽灵/重复/计数漂移/文档句断言失败；2=用法或文件缺失。

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const INDEX = 'docs/manuals/aistudio-design-document-index.md'
const SPECS_DIR = 'docs/superpowers/specs'
const README_FILE = 'README.md'
// 附录 A 自 2026-11-12 冻结为历史档案；这里只校验冻结声明与计数互洽（结构完整性
// 校验仍在 docs-ssot-guard.test.ts 的解析器测试里）。
const APPENDIX_FILE = 'docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md'

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

// ---------- 文档句/指针类检查（2026-11-12 自 docs-ssot-guard.test.ts 迁入） ----------

/** README 唯一正本指针：指向 docs/DESIGN.md，不得残留旧址指针 spec。 */
export function checkReadmePointer(readme) {
  const problems = []
  if (!readme.includes('docs/DESIGN.md')) {
    problems.push('README 缺唯一正本指针 docs/DESIGN.md（修复：README 设计文档入口恢复指向 docs/DESIGN.md）')
  }
  if (readme.includes('2026-10-23-swarmstudio-integrated-design.md')) {
    problems.push('README 仍指向旧址指针 2026-10-23-swarmstudio-integrated-design.md（修复：改指 docs/DESIGN.md）')
  }
  return problems
}

/** 附录 A 冻结声明：头部须声明「冻结」并指向机械索引正本。 */
export function checkAppendixFrozen(appendix) {
  const head = appendix.split('\n').slice(0, 6).join('\n')
  const problems = []
  if (!head.includes('冻结')) {
    problems.push('附录 A 头部缺「冻结」声明（修复：保留冻结说明——覆盖义务单一来源是机械索引，不是本表）')
  }
  if (!head.includes('aistudio-design-document-index')) {
    problems.push('附录 A 头部未指向机械索引 aistudio-design-document-index（修复：冻结声明中保留指向 docs/manuals/aistudio-design-document-index.md 的链接）')
  }
  return problems
}

/** 附录 A 标题计数与 A.1 数据行数互洽（冻结档案的计数一致性）。 */
export function checkAppendixCounts(appendix) {
  const declared = Number((/^# 附录 A：.*（(\d+) 份[^）]*）/.exec(appendix) ?? [])[1])
  const lines = appendix.split('\n')
  const a1 = lines.findIndex((l) => /^## A\.1\s/.test(l))
  if (a1 < 0 || !Number.isInteger(declared)) {
    return ['附录 A 标题计数或 A.1 段不可解析（修复：标题保持「（N 份…）」形态并保留「## A.1」段）']
  }
  let rows = 0
  for (let i = a1 + 1; i < lines.length; i += 1) {
    const t = lines[i].trim()
    if (/^#{2,3}\s/.test(t)) break // 角色表小节或其他二级/三级标题
    if (!t.startsWith('|')) continue
    if (t.startsWith('| 文件名')) continue // 表头
    if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(t)) continue // 分隔行
    rows += 1
  }
  return declared === rows
    ? []
    : [`附录 A 标题声明 ${declared} 份 != A.1 实际 ${rows} 行（修复：对齐标题「（N 份…）」计数或 A.1 表行——附录已冻结，只许核对修正）`]
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
  // 文档句/指针类检查（迁自 docs-ssot-guard.test.ts）：缺席按问题计（fail-fast 不猜）。
  const docChecks = [
    { id: 'README', file: README_FILE, check: checkReadmePointer },
    { id: '附录A冻结', file: APPENDIX_FILE, check: checkAppendixFrozen },
    { id: '附录A计数', file: APPENDIX_FILE, check: checkAppendixCounts },
  ]
  for (const { id, file, check } of docChecks) {
    const path = join(ROOT, file)
    if (!existsSync(path)) {
      report.problems.push(`${id}: ${file} 缺失（修复：恢复该文件——它是文档事实源的一部分）`)
      continue
    }
    for (const p of check(readFileSync(path, 'utf8'))) report.problems.push(`${id}: ${p}`)
  }
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
