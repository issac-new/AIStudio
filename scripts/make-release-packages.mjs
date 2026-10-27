// scripts/make-release-packages.mjs — 4+1 源码包打包（2026-10-27 用户修订裁定）
//
// 发布形态：4 个独立模块源码包＋1 份整体包，均含无法经 pip/npm 安装的第三方依赖源码
// （vendor/ 三树随所属模块入包）。逐条目=git archive HEAD -- <packageIncludes>：
// 只取 git 跟踪文件——node_modules/dist/runs 等产物天然不入包（.gitignore 立法生效），
// 与"仅凭源码＋pip＋npm 完成安装测试"的整体包口径一致。产物＋SHA256SUMS 落 dist/release/。
//
// 用法：npm run release:packages [-- --dry-run]（dry-run 只打印计划不写盘）

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DRY = process.argv.includes('--dry-run')

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

const plan = []
for (const [key, mod] of Object.entries(manifest.modules)) {
  const ver = mod.version.replace(/^v/, '')
  const name = `aistudio-${key}-${ver}-src.${fmt}`
  plan.push({ name, prefix: `aistudio-${key}-${ver}-src/`, pathspecs: mod.packageIncludes })
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
