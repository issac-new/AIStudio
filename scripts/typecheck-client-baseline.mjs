#!/usr/bin/env node
// 客户端类型基线（2026-10-28 K20）
//
// 背景：根 `typecheck:harness` 只手列 135 个服务端文件且 `strict false`；347 个 SFC 此前
// 完全没有类型门禁。一次性开全树会暴露大量存量错、无法当门禁用。本脚本做「基线 + 棘轮」：
//   node scripts/typecheck-client-baseline.mjs          生成/刷新基线（config/typecheck-client-baseline.json）
//   node scripts/typecheck-client-baseline.mjs --check  与基线比较，错误数上升即 exit 1
//
// 判据只看「错误总数」：存量允许存在，但只许减少。按域清零时同步下调基线。
// 退出码契约（2026-11-05 P0 Task 7，spec §判定契约）：0=判定完成且未超基线（或基线已刷新）；
// 1=错误数超基线；2=INCONCLUSIVE 无法形成判定（工具缺席/崩溃/超时/信号退出/输出截断），
// 此时绝不写基线、不判定——否则门禁会把工具故障当"通过"放行（PATH=/nonexistent 实录）。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE = resolve(ROOT, 'config/typecheck-client-baseline.json')
const checkMode = process.argv.includes('--check')

// 工具运行时限：vue-tsc 全量需数分钟，默认 10 分钟兜底防挂死；TYPECHECK_CLIENT_TIMEOUT_MS
// 覆盖仅供故障注入测试使用（scripts/__tests__/typecheck-client-baseline.test.ts 超时用例）。
const TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.TYPECHECK_CLIENT_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1000
})()

function runVueTsc() {
  // vue-tsc 走上游客户端 tsconfig；--noEmit 不改产物
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  try {
    execFileSync(cmd, ['vue-tsc', '--noEmit', '-p', 'tsconfig.client.json', '--pretty', 'false'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: TIMEOUT_MS,
    })
    return { errors: 0, sample: [] }
  } catch (e) {
    // 工具级故障优先于输出内容判定：spawn 失败（ENOENT）/超时（ETIMEDOUT）/输出截断
    // （ENOBUFS）/信号退出时输出可能只是残缺清单——即使夹带 TS 错误行也不得据此判定。
    // 错误形态经本机 execFileSync 实测：四类故障均 status=null（超时/截断另带 SIGTERM）；
    // 正常非零退出 status=数字且 signal=null，走下方 TS 错误行解析。
    const toolFailure =
      e.status === null || e.signal != null ||
      e.code === 'ENOENT' || e.code === 'ETIMEDOUT' || e.code === 'ENOBUFS'
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const tail = out.split('\n').filter(Boolean).slice(-3)
    if (toolFailure) {
      return { errors: null, inconclusive: true, reason: `status=${e.status} signal=${e.signal} code=${e.code}`, sample: tail }
    }
    // 区分「有类型错」与「工具自身崩溃」：崩溃时没有 TS 错误行但退出码非 0，不能当 0 错基线
    const lines = out.split('\n').filter((l) => /error TS\d+/.test(l))
    if (lines.length === 0) return { errors: null, inconclusive: true, reason: `status=${e.status} 且无 TS 错误行`, sample: tail }
    return { errors: lines.length, sample: lines.slice(0, 5) }
  }
}

const { errors, sample, inconclusive, reason } = runVueTsc()
const now = new Date().toISOString()

if (inconclusive) {
  console.warn(`[typecheck:client] INCONCLUSIVE：vue-tsc 未能产出类型错误清单（工具崩溃/环境问题，${reason}），不写基线、不判定`)
  if (sample.length) { console.warn('  尾部输出：'); for (const s of sample) console.warn(`   - ${s.trim()}`) }
  process.exit(2)
}

if (!checkMode) {
  mkdirSync(dirname(BASELINE), { recursive: true })
  writeFileSync(BASELINE, `${JSON.stringify({ errors, generatedAt: now, tool: 'vue-tsc --noEmit', note: '只许下降；按域清零后同步下调' }, null, 2)}\n`)
  console.log(`[typecheck:client] 基线已写入 ${BASELINE}：${errors} 个类型错误`)
  if (sample.length) { console.log('  样例：'); for (const s of sample) console.log(`   - ${s.trim()}`) }
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { errors: Infinity }
if (errors > baseline.errors) {
  console.error(`✗ typecheck:client 棘轮：错误数 ${errors} > 基线 ${baseline.errors}（新增 ${errors - baseline.errors}）`)
  for (const s of sample) console.error(`  - ${s.trim()}`)
  process.exit(1)
}
console.log(`✓ typecheck:client 棘轮：${errors} ≤ 基线 ${baseline.errors}`)
