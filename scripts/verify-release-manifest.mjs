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
  if (key === 'agent-teams' && mod.versionCarrier === 'team/VERSION') {
    // 新真源：VERSION 文件首个非注释行；大版本须与 VENDOR.md hermes-agent 线对齐
    const first = carrierText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0] ?? ''
    if (first !== mod.version) {
      fail(key, `VERSION 文件首行 "${first}" ≠ 清单 ${mod.version}`)
    }
    // K4（2026-10-28）：机器载体 team/version.json 必须与 VERSION 首行、清单、VENDOR.md 一致
    if (mod.machineCarrier) {
      try {
        const j = JSON.parse(readCarrier(mod.machineCarrier))
        if (j.version !== mod.version) fail(key, `机器载体 ${mod.machineCarrier} version=${j.version} ≠ 清单 ${mod.version}`)
        let baseV = ''
        try {
          const vt = readCarrier('vendor/VENDOR.md')
          baseV = new RegExp('hermes-agent \\| `[^`]+` \\| v?(\\d+\\.\\d+\\.\\d+)').exec(vt)?.[1] ?? ''
        } catch { /* VENDOR.md 缺失由后面的基线块单独报 */ }
        if (baseV && String(j.base) !== baseV) fail(key, `机器载体 base=${j.base} ≠ VENDOR.md hermes-agent ${baseV}`)
        if (`${j.base}-${j.extension}.${j.extN}` !== mod.version.replace(/^v/, '')) {
          fail(key, `机器载体三段(${j.base}-${j.extension}.${j.extN}) 与清单版本 ${mod.version} 不一致`)
        }
      } catch (e) {
        fail(key, `机器载体 ${mod.machineCarrier} 不可解析：${e.message}`)
      }
    }
  } else if (key === 'cockpit' && mod.versionCarrier === 'RELEASE-NOTES.md') {
    // 严格口径（2026-10-28 对账）：取「## 版本」节首个非空行比对，不用全文 includes——
    // 全文判断在「新条目已加、清单忘改」时仍绿（旧版本串仍在正文里）。
    const sec = carrierText.split(/^##\s*版本\s*$/m)[1] ?? ''
    const first = sec.split('\n').map(l => l.trim()).find(Boolean) ?? ''
    if (!first.includes(mod.version)) {
      fail(key, `「## 版本」节首行未声明 ${mod.version}（首行="${first.slice(0, 80)}"）`)
    }
  } else if (key === 'yuan-skill' && mod.versionCarrier.endsWith('CHANGELOG.md')) {
    // 严格口径：CHANGELOG 首个版本标题必须等于清单版本（`## [vX.Y.Z]`）
    const first = /^##\s*\[(v[0-9]+\.[0-9]+\.[0-9]+)\]/m.exec(carrierText)?.[1] ?? ''
    if (first !== mod.version) {
      fail(key, `CHANGELOG 首个版本标题 "${first}" ≠ 清单 ${mod.version}`)
    }
  } else if (mod.carrierFormat === 'json:version') {
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

// ── 模块大版本与底座对齐（2026-10-27 用户裁定：major.minor=底座线，patch=扩展序） ──
{
  let vendorText
  try { vendorText = readCarrier('vendor/VENDOR.md') } catch { vendorText = '' }
  const line = (label) => new RegExp(label + ' \\| `[^`]+` \\| v?(\\d+\\.\\d+\\.\\d+)').exec(vendorText)?.[2]
  const studioLine = line('hermes-studio')
  const agentLine = line('hermes-agent')
  // 完整三位底座版本对齐（2026-10-27 用户纠正）：版本=底座段＋"-<ext>.N" 扩展段
  const splitBase = (v, ext) => {
    const m = /^(v?\d+\.\d+\.\d+)-(.+)\.(\d+)$/.exec(String(v))
    if (!m) return null
    return { base: m[1].replace(/^v/, ''), extName: m[2], extN: m[3] }
  }
  const cockpitV = splitBase(manifest.modules?.cockpit?.version ?? '', 'studio')
  const teamsV = splitBase(manifest.modules?.['agent-teams']?.version ?? '', 'team')
  if (studioLine && (!cockpitV || cockpitV.base !== studioLine || cockpitV.extName !== 'studio' || !/^[1-9]\d*$/.test(cockpitV.extN))) {
    fail('cockpit', `版本须=底座 ${studioLine}-studio.N（完整三位对齐＋扩展序），清单=${manifest.modules.cockpit.version}`)
  }
  if (agentLine && (!teamsV || teamsV.base !== agentLine || teamsV.extName !== 'team' || !/^[1-9]\d*$/.test(teamsV.extN))) {
    fail('agent-teams', `版本须=底座 ${agentLine}-team.N（完整三位对齐＋扩展序），清单=${manifest.modules['agent-teams'].version}`)
  }
}

// ── Ycode：活跃补丁数对账（以基线代版本裁定） ──
{
  const mod = manifest.modules?.ycode
  if (mod) {
    const series = readCarrier('zcode-patches/series')
    const active = series.split('\n').filter(l => /^\d{3}-/.test(l.trim())).length
    const declared = Number(mod.activePatchCount ?? NaN)
    if (!Number.isInteger(declared) || declared !== active) {
      fail('ycode', `活跃补丁数不符：清单=${mod.activePatchCount} series 实际=${active}`)
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
  // includes 是「模块覆盖面」声明：必须是纯路径且真实存在（注释/中文说明应进 notes）
  for (const inc of mod?.includes ?? []) {
    if (/[（）()\u4e00-\u9fa5]/.test(String(inc))) fail(key, `includes 含非路径内容：${inc}`)
    else if (!existsSync(resolve(ROOT, inc))) fail(key, `includes 路径不存在：${inc}`)
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

// ── buildCommand 脚本在位（不执行构建）＋ npm script 名存在 ──
let pkgScripts = {}
try { pkgScripts = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts ?? {} } catch { pkgScripts = {} }
for (const key of REQUIRED_MODULES) {
  const cmd = String(manifest.modules?.[key]?.buildCommand ?? '')
  const m = /node (scripts\/[\w./-]+)/.exec(cmd)
  if (m && !existsSync(resolve(ROOT, m[1]))) fail(key, `buildCommand 引用脚本不存在：${m[1]}`)
  const sh = /([\w./-]*scripts\/[\w./-]+\.(?:sh|mjs))/.exec(cmd)
  if (sh && !existsSync(resolve(ROOT, sh[1]))) fail(key, `buildCommand 引用脚本不存在：${sh[1]}`)
  // npm run <name> 必须在 package.json 里有定义（删脚本或拼错名当场红）
  for (const mm of cmd.matchAll(/npm run ([\w:.-]+)/g)) {
    if (!Object.prototype.hasOwnProperty.call(pkgScripts, mm[1])) {
      fail(key, `buildCommand 引用的 npm script 不存在于 package.json：npm run ${mm[1]}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`✗ release:check — ${problems.length} 项失配：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const summary = REQUIRED_MODULES.map(k => `${k}=${manifest.modules[k].version}`).join(' ')
console.log(`✓ release:check — 四模块对账全绿（${summary}；vendorBaseline=vendor/VENDOR.md）`)
