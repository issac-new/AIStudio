#!/usr/bin/env node
// make-incremental-package.mjs — 增量补丁包打包器（2026-11-05 v1.0.12 发布轮首件）
//
// 产物：dist/release/aistudio-incremental-<base>-to-<ver>-overlay.patch.gz
//   —— git binary patch（gzip 压缩），覆盖 base..HEAD 全部跟踪变更（新增/修改/删除/改名/二进制）。
//   应用方式（目标机解开源码包后在包根执行）：
//     gunzip -c aistudio-incremental-<base>-to-<ver>-overlay.patch.gz | git apply --binary --check -   # 先验
//     gunzip -c aistudio-incremental-<base>-to-<ver>-overlay.patch.gz | git apply --binary -           # 实施应用
//   git apply 在非 git 仓目录同样可用（对工作树文件打补丁）；--check 干跑自验零副作用。
//
// 设计依据：spec docs/superpowers/specs/2026-11-05-release-v1.0.12-overlay.md D3——
//   补丁形态选 git binary patch 而非 overlay tar：单一文件、原生覆盖删除/改名/二进制、
//   `git apply --check` 提供机械自验，不需额外 apply 脚本。
//
// 用法：node scripts/make-incremental-package.mjs <base-ref> [--head <ref>] [--dry-run] [--out <dir>]
//   base-ref 必填（如 v1.0.10-overlay）；--head 缺省 HEAD；--dry-run 只出统计不写盘。
// 退出码：0=成功；1=参数/引用错误；2=diff 为空（无可打包变更，如实失败不产空包）。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 })
}

/** 解析 `git diff --name-status -z` 输出为条目数组。
 *  形态：NUL 分隔；普通状态= [status, path]；改名/拷贝= [R100/Cxx, old, new]。 */
export function parseNameStatus(buf) {
  const parts = String(buf).split('\0').filter((s) => s !== '')
  const out = []
  for (let i = 0; i < parts.length; ) {
    const status = parts[i]
    if (/^[RC]\d*$/.test(status)) {
      out.push({ status, oldPath: parts[i + 1], newPath: parts[i + 2] })
      i += 3
    } else {
      out.push({ status, newPath: parts[i + 1] })
      i += 2
    }
  }
  return out
}

/** 由条目聚合统计（added/modified/deleted/renamed 四桶；R 视作 renamed+deleted 旧路径）。 */
export function summarize(entries) {
  const s = { added: 0, modified: 0, deleted: 0, renamed: 0 }
  for (const e of entries) {
    if (/^A/.test(e.status)) s.added++
    else if (/^M/.test(e.status)) s.modified++
    else if (/^D/.test(e.status)) s.deleted++
    else if (/^R/.test(e.status)) s.renamed++
    else s.modified++ // T（类型变更）等罕见态并入 modified，不静默丢
  }
  return s
}

/** 版本串清洗：tag 形如 v1.0.12-overlay → 1.0.12-overlay（资产名不带 v 前缀，与 full 包口径一致）。 */
export function cleanVersion(ref) {
  return String(ref).replace(/^v/, '')
}

function usage() {
  console.error('用法: node scripts/make-incremental-package.mjs <base-ref> [--head <ref>] [--dry-run] [--out <dir>]')
}

export function planFromArgv(argv) {
  const positional = []
  const opt = { head: 'HEAD', dryRun: false, out: 'dist/release/' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--head') opt.head = argv[++i]
    else if (a === '--dry-run') opt.dryRun = true
    else if (a === '--out') opt.out = argv[++i]
    else if (a === '-h' || a === '--help') return null
    else positional.push(a)
  }
  if (positional.length !== 1) return null
  opt.base = positional[0]
  return opt
}

function main() {
  const opt = planFromArgv(process.argv.slice(2))
  if (!opt) { usage(); process.exit(1) }

  // 引用存在性先验（人话报错，不产半截包）
  for (const ref of [opt.base, opt.head]) {
    try { git(['rev-parse', '--verify', `${ref}^{commit}`]) } catch {
      console.error(`✗ 引用不存在或不可解析: ${ref}`); process.exit(1)
    }
  }

  const entries = parseNameStatus(git(['diff', '--name-status', '-z', `${opt.base}..${opt.head}`]))
  const sum = summarize(entries)
  const total = entries.length
  const baseCommit = execFileSync('git', ['rev-parse', '--short', opt.base], { cwd: ROOT, encoding: 'utf8' }).trim()
  const headCommit = execFileSync('git', ['rev-parse', '--short', opt.head], { cwd: ROOT, encoding: 'utf8' }).trim()
  const baseV = cleanVersion(opt.base)
  const headV = cleanVersion(opt.head)
  // 资产名去各段 '-overlay' 尾缀后在末尾统一补一次（v1.0.10-overlay→1.0.10，避免双 overlay）
  const shortV = (v) => v.replace(/-overlay$/, '')
  const name = `aistudio-incremental-${shortV(baseV)}-to-${shortV(headV)}-overlay.patch.gz`

  console.log(`[incremental] ${opt.base}(${baseCommit}) → ${opt.head}(${headCommit})`)
  console.log(`[incremental] 变更 ${total} 项：+${sum.added} 新增 / ~${sum.modified} 修改 / -${sum.deleted} 删除 / ${sum.renamed} 改名`)
  if (total === 0) { console.error('✗ diff 为空——无可打包变更，不产空包'); process.exit(2) }
  if (opt.dryRun) { console.log(`[incremental] (dry) 将产出 ${opt.out}${name}`); return }

  // git diff --binary --full-index 产 git 原生二进制补丁（新增/删除/改名/二进制全形态）
  const patch = git(['diff', '--binary', '--full-index', `${opt.base}..${opt.head}`])
  const outDir = resolve(ROOT, opt.out)
  mkdirSync(outDir, { recursive: true })
  // gzip（mtime=0 保字节可重现；电文压缩）——用 git 内置可重现压缩：gzip -n 语义经 python gzip mtime=0
  const gz = execFileSync('python3', ['-I', '-c',
    'import gzip,sys,mtime; data=sys.stdin.buffer.read(); sys.stdout.buffer.write(gzip.compress(data, 9, mtime=0))',
  ], { input: patch, maxBuffer: 512 * 1024 * 1024 })
  const out = resolve(outDir, name)
  writeFileSync(out, gz)

  const sha = createHash('sha256').update(gz).digest('hex')
  const mb = (statSync(out).size / 1024 / 1024).toFixed(1)
  console.log(`[incremental] ✓ ${out} (${mb}MB)`)
  console.log(`[incremental] sha256=${sha}`)
  // 应用说明回显（发布时贴入 Release 说明）
  console.log(`[incremental] 应用：gunzip -c ${name} | git apply --binary --check -   然后去 --check 实施应用`)
}

const isMain = process.argv[1] && (process.argv[1].endsWith('make-incremental-package.mjs') || resolve(process.argv[1]) === import.meta.filename)
if (isMain) main()
