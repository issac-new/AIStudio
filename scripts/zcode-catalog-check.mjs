// overlay/scripts/zcode-catalog-check.mjs — ZCode 桌面版词条快照漂移守门。
//
// 背景：/ide ↔ ZCode 1:1 对照表（docs/superpowers/specs/2026-09-18-zcode-3123-parity-analysis.md）
// 以本机 /Applications/ZCode.app 的 asar 内嵌 zh-CN 词条为全量功能面事实源。
// 本机 ZCode 升级时词条必然漂移，对照表即失真；本脚本负责逐项对账。
//
// 用法：
//   npm run catalog-check               # 对账；漂移 exit 1
//   npm run catalog-check -- --refresh  # 按本机版本重建快照基线（升级后执行）
//
// 实现说明：
//   - app.asar 内文件内容以原始字节存储（未压缩），renderer bundle 里有扁平
//     zh-CN 目录对象。目录对象在 asar 里是未压缩的 JS 对象字面量，可直接扫描提取。
//   - 3.16.2 起 minified 变量名不再固定（zh=m / en=p），旧实现只认 `p={` 会
//     误判「上游内嵌结构已变化」。这里改为在锚点前窗口内扫描所有 `标识符={`
//     候选，取「包含锚点键且值为中文」的最大对象，版本升级不再依赖变量名。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// 事实源是本机 macOS 安装的 ZCode.app；其余平台无此事实源，明确退出而非 ENOENT 崩栈。
if (process.platform !== 'darwin') {
  console.error('[catalog-check] 仅支持 macOS（读取 /Applications/ZCode.app）；当前平台无此事实源，退出。')
  process.exit(1)
}

const APP = '/Applications/ZCode.app'
/** zh 目录内的独有锚点键（值是中文，可确认命中的是 zh 而非 en 目录） */
const ANCHOR_KEY = 'startup.global.silent'
const REFRESH = process.argv.includes('--refresh')

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
 * 提取 zh-CN 目录对象。asar 是多文件拼接的缓冲，`x={` 会撞到其他 bundle 的变量，
 * 因此以「解析结果包含锚点键且锚点值为中文」为准，而不是变量名或位置猜测。
 */
function extractZhCatalog(asar) {
  const anchor = asar.indexOf(ANCHOR_KEY)
  if (anchor < 0) throw new Error('asar 内未找到 zh 目录锚点键（上游内嵌结构已变化）')

  // 目录对象在锚点前；1MB 窗口足够覆盖当前 bundle，且避免全文件候选爆炸。
  const windowStart = Math.max(0, anchor - 1_000_000)
  const window = asar.slice(windowStart, anchor + 1)
  const re = /(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]*)=\{/g
  const starts = []
  let m
  while ((m = re.exec(window))) starts.push(windowStart + m.index + m[1].length + 1)

  let best = null
  for (let i = starts.length - 1; i >= 0; i--) {
    const start = starts[i]
    const end = scanObjectLiteral(asar, start)
    if (end < 0 || end < anchor) continue
    let obj
    try {
      obj = eval(`(${asar.slice(start, end + 1)})`)
    } catch {
      continue
    }
    if (!obj || typeof obj !== 'object' || !(ANCHOR_KEY in obj)) continue
    const isZh = typeof obj[ANCHOR_KEY] === 'string' && /[\u3400-\u9fff]/.test(obj[ANCHOR_KEY])
    const keys = Object.keys(obj).length
    if (!best || (isZh && !best.isZh) || (isZh === best.isZh && keys > best.keys)) {
      best = { obj, isZh, keys }
    }
    // zh 目录是数千键的大对象；命中即可停止向前扫描。
    if (isZh && keys > 1000) break
  }
  if (!best) throw new Error(`未能在 asar 中定位包含 ${ANCHOR_KEY} 的中文目录对象（上游内嵌结构已变化）`)
  return best.obj
}

/** 快照目录按安装版本命名：3.14.0 → zcode-3140；3.16.2 → zcode-3162。 */
function notesDirFor(version) {
  return resolve(process.cwd(), 'docs/superpowers/notes', `zcode-${version.replace(/\./g, '')}`)
}

function namespaceCounts(keys) {
  const counts = {}
  for (const k of keys) {
    const ns = k.split('.')[0]
    counts[ns] = (counts[ns] || 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function refreshSnapshot(version, live) {
  const dir = notesDirFor(version)
  mkdirSync(dir, { recursive: true })
  const keys = Object.keys(live).sort()
  writeFileSync(resolve(dir, 'zh-CN-keys.txt'), `${keys.join('\n')}\n`)
  writeFileSync(
    resolve(dir, 'ns-counts.json'),
    `${JSON.stringify({ zh: namespaceCounts(keys) }, null, 1)}\n`,
  )
  writeFileSync(
    resolve(dir, 'baseline.json'),
    `${JSON.stringify({ version, generatedAt: new Date().toISOString(), source: APP }, null, 2)}\n`,
  )
  console.log(`[zcode-catalog-check] 已刷新快照：${dir}`)
  console.log(`  版本 ${version}，${keys.length} 键 / ${Object.keys(namespaceCounts(keys)).length} 命名空间`)
}

function main() {
  const version = readAppVersion()
  const live = extractZhCatalog(readFileSync(`${APP}/Contents/Resources/app.asar`).toString('utf8'))

  if (REFRESH) {
    refreshSnapshot(version, live)
    return
  }

  const dir = notesDirFor(version)
  const snapshotFile = resolve(dir, 'zh-CN-keys.txt')
  if (!existsSync(snapshotFile)) {
    console.error(`[zcode-catalog-check] 本机 ZCode ${version} 无快照：${dir}`)
    console.error('  升级后先重建基线：npm run catalog-check -- --refresh')
    process.exit(1)
  }

  const failures = []
  const snapshotKeys = readFileSync(snapshotFile, 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
  const snapshotCounts = JSON.parse(readFileSync(resolve(dir, 'ns-counts.json'), 'utf8')).zh

  const liveKeys = new Set(Object.keys(live))
  const snapSet = new Set(snapshotKeys)

  const missing = snapshotKeys.filter((k) => !liveKeys.has(k))
  const added = [...liveKeys].filter((k) => !snapSet.has(k))
  if (missing.length) failures.push(`快照中 ${missing.length} 键已在上游消失（示例：${missing.slice(0, 5).join(', ')}）`)
  if (added.length) failures.push(`上游新增 ${added.length} 键未入对照表（示例：${added.slice(0, 5).join(', ')}）`)

  const liveCounts = namespaceCounts([...liveKeys])
  for (const [ns, count] of Object.entries(snapshotCounts)) {
    if (liveCounts[ns] !== count) failures.push(`命名空间 ${ns} 计数漂移：${count} → ${liveCounts[ns] ?? 0}`)
  }

  if (failures.length) {
    console.error('[zcode-catalog-check] 检测到漂移（对照表需重审）：')
    for (const f of failures) console.error(`  - ${f}`)
    console.error('  重建基线：npm run catalog-check -- --refresh')
    process.exit(1)
  }
  console.log(`[zcode-catalog-check] OK：${version}，${snapshotKeys.length} 键 / ${Object.keys(snapshotCounts).length} 命名空间，与快照一致`)
}

main()
