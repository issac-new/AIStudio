// overlay/scripts/zcode-catalog-check.mjs — ZCode 桌面版词条快照漂移守门。
//
// 背景：/ide ↔ ZCode 1:1 对照表（docs/superpowers/specs/2026-09-18-zcode-3123-parity-analysis.md）
// 以本机 /Applications/ZCode.app 的 asar 内嵌 zh-CN 词条为全量功能面事实源（3.14.0 =
// 5446 键/87 命名空间）。本机 ZCode 再升级时词条必然漂移，对照表即失真。
//
// 用法：npm run catalog-check（或 node scripts/zcode-catalog-check.mjs）
//   逐项比对（版本号/键集合/命名空间计数），任何漂移 exit 1 并打印差异摘要；
//   完全一致 exit 0。CI/例行 review 可直接挂本脚本。
//
// 实现说明：app.asar 内文件内容以原始字节存储（未压缩），renderer 的
// IntlProvider bundle 里有唯一的扁平 zh-CN 目录对象（`p={...}`），
// 直接在 asar 缓冲区内定位提取，不依赖 asar 解包工具。
import { readFileSync } from 'fs'
import { resolve } from 'path'

const APP = '/Applications/ZCode.app'
const NOTES = resolve(process.cwd(), 'docs/superpowers/notes/zcode-3140')
/** zh 目录内的独有锚点键（值是中文，可确认命中的是 zh 而非 en 目录） */
const ANCHOR_KEY = 'startup.global.silent'

function readAppVersion() {
  const plist = readFileSync(`${APP}/Contents/Info.plist`, 'utf8')
  const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)
  if (!m) throw new Error('无法从 Info.plist 读取版本号')
  return m[1].trim()
}

/** 从 start（含）开始做字符串感知括号扫描，返回配平 `}` 的索引；找不到返回 -1。 */
function scanObjectLiteral(s, start) {
  let i = start
  let depth = 0
  let st = 'code'
  while (i < s.length) {
    const c = s[i]
    if (st === 'code') {
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) return i
      } else if (c === '`') st = 'bt'
      else if (c === '"') st = 'dq'
      else if (c === "'") st = 'sq'
    } else if (st === 'bt') {
      if (c === '\\') i++
      else if (c === '`') st = 'code'
    } else {
      if (c === '\\') i++
      else if ((st === 'dq' && c === '"') || (st === 'sq' && c === "'")) st = 'code'
    }
    i++
  }
  return -1
}

/**
 * 在 s 的 [0, anchor) 范围内从后往前找 `varname={`，返回第一个解析后
 * 确实包含 anchorKey 的对象字面量内容（含首尾大括号）。
 * asar 是多文件拼接的缓冲，`p={` 会撞到其他 bundle 的变量，
 * 必须以「解析结果包含锚点键」为准，而不是位置猜测。
 */
function extractCatalogBefore(s, varname, anchor, anchorKey) {
  const re = new RegExp(`(?<![A-Za-z0-9_$])${varname}=\\{`, 'g')
  re.lastIndex = 0
  const starts = []
  let m
  while ((m = re.exec(s)) && m.index < anchor) starts.push(m.index + varname.length + 1)
  for (let idx = starts.length - 1; idx >= 0; idx--) {
    const end = scanObjectLiteral(s, starts[idx])
    if (end < 0 || end < anchor) continue // 必须包住锚点
    const lit = s.slice(starts[idx], end + 1)
    try {
      const obj = eval(`(${lit})`)
      if (obj && typeof obj === 'object' && anchorKey in obj) return obj
    } catch { /* 尝试更早的候选 */ }
  }
  throw new Error(`未能在 asar 中定位包含 ${anchorKey} 的 ${varname} 目录（上游内嵌结构已变化）`)
}

function extractLiveCatalog() {
  // utf8 解码：目录键值含中文（如 feedback.severity.P1-高），latin1 会把多字节
  // 序列拆碎造成假漂移；asar 里其他二进制段会解成替换符，不影响文本段扫描。
  const asar = readFileSync(`${APP}/Contents/Resources/app.asar`).toString('utf8')
  const anchor = asar.indexOf(ANCHOR_KEY)
  if (anchor < 0) throw new Error('asar 内未找到 zh 目录锚点键（上游内嵌结构已变化）')
  return extractCatalogBefore(asar, 'p', anchor, ANCHOR_KEY)
}

function main() {
  const failures = []
  const version = readAppVersion()
  if (version !== '3.14.0') {
    failures.push(`版本漂移：快照基于 3.14.0，本机现为 ${version}`)
  }

  const snapshotKeys = readFileSync(resolve(NOTES, 'zh-CN-keys.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
  const snapshotCounts = JSON.parse(readFileSync(resolve(NOTES, 'ns-counts.json'), 'utf8')).zh

  const live = extractLiveCatalog()
  const liveKeys = new Set(Object.keys(live))
  const snapSet = new Set(snapshotKeys)

  const missing = snapshotKeys.filter((k) => !liveKeys.has(k))
  const added = [...liveKeys].filter((k) => !snapSet.has(k))
  if (missing.length) failures.push(`快照中 ${missing.length} 键已在上游消失（示例：${missing.slice(0, 5).join(', ')}）`)
  if (added.length) failures.push(`上游新增 ${added.length} 键未入对照表（示例：${added.slice(0, 5).join(', ')}）`)

  const liveCounts = {}
  for (const k of liveKeys) {
    const ns = k.split('.')[0]
    liveCounts[ns] = (liveCounts[ns] || 0) + 1
  }
  for (const [ns, count] of Object.entries(snapshotCounts)) {
    if (liveCounts[ns] !== count) failures.push(`命名空间 ${ns} 计数漂移：${count} → ${liveCounts[ns] ?? 0}`)
  }

  if (failures.length) {
    console.error('[zcode-catalog-check] 检测到漂移（对照表需重审）：')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log(`[zcode-catalog-check] OK：${version}，${snapshotKeys.length} 键 / ${Object.keys(snapshotCounts).length} 命名空间，与快照一致`)
}

main()
