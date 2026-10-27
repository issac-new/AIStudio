// scripts/verify-release-manifest.mjs — release:check 门禁（2026-10-26 四模块裁定）
//
// RELEASE-MANIFEST.json 声明四个独立发布模块（驾驶舱含推演/agent teams/Ycode/yuan skill），
// 版本真源在各 carrier 文件——本脚本逐条对账：版本串必须真实存在于 carrier、Ycode 活跃
// 补丁数与 series 一致、buildCommand 引用的脚本在位。任一失配非零退出（fail-fast 人话）。
//
// 测试钩子：AIStudio_TestCarrierOverride（JSON：{ carrierPath: 替换文件路径 }）供守门测试
// 注入篡改 fixture，不碰真文件。

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = resolve(ROOT, 'RELEASE-MANIFEST.json')

const override = (() => {
  const raw = process.env.AIStudio_TestCarrierOverride?.trim()
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
})()

function readCarrier(rel) {
  const abs = resolve(ROOT, rel)
  const path = override[rel] ?? abs
  if (!existsSync(path)) {
    throw new Error(`载体文件不存在：${rel}${override[rel] ? '（测试覆盖路径 ' + override[rel] + '）' : ''}`)
  }
  return readFileSync(path, 'utf8')
}

const problems = []
function fail(module, msg) { problems.push(`[${module}] ${msg}`) }

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
} catch (e) {
  console.error(`✗ release:check — RELEASE-MANIFEST.json 缺失或不可解析：${e.message}`)
  process.exit(1)
}

// ── 结构完备 ──
const REQUIRED_MODULES = ['cockpit', 'agent-teams', 'ycode', 'yuan-skill']
const REQUIRED_FIELDS = ['name', 'version', 'versionCarrier', 'buildCommand', 'artifacts', 'install']
for (const key of REQUIRED_MODULES) {
  const mod = manifest.modules?.[key]
  if (!mod) { fail(key, '模块条目缺失'); continue }
  for (const f of REQUIRED_FIELDS) {
    if (!mod[f] || String(mod[f]).trim() === '') fail(key, `字段缺失：${f}`)
  }
}
if (manifest.schema !== 1) fail('manifest', 'schema 必须=1')
if (manifest.product !== 'AIStudio') fail('manifest', 'product 必须=AIStudio')
if (!String(manifest.vendorBaseline ?? '').includes('vendor/VENDOR.md')) fail('manifest', 'vendorBaseline 须引用 vendor/VENDOR.md')

// ── 版本载体对账 ──
for (const key of REQUIRED_MODULES) {
  const mod = manifest.modules?.[key]
  if (!mod?.versionCarrier || !mod?.version) continue
  let carrierText
  try {
    carrierText = readCarrier(mod.versionCarrier)
  } catch (e) {
    fail(key, e.message)
    continue
  }
  if (mod.carrierFormat === 'json:version') {
    try {
      const parsed = JSON.parse(carrierText)
      if (parsed.version !== mod.version) {
        fail(key, `底座版本不符：清单=${mod.version} 载体 JSON version=${parsed.version}`)
      }
    } catch (e) {
      fail(key, `载体 ${mod.versionCarrier} 不可按 JSON 解析：${e.message}`)
    }
  } else if (!carrierText.includes(mod.version)) {
    fail(key, `版本串 "${mod.version}" 未见于载体 ${mod.versionCarrier}（漂移：改载体或同步清单）`)
  }
}

// ── Ycode：活跃补丁数对账（以基线代版本裁定） ──
{
  const mod = manifest.modules?.ycode
  if (mod) {
    const series = readCarrier('zcode-patches/series')
    const active = series.split('\n').filter(l => /^\d{3}-/.test(l.trim())).length
    const declared = Number(mod.carrierPattern ?? NaN)
    if (!Number.isInteger(declared) || declared !== active) {
      fail('ycode', `活跃补丁数不符：清单=${mod.carrierPattern} series 实际=${active}`)
    }
  }
}

// ── 驾驶舱：推演仅仓内裁定必须在 notes 声明（防静默改回随包） ──
{
  const notes = String(manifest.modules?.cockpit?.notes ?? '')
  if (!notes.includes('simharness') || !notes.includes('不随安装包')) {
    fail('cockpit', 'notes 须如实标注 simharness 不随安装包分发（用户裁定 2026-10-26）')
  }
}

// ── packageIncludes 路径实在 + packaging 节（2026-10-27 修订裁定） ──
for (const key of REQUIRED_MODULES) {
  const mod = manifest.modules?.[key]
  const includes = mod?.packageIncludes ?? []
  if (includes.length === 0) { fail(key, 'packageIncludes 不得为空'); continue }
  for (const inc of includes) {
    if (!existsSync(resolve(ROOT, inc))) fail(key, `packageIncludes 路径不存在：${inc}`)
  }
}
{
  const p = manifest.packaging
  if (!p || p.format !== 'tar.gz') fail('packaging', 'format 必须=tar.gz')
  if (p.outputDir !== 'dist/release/') fail('packaging', 'outputDir 须=dist/release/')
  if (!/pip/.test(String(p.depSourcePolicy ?? '')) || !/npm/.test(String(p.depSourcePolicy ?? ''))) {
    fail('packaging', 'depSourcePolicy 须声明 pip/npm 口径（依赖源码随包策略）')
  }
  if (p.fullPackage?.name !== 'aistudio-full' || !p.fullPackage?.version) fail('packaging', 'fullPackage（整体包）须有 name/version')
  if (!existsSync(resolve(ROOT, 'scripts/make-release-packages.mjs'))) fail('packaging', '打包脚本缺失：scripts/make-release-packages.mjs')
}

// ── buildCommand 脚本在位（不执行构建） ──
for (const key of REQUIRED_MODULES) {
  const cmd = String(manifest.modules?.[key]?.buildCommand ?? '')
  const m = /node (scripts\/[\w./-]+)/.exec(cmd)
  if (m && !existsSync(resolve(ROOT, m[1]))) fail(key, `buildCommand 引用脚本不存在：${m[1]}`)
  const sh = /([\w./-]*scripts\/[\w./-]+\.(?:sh|mjs))/.exec(cmd)
  if (sh && !existsSync(resolve(ROOT, sh[1]))) fail(key, `buildCommand 引用脚本不存在：${sh[1]}`)
}

if (problems.length > 0) {
  console.error(`✗ release:check — ${problems.length} 项失配：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const summary = REQUIRED_MODULES.map(k => `${k}=${manifest.modules[k].version}`).join(' ')
console.log(`✓ release:check — 四模块对账全绿（${summary}；vendorBaseline=vendor/VENDOR.md）`)
