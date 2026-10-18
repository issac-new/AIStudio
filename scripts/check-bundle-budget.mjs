#!/usr/bin/env node
// overlay/scripts/check-bundle-budget.mjs
// 打包预算：生产构建（inlineDynamicImports 单 chunk）总 JS 体积不得超过阈值。
// 用法：npm run build:full && npm run check:bundle
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const overlayRoot = resolve(here, '..')
const dist = resolve(overlayRoot, '..', 'upstream/hermes-studio/dist/client')
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
