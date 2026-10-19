#!/usr/bin/env node
// sync-diagram-skill.mjs — diagram-design 技能同步到主机全局库 + SwarmStudio 品牌化妆。
//
// 三步（幂等，漂移才重写，原子 rename）：
//   1. overlay assets/skills/diagram-design/ → <hostRoot>/skills/diagram-design/
//      （vendored 正本原味复制；hostRoot=HERMES_PROFILES_ROOT/.. 或 ~/.hermes，与
//      custom/server/skillprovision/reconcile.ts defaultHostRoot 同一解析）
//   2. 品牌 copy-over load：swarmstudio.profile.md 覆盖主机副本 references/style-guide.md
//      （references/profiles.md 规定的 copy-over 语义；vendored 正本不动）
//   3. 安装 ~/.diagram-design/profiles/swarmstudio.md（profiles 库，供 reset/恢复）
//
// 稳态口径：主机副本的 style-guide.md 恒等于品牌文件（步骤 2 的结果），
// 因此"技能正本已最新"=目标哈希等于"正本哈希"或"正本替换 style-guide 为品牌后的哈希"。
//
// 用法：node scripts/sync-diagram-skill.mjs [--dry-run] [--host-root <dir>]
// 退出码：0 成功（含 dry-run）；1 源缺失/写入失败/复核未达期望态。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_SRC = join(overlayRoot, 'assets', 'skills', 'diagram-design')
const STYLE_REL = join('references', 'style-guide.md')
const BRAND_SRC = join(overlayRoot, 'assets', 'skills', 'diagram-design-brand', 'swarmstudio.profile.md')
const HASH_SKIP = new Set(['.DS_Store', 'Thumbs.db'])

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const hostRootIdx = args.indexOf('--host-root')
const hostRoot = hostRootIdx >= 0
  ? resolve(args[hostRootIdx + 1])
  : process.env.HERMES_PROFILES_ROOT?.trim()
    ? resolve(process.env.HERMES_PROFILES_ROOT.trim().replace(/^~/, homedir()), '..')
    : join(homedir(), '.hermes')
const skillTarget = join(hostRoot, 'skills', 'diagram-design')
const profilesDir = join(homedir(), '.diagram-design', 'profiles')
const profileTarget = join(profilesDir, 'swarmstudio.md')
const styleGuideTarget = join(skillTarget, STYLE_REL)

function walkFiles(dir, acc, depth) {
  if (depth > 8) return
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') || HASH_SKIP.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walkFiles(full, acc, depth + 1)
    else if (e.isFile()) acc.push(full)
  }
}

/** 目录内容哈希；brandBody 非空时把 style-guide.md 按品牌化口径计入。 */
function hashDir(dir, brandBody) {
  const files = []
  walkFiles(dir, files, 0)
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(file.slice(dir.length).split(sep).join('/'))
    hash.update('\0')
    let content
    try {
      content = brandBody && file.endsWith(STYLE_REL) ? brandBody : readFileSync(file)
    } catch {
      content = `ERR:${file}`
    }
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function readOrNull(path) {
  try { return readFileSync(path) } catch { return null }
}

if (!existsSync(join(SKILL_SRC, 'SKILL.md'))) {
  console.error(`源技能缺失：${SKILL_SRC}`)
  process.exit(1)
}
const brandBody = readOrNull(BRAND_SRC)
if (!brandBody) {
  console.error(`品牌 profile 缺失：${BRAND_SRC}`)
  process.exit(1)
}

const actions = []

// 1. 技能正本（品牌化口径参与对账）
const pristineHash = hashDir(SKILL_SRC, null)
const brandedHash = hashDir(SKILL_SRC, brandBody)
const targetHash = existsSync(skillTarget) ? hashDir(skillTarget, null) : null
const needSkillSync = !targetHash || (targetHash !== pristineHash && targetHash !== brandedHash)
actions.push(needSkillSync
  ? { verb: targetHash ? 'update' : 'install', run: syncSkill, detail: `技能正本 → ${skillTarget}${targetHash ? '（内容漂移，重写）' : ''}` }
  : { verb: 'skip', run: null, detail: `技能正本已是最新：${skillTarget}` })

// 2. 品牌 style-guide copy-over（步骤 1 执行后目标必在位）
const styleNow = readOrNull(styleGuideTarget)
const needBrand = needSkillSync || !styleNow || !styleNow.equals(brandBody)
actions.push(needBrand
  ? { verb: 'brand', run: applyBrand, detail: `品牌 style-guide copy-over → ${styleGuideTarget}` }
  : { verb: 'skip', run: null, detail: '品牌 style-guide 已激活' })

// 3. profiles 库
const profNow = readOrNull(profileTarget)
actions.push(!profNow || !profNow.equals(brandBody)
  ? { verb: profNow ? 'update' : 'install', run: installProfile, detail: `profiles 库 → ${profileTarget}` }
  : { verb: 'skip', run: null, detail: `profiles 库已是最新：${profileTarget}` })

for (const a of actions) console.log(`${dryRun ? '[dry-run] ' : ''}${a.verb}: ${a.detail}`)
if (dryRun) process.exit(0)

function syncSkill() {
  mkdirSync(dirname(skillTarget), { recursive: true })
  const tmp = `${skillTarget}.tmp-${process.pid}-${Date.now()}`
  try {
    cpSync(SKILL_SRC, tmp, { recursive: true })
    if (existsSync(skillTarget)) rmSync(skillTarget, { recursive: true, force: true })
    renameSync(tmp, skillTarget)
  } catch (e) {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    throw e
  }
}

function applyBrand() {
  writeFileSync(styleGuideTarget, brandBody, 'utf8')
}

function installProfile() {
  mkdirSync(profilesDir, { recursive: true })
  const tmp = `${profileTarget}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, brandBody, 'utf8')
  renameSync(tmp, profileTarget)
}

let failed = false
for (const a of actions) {
  if (!a.run) continue
  try { a.run() } catch (e) {
    console.error(`执行失败（${a.verb}）：${e.message}`)
    failed = true
    break
  }
}

if (!failed) {
  // 复核：三处目标全部达到期望态才报成功（声称完成必须闭环实证）
  const okSkill = existsSync(join(skillTarget, 'SKILL.md'))
  const okBrand = (readOrNull(styleGuideTarget) || Buffer.alloc(0)).equals(brandBody)
  const okProf = (readOrNull(profileTarget) || Buffer.alloc(0)).equals(brandBody)
  console.log(`复核：skill=${okSkill ? 'OK' : 'FAIL'} brand=${okBrand ? 'OK' : 'FAIL'} profile=${okProf ? 'OK' : 'FAIL'}`)
  if (!okSkill || !okBrand || !okProf) failed = true
}
process.exit(failed ? 1 : 0)
