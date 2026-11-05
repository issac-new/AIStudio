#!/usr/bin/env node
// spec-archive：delta 规格归档（2026-11-05 AI Native 吸收批 T7，Spec-Anchored L2）。
//
// 背景：spec 模板的 OpenSpec delta 段（### ADDED/MODIFIED/REMOVED Requirements）
// 只存在于模板（spec-template.md:125-137），无解析与合并实现——「规格库合并/归档」
// 是探查确认的缺口（A.1 与设计索引只做收录，不做内容沉淀）。
//
// 语义：
//  - 主规格库=docs/superpowers/specs/registry/<domain>.md（域=spec 显式「## 规格域」
//    行的值，缺省取文件名第三段）。registry/ 是子目录，A.1 与 design-index 都是根目录
//    直接文件 flat 扫描（gen-doc-indexes.mjs:106 readdirSync 非递归），天然不扰索引。
//  - 合并=按变更追加带溯源的 delta 条目（非破坏性日志式正本）；MODIFIED/REMOVED 校验
//    需求名在 registry 已存在（不存在=warn，fail-soft 不阻断——登记债而非猜数）。
//  - 默认不动源 spec（索引零扰动）；--move 走完整归档（源文件移 archive/＋A.1 删行
//    ＋两处计数递减＋gen-doc-indexes --write 联动）。
//  - --dry-run 只打印合并内容。
//
// 用法：node scripts/spec-archive.mjs <spec.md 路径> [--dry-run] [--move]
// 退出码：0=合并成功（或 dry-run）；1=无 delta/解析失败/--move 联动失败；2=用法错误。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 测试可注入假树（SPEC_ARCHIVE_ROOT）；缺省=脚本所在仓根
const ROOT = process.env.SPEC_ARCHIVE_ROOT?.trim() || fileURLToPath(new URL('..', import.meta.url))
const SPECS_DIR = join(ROOT, 'docs/superpowers/specs')
const REGISTRY_DIR = join(SPECS_DIR, 'registry')
const ARCHIVE_DIR = join(SPECS_DIR, 'archive')
const A1 = join(SPECS_DIR, '2026-10-21-swarmstudio-appendix-a-spec-index.md')

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const MOVE = argv.includes('--move')
const specRel = argv.find((a) => !a.startsWith('--'))
if (!specRel) { console.error('用法: node scripts/spec-archive.mjs <spec.md> [--dry-run] [--move]'); process.exit(2) }

const specPath = specRel.startsWith('/') ? specRel : join(ROOT, specRel)
if (!existsSync(specPath)) { console.error(`✗ spec 不存在：${specPath}`); process.exit(1) }
const specName = specPath.split('/').pop()
const text = readFileSync(specPath, 'utf8')

