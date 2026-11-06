// scripts/make-release-packages.mjs — 源码包打包（2026-11-03 起两包口径：默认只打整体包）
//
// 发布形态：默认 1 份整体包（--all-modules 显式打 4+1 全量），均含无法经 pip/npm 安装的第三方依赖源码
// （vendor/ 三树随所属模块入包）。逐条目=git archive HEAD -- <packageIncludes>：
// 只取 git 跟踪文件——node_modules/dist/runs 等产物天然不入包（.gitignore 立法生效），
// 与"仅凭源码＋pip＋npm 完成安装测试"的整体包口径一致。产物＋SHA256SUMS 落 dist/release/。
//
// 用法：npm run release:packages [-- --dry-run]（dry-run 只打印计划不写盘）

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DRY = process.argv.includes('--dry-run')

// 发布准出前置（P1 Task 9）：实际写包前跑 release:gate（真实执行链：qgate 构建→
// 全量测试门→评测门→启用门池→类型双门→build:full→严格证据报告），非零即停——
// 不再把未过准出的源码包落盘。dry-run 只打印计划，不执行准出（如实标注）。
if (DRY) {
  console.log('[release:packages] dry-run：仅打印打包计划，未执行 release:gate 准出')
} else {
  const gate = spawnSync(process.execPath, [resolve(ROOT, 'scripts/platform/release/release-gate.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (gate.status !== 0) {
    console.error(`[release:packages] release:gate 未通过（exit=${gate.status}）——不写包。`)
    process.exit(gate.status ?? 1)
  }
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'RELEASE-MANIFEST.json'), 'utf8'))
const outDir = resolve(ROOT, manifest.packaging.outputDir)
const fmt = manifest.packaging.format

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function human(bytes) {
  return bytes > 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
    : `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

if (!DRY) mkdirSync(outDir, { recursive: true })

// 两包口径（2026-11-03 用户立法，正本=RELEASE-MANIFEST.json packaging.artifactDistribution）：
// 默认只打整体包——四模块源码包不再上传任何远端，也不打包（省时省盘）；
// --all-modules 显式要求时才打 4+1 全量（将来重发模块包的逃生通道）。
const ALL_MODULES = process.argv.includes('--all-modules')
const plan = []
if (ALL_MODULES) {
  for (const [key, mod] of Object.entries(manifest.modules)) {
    const ver = mod.version.replace(/^v/, '')
    const name = `aistudio-${key}-${ver}-src.${fmt}`
    plan.push({ name, prefix: `aistudio-${key}-${ver}-src/`, pathspecs: mod.packageIncludes })
  }
} else {
  console.log('[release:packages] 两包口径：只打整体包（--all-modules 可打 4+1 全量）')
}
const fullVer = manifest.packaging.fullPackage.version
plan.push({
  name: `${manifest.packaging.fullPackage.name}-${fullVer}-src.${fmt}`,
  prefix: `${manifest.packaging.fullPackage.name}-${fullVer}-src/`,
  pathspecs: null, // null = 全仓
})

const commit = git(['rev-parse', '--short', 'HEAD'])
console.log(`[release:packages] 基线 HEAD=${commit}${DRY ? '（dry-run）' : ''}`)
const lines = []
for (const item of plan) {
  const out = resolve(outDir, item.name)
  const args = ['archive', `--format=${fmt}`, `--prefix=${item.prefix}`, `-o`, out, 'HEAD']
  if (item.pathspecs) args.push('--', ...item.pathspecs)
  if (DRY) {
    console.log(`  (dry) ${item.name}  ←  ${item.pathspecs ? item.pathspecs.join(' ') : '全仓'}`)
    continue
  }
  execFileSync('git', args, { cwd: ROOT })
  // R147（2026-11-03）：git archive 对 >100 字节路径（中文知识库文件名）产出 PAX 扩展头
  // （<sha>.paxheader 条目）——标准 tar 透明处理，但 7-Zip 等 Windows 工具把它们显示为
  // 实体文件（run25 复盘实测：yuan-skill 60 条/full 119 条）。修复=解包后以 GNU 格式重打
  // （@LongLink 长名机制，所有主流工具含 7-Zip 均透明处理）。
  // macOS bsdtar 无 --format=gnu，用 Python tarfile 重打（GNU_FORMAT 原生支持、可移植）
  execFileSync('python3', ['-I', '-c', `
import tarfile, sys
src_path, = sys.argv[1:]
with tarfile.open(src_path, 'r:gz') as src, tarfile.open(src_path + '.gnu', 'w:gz', format=tarfile.GNU_FORMAT) as dst:
    for m in src:
        dst.addfile(m, src.extractfile(m) if m.isfile() else None)
import os; os.replace(src_path + '.gnu', src_path)
`, out], { stdio: 'pipe' })
  const size = human(statSync(out).size)
  const sum = sha256(out)
  lines.push(`${sum}  ${item.name}`)
  console.log(`  ✓ ${item.name}（${size}）`)
}
if (!DRY) {
  const sumsPath = resolve(outDir, 'SHA256SUMS')
  writeFileSync(sumsPath, `${lines.join('\n')}\n`, 'utf8')
  console.log(`  ✓ SHA256SUMS（${lines.length} 条）→ ${manifest.packaging.outputDir}`)
}
console.log(`[release:packages] 完成：${plan.length} 个源码包${DRY ? '（dry-run 未写盘）' : ''}`)
