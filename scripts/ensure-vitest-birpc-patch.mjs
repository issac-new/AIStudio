// 幂等补丁：vitest birpc 60s 硬编码超时抬升（v1.0.16 发布轮定谳的根治件）。
// 背景：--no-file-parallelism 全量（8863 用例/1153 文件，串行 ~592s）下，
//   vitest 3.2.7 worker→主进程 onTaskUpdate 的 birpc ack 三连超时
//   （[vitest-worker]: Timeout calling "onTaskUpdate"，DEFAULT_TIMEOUT=6e4
//   硬编码于 dist chunks，无公开 config 键）；junit 四轮全绿实证非测试问题。
// 改法：DEFAULT_TIMEOUT 改读 VITEST_BIRPC_TIMEOUT_MS（缺省 3e5＝5 分钟）。
//   默认值抬升只为长套件 ack 窗口；junit minTotal 收缩守门不受影响。
// 生命周期：vitest 属 node_modules（npm install 重装即失），故挂 pretest 链
//   （npm test 必经）每次幂等重放；直接 npx vitest 不经此链不受保护。
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const vitestDist = resolve(root, 'node_modules/vitest/dist/chunks')
const MARK = 'VITEST_BIRPC_TIMEOUT_MS'
const OLD = 'const DEFAULT_TIMEOUT = 6e4;'
const NEW = 'const DEFAULT_TIMEOUT = Number(process.env.VITEST_BIRPC_TIMEOUT_MS ?? 3e5);'

if (!existsSync(vitestDist)) {
  console.log('[vitest-birpc-patch] node_modules/vitest 不存在（未 install），跳过')
  process.exit(0)
}

let patched = 0
let already = 0
for (const f of readdirSync(vitestDist)) {
  if (!f.startsWith('index.') || !f.endsWith('.js')) continue
  const p = resolve(vitestDist, f)
  const t = readFileSync(p, 'utf8')
  if (t.includes(MARK)) { already++; continue }
  if (!t.includes(OLD)) continue
  writeFileSync(p, t.replace(OLD, NEW))
  patched++
}

if (patched === 0 && already === 0) {
  // vitest 升级换 chunk 名/改实现：不静默放过，显式报警由人复核（fail-soft：不阻断，
  // 因为本脚本也可能在 vitest 尚未安装的树上跑）。
  console.log('[vitest-birpc-patch] 未找到 DEFAULT_TIMEOUT=6e4 锚点——vitest 版本可能已变，请复核补丁锚')
  process.exit(0)
}
console.log(`[vitest-birpc-patch] 完成：新打 ${patched} 处、已打过 ${already} 处`)