// ── delta 解析：三个 ### 头到下一个 ## / ### ADDED|MODIFIED|REMOVED 头之间 ──
const DELTA_HEADS = ['ADDED Requirements', 'MODIFIED Requirements', 'REMOVED Requirements']
function parseDelta(md) {
  const lines = md.split('\n')
  const out = { ADDED: [], MODIFIED: [], REMOVED: [] }
  let cur = null
  for (const line of lines) {
    const m = /^### (ADDED|MODIFIED|REMOVED) Requirements\s*$/.exec(line.trim())
    if (m) { cur = m[1]; continue }
    if (/^## /.test(line)) { cur = null; continue }
    if (cur) out[cur].push(line)
  }
  for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim()
  return out
}
const delta = parseDelta(text)
const hasDelta = DELTA_HEADS.some((h) => delta[h.replace(' Requirements', '')])
if (!hasDelta) { console.error(`✗ ${specName} 无 delta 段（### ADDED/MODIFIED/REMOVED Requirements）——无需归档`); process.exit(1) }

// ── 域解析：显式「## 规格域：<名>」＞文件名日期后首段（2026-11-05-<域>-<slug>.md）──
function domainOf(md, name) {
  const m = /^##\s*规格域[：:]\s*(.+)$/m.exec(md)
  if (m) return m[1].trim()
  const parts = name.replace(/\.md$/, '').split('-')
  // 日期吃掉前三段（年-月-日）；域=第 4 段。非日期命名回落 misc。
  const isDate = /^\d{4}$/.test(parts[0] ?? '') && /^\d{2}$/.test(parts[1] ?? '') && /^\d{2}$/.test(parts[2] ?? '')
  if (isDate && parts.length >= 4) return parts[3]
  if (!isDate && parts.length >= 1) return parts[0]
  return 'misc'
}
const domain = domainOf(text, specName)
const registryPath = join(REGISTRY_DIR, `${domain}.md`)

// ── 需求名提取（### Requirement: <名>）用于 MODIFIED/REMOVED 存在性校验 ──
function requirementNames(block) {
  return [...block.matchAll(/^### Requirement:\s*(.+)$/gm)].map((m) => m[1].trim())
}
const existing = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : ''
const existingReqs = new Set(requirementNames(existing))

const warnings = []
for (const kind of ['MODIFIED', 'REMOVED']) {
  for (const r of requirementNames(delta[kind])) {
    // registry 尚无该需求（含首归档空库）即告警——MODIFIED/REMOVED 的对象缺既有正本本身是债
    if (!existingReqs.has(r)) {
      warnings.push(`${kind} 的「${r}」不在 registry/${domain}.md 既有需求中（首归档或跨域——登记为债，不猜数）`)
    }
  }
}

// ── 合并条目（日志式追加，带溯源）──
const date = specName.slice(0, 10)
const entry = []
entry.push(`\n---\n\n## ${date} · ${specName}\n`)
if (delta.ADDED) entry.push(`### ADDED\n\n${delta.ADDED}\n`)
if (delta.MODIFIED) entry.push(`### MODIFIED\n\n${delta.MODIFIED}\n`)
if (delta.REMOVED) entry.push(`### REMOVED\n\n${delta.REMOVED}\n`)
if (warnings.length) entry.push(`> 归档告警：${warnings.join('；')}\n`)

if (DRY) {
  console.log(`[dry-run] 目标 registry/${domain}.md 追加内容：\n${entry.join('')}`)
  if (warnings.length) console.error(`⚠ ${warnings.join('\n⚠ ')}`)
  process.exit(0)
}

mkdirSync(REGISTRY_DIR, { recursive: true })
if (!existing) {
  writeFileSync(registryPath, `# 规格库·${domain}\n\n> 主规格库（2026-11-05 AI Native 吸收批 T7 立）：聚合本域已归档 spec 的\n> delta 需求（OpenSpec Spec-Anchored 语义）。registry/ 为子目录，不进 A.1 与\n> design-index 的根目录直接文件集合（两者均为 flat 扫描）。\n`)
}
writeFileSync(registryPath, readFileSync(registryPath, 'utf8') + entry.join(''))
console.log(`✓ 已合并 ${specName} → registry/${domain}.md（ADDED ${delta.ADDED ? requirementNames(delta.ADDED).length : 0}／MODIFIED ${delta.MODIFIED ? requirementNames(delta.MODIFIED).length : 0}／REMOVED ${delta.REMOVED ? requirementNames(delta.REMOVED).length : 0} 条需求）`)
if (warnings.length) console.error(`⚠ ${warnings.join('\n⚠ ')}`)

// ── 源 spec 盖章（默认不动文件；防重复归档由 stamp 判定）──
const STAMP = `> 已归档：${date} → registry/${domain}.md（spec-archive）`
if (!text.includes(STAMP)) {
  const stamped = text.replace(/^(# .+)$/m, `$1\n\n${STAMP}`)
  writeFileSync(specPath, stamped)
  console.log(`✓ 源 spec 已盖章（不移动，A.1/design-index 零扰动；完整归档用 --move）`)
}

// ── --move：完整归档（移 archive/ + A.1 删行 + 计数递减 + design-index 重写）──
if (MOVE) {
  mkdirSync(ARCHIVE_DIR, { recursive: true })
  renameSync(specPath, join(ARCHIVE_DIR, specName))
  const a1 = readFileSync(A1, 'utf8')
  const rowRe = new RegExp(`^\\| ${specName.replace(/\.md$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*$\\n?`, 'm')
  if (!rowRe.test(a1)) { console.error(`✗ --move：A.1 未找到 ${specName} 行——联动中止（文件已移动，须手工补 A.1）`); process.exit(1) }
  let next = a1.replace(rowRe, '')
  next = next.replace(/（(\d+) 份设计\/规格\/决策文档）/, (_, n) => `（${Number(n) - 1} 份设计/规格/决策文档）`)
  next = next.replace(/A\.1 收 (\d+) 份/, (_, n) => `A.1 收 ${Number(n) - 1} 份`)
  writeFileSync(A1, next)
  console.log(`✓ --move：源 spec 移入 archive/，A.1 删行且计数递减`)
  // design-index 机器段重写（存在即联动；失败=warn 不回滚）
  try {
    const { execFileSync } = await import('node:child_process')
    execFileSync('node', ['scripts/maintenance/gen-doc-indexes.mjs', '--write'], { cwd: ROOT, stdio: 'inherit' })
  } catch (e) {
    console.error(`⚠ design-index 联动失败（手工跑 gen-doc-indexes --write）：${e.message}`)
  }
}
process.exit(0)
