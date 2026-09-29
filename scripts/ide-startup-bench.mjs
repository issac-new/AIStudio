// overlay/scripts/ide-startup-bench.mjs
// C2 启动基准（dev 链路，不装机）：IDE 工作台首屏到渲染空闲的可复跑测量。
// 判定语义对齐 opencode v2 desktop bench:startup（渲染空闲=首个连续 500ms 窗口
// 内主线程长任务占比 <10%），但走 vite dev + headless Chrome——装机基准（Electron
// 冷启、CDP DOM 轮询、A/B 双构建对比）为后续扩展位，不在本脚本伪装。
//
// 用法：
//   node scripts/ide-startup-bench.mjs                 # 连已运行 dev server（默认 8649）
//   BENCH_TARGET_URL=http://localhost:8650 node ...    # 指定目标
//   node scripts/ide-startup-bench.mjs --runs 5        # 采样次数（默认 3，取中位）
//   node scripts/ide-startup-bench.mjs --json out.json # 落盘原始样本
//
// 指标（每 run）：
//   navMs        navigationStart → domContentLoaded
//   markerMs     navigationStart → #/ide 三栏外壳可见（.ide-shell 渲染）
//   idleMs       navigationStart → 渲染空闲（marker 后连续 500ms 无 >50ms 长任务）
//   longtasks    空闲前长任务总数（>50ms 主线程任务）
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { createRequire } from 'module'

const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const args = process.argv.slice(2)
const runs = Number(args[args.indexOf('--runs') + 1] ?? 0) || 3
const jsonOut = args[args.indexOf('--json') + 1] && args[args.indexOf('--json') + 1] !== '--runs' ? args[args.indexOf('--json') + 1] : null
const targetUrl = process.env.BENCH_TARGET_URL?.trim() || 'http://localhost:8649/#/ide'
// BENCH_MARKER：可见性判定选择器（默认 .ide-shell 三栏外壳）。量登录页等
// 无鉴权落点时覆盖（如 '.login-view'）——IDE 真值数须带鉴权的完整 dev 栈。
const markerSelector = process.env.BENCH_MARKER?.trim() || '.ide-shell'

if (!/^https?:\/\//.test(targetUrl)) {
  console.error('[bench] BENCH_TARGET_URL 须为 http(s) URL')
  process.exit(2)
}

// 渲染空闲判定注入：PerformanceObserver longtask 计数 + 轮询窗口
const IDLE_PROBE = `(() => {
  window.__bench = { longtasks: 0, lastLongAt: performance.now() }
  try {
    new PerformanceObserver((list) => {
      for (const _ of list.getEntries()) { window.__bench.longtasks++; window.__bench.lastLongAt = performance.now() }
    }).observe({ entryTypes: ['longtask'] })
  } catch { /* longtask 不可用时退化为 marker+固定静默窗 */ }
})()`

async function measureOnce(context) {
  const page = await context.newPage()
  await page.addInitScript(IDLE_PROBE)
  const navStart = Date.now()
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const dclMs = Date.now() - navStart
  // 外壳可见：目标标记渲染（SPA hash 路由落 #/ide；标记可经 BENCH_MARKER 覆盖）
  await page.waitForSelector(markerSelector, { timeout: 60_000 })
  const markerMs = Date.now() - navStart
  // 渲染空闲：连续 500ms 无新长任务（≤10% 占比口径的保守实现）
  const deadline = Date.now() + 30_000
  let idleMs = markerMs
  while (Date.now() < deadline) {
    await page.waitForTimeout(250)
    const { longtasks } = await page.evaluate(() => window.__bench)
    const quietMs = await page.evaluate(() => performance.now() - window.__bench.lastLongAt)
    if (quietMs >= 500) {
      idleMs = Date.now() - navStart
      break
    }
  }
  if (idleMs === markerMs && Date.now() - navStart > markerMs + 29_000) {
    idleMs = -1 // 30s 未达空闲（异常负载）——如实标记，不静默给数
  }
  const longtasks = await page.evaluate(() => window.__bench.longtasks)
  await page.close()
  return { dclMs, markerMs, idleMs, longtasks }
}

function median(list) {
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

async function main() {
  // channel:chrome 走系统 Chrome（本仓既有惯例；缺席回落 bundled）
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
  const context = await browser.newContext()
  const samples = []
  for (let i = 0; i < runs; i++) {
    const s = await measureOnce(context)
    samples.push(s)
    console.log(`[bench] run ${i + 1}/${runs}: dcl=${s.dclMs}ms marker=${s.markerMs}ms idle=${s.idleMs}ms longtasks=${s.longtasks}`)
  }
  await browser.close()

  const ok = samples.filter((s) => s.idleMs > 0)
  if (ok.length === 0) {
    console.error('[bench] 全部采样未达渲染空闲——不产出中位数（见 run 行原始值）')
    process.exit(1)
  }
  const summary = {
    target: targetUrl,
    marker: markerSelector,
    runs,
    median: {
      dclMs: median(ok.map((s) => s.dclMs)),
      markerMs: median(ok.map((s) => s.markerMs)),
      idleMs: median(ok.map((s) => s.idleMs)),
      longtasks: median(ok.map((s) => s.longtasks)),
    },
    samples,
  }
  console.log('[bench] 中位数:', JSON.stringify(summary.median))
  if (jsonOut) {
    const out = resolve(process.cwd(), jsonOut)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(summary, null, 2))
    console.log('[bench] 样本落盘:', out)
  }
}

main().catch((err) => { console.error('[bench] 失败:', err.message); process.exit(1) })
