#!/usr/bin/env node
// overlay/scripts/check-bundle-budget.mjs
// 打包预算：生产构建（inlineDynamicImports 单 chunk）总 JS 体积不得超过阈值。
// 用法：npm run build:full && npm run check:bundle
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const overlayRoot = resolve(here, '..')
// 上游根解析序与 build.mjs / serve-server.mjs 一致：显式 env ＞ 仓内 vendor ＞ 旧兄弟 upstream。
// 构建产物落在 vendor/hermes-studio/dist（inject 后构建在该树内），单仓检出没有 ../upstream。
const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim())
  : existsSync(resolve(overlayRoot, 'vendor', 'hermes-studio'))
    ? resolve(overlayRoot, 'vendor')
    : resolve(overlayRoot, '..', 'upstream')
const dist = resolve(upstreamRoot, 'hermes-studio/dist/client')
const budgetMb = Number(process.env.IDE_BUNDLE_BUDGET_MB || 25)

try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const entry = /assets\/js\/[^"']+\.js/.exec(html)?.[0]
  const jsDir = join(dist, 'assets/js')
  const files = readdirSync(jsDir).filter(name => name.endsWith('.js'))
  const total = files.reduce((sum, name) => sum + statSync(join(jsDir, name)).size, 0)
  const mb = total / (1024 * 1024)
  console.log(`[bundle] entry=${entry ?? 'missing'} files=${files.length} total=${mb.toFixed(2)}MB budget=${budgetMb}MB`)
  if (!entry || mb > budgetMb) {
    console.error('[bundle] FAIL: 入口缺失或超出预算')
    process.exit(1)
  }
  console.log('[bundle] OK')
} catch (err) {
  console.error(`[bundle] FAIL: ${err instanceof Error ? err.message : String(err)}（先 npm run build:full）`)
  process.exit(1)
}
