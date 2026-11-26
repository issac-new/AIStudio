// governance-rsi-walkthrough 探针的纯函数层（2026-11-26 可信 RSI 后续批）。
// 全部无 IO、无 playwright 依赖，单测在 governance-rsi-walkthrough.test.ts；
// 主探针 governance-rsi-walkthrough.mjs 只做编排（起浏览器、调接口、截图）。
// 注意：本文件是 .mjs（纯 JavaScript），类型一律写 JSDoc——写成 TS 语法 vite 不转译。

/**
 * 一条走查判定。字段：{ name: string, ok: boolean, note?: string, skip?: boolean }
 * skip=环境条件项（如隔离空库无会话），不计入失败，但要在台账里如实出现。
 */

/**
 * 走查台账汇总。返回 { passed, failed, skipped, exitCode }；
 * 非零项（且非 skip）任一存在即退出 1，空台账也按失败计。
 * @param {string} surface 面名（台账标识）
 * @param {Array<{name: string, ok: boolean, note?: string, skip?: boolean}>} checks 判定列表
 */
export function summarize(surface, checks) {
  const failed = checks.filter((c) => !c.ok && !c.skip).length
  const skipped = checks.filter((c) => c.skip).length
  const passed = checks.length - failed - skipped
  return { passed, failed, skipped, exitCode: checks.length > 0 && failed === 0 ? 0 : 1 }
}

/**
 * WCAG 对比度（相对亮度法）。用于「格态文字与底色可读」的判定：走查在亮暗两套主题下
 * 读格态文字色与所在面板底色，对比度须 ≥ 4.5（正文可读下限）。
 * 输入是 getComputedStyle 返回的 rgb()/rgba() 字符串；无法解析返回 null（调用方按失败计）。
 * @param {string} fg 前景色
 * @param {string} bg 背景色
 * @returns {number|null}
 */
export function contrastRatio(fg, bg) {
  const a = parseRgb(fg)
  const b = parseRgb(bg)
  if (!a || !b) return null
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function parseRgb(text) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(text.trim())
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
}

function channel8(v) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(c) {
  // 不透明度按简单混合到白底近似（走查里底色都不透明；透明前景只出现在覆盖层，不参与判定）。
  const blended = { r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a) }
  return 0.2126 * channel8(blended.r) + 0.7152 * channel8(blended.g) + 0.0722 * channel8(blended.b)
}

// ---------------------------------------------------------------------------
// 种入数据的自洽性：写盘前先在进程内校验，摘要与内容、快照与磁盘内容一一对应。
// 种错数据会让走查「全绿」变成假象——数据本身就是断言对象的一部分。
// 摘要口径与 custom/server/harness/workbench/loop-core.ts 的 sha256/treeDigest 同源。
// ---------------------------------------------------------------------------

/**
 * 单文件种子的自洽性。入参 { proposalId, oldContent, newContent, promotionDigest, baseDigest }，
 * 返回问题清单（空数组=通过）：冠军摘要须=选中内容的 sha256、基线摘要须=改前内容的 sha256、
 * 选中内容与基线相同则拒绝（写盘演练无从观察）。
 */
export function checkSingleFileSeed(input) {
  const problems = []
  const sha = sha256Of
  if (input.promotionDigest !== sha(input.newContent)) problems.push(`${input.proposalId}: 冠军摘要不是选中内容的 sha256`)
  if (input.baseDigest !== sha(input.oldContent)) problems.push(`${input.proposalId}: 基线摘要不是改前内容的 sha256`)
  if (input.newContent === input.oldContent) problems.push(`${input.proposalId}: 选中内容与基线相同，写盘演练无从观察`)
  return problems
}

/**
 * 多文件种子的自洽性。入参 { proposalId, files: [{path, content, digest}], deletions?, promotionDigest }：
 * 每个文件的内容与摘要对应；树摘要=逐行「路径:文件摘要」排序拼接的 sha256（loop-core treeDigest 同源）。
 */
export function checkTreeSeed(input) {
  const problems = []
  for (const f of input.files) {
    if (f.digest !== sha256Of(f.content)) problems.push(`${input.proposalId}: 文件 ${f.path} 的摘要与内容不符`)
  }
  const rows = input.files.map((f) => `${f.path}:${f.digest}`).sort().concat((input.deletions ?? []).map((d) => `DEL:${d}`).sort())
  if (input.promotionDigest !== sha256Of(rows.join('\n'))) problems.push(`${input.proposalId}: 树摘要不是 treeDigest(文件, 删除)`)
  return problems
}

/**
 * 已写盘冠军的自洽性。入参 { diskContents: Record<path, string>, files: [{path, nextContent, oldContent, existed}], proposalId }：
 * 磁盘内容须等于晋级内容（写盘生效的前提）；改前改后相同则回滚演练无从观察。
 */
export function checkAppliedFiles(input) {
  const problems = []
  for (const f of input.files) {
    const disk = input.diskContents[f.path]
    if (disk !== f.nextContent) problems.push(`${input.proposalId}: 磁盘 ${f.path} 与晋级内容不符（写盘未生效或被改动）`)
    if (f.existed && f.oldContent === f.nextContent) problems.push(`${input.proposalId}: ${f.path} 改前改后相同，回滚演练无从观察`)
  }
  return problems
}

/**
 * 冠军摘要与种子内容的一致性（单文件与多文件各一条判据）。
 * 入参 { champion: {proposalId, digest, applied}, files: [{path, nextContent}] }。
 */
export function checkChampion(input) {
  const problems = []
  if (!input.champion.applied) problems.push(`${input.champion.proposalId}: 回滚演练要求已写盘的冠军`)
  const expected = input.files.length === 1
    ? sha256Of(input.files[0].nextContent)
    : sha256Of(input.files.map((f) => `${f.path}:${sha256Of(f.nextContent)}`).sort().join('\n'))
  if (input.champion.digest !== expected) problems.push(`${input.champion.proposalId}: 冠军摘要与种子内容不对应`)
  return problems
}

import { createHash } from 'node:crypto'

function sha256Of(text) {
  return createHash('sha256').update(text).digest('hex')
}
