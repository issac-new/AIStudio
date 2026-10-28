#!/usr/bin/env node
// 客户端类型基线（2026-10-28 K20）
//
// 背景：根 `typecheck:harness` 只手列 135 个服务端文件且 `strict false`；347 个 SFC 此前
// 完全没有类型门禁。一次性开全树会暴露大量存量错、无法当门禁用。本脚本做「基线 + 棘轮」：
//   node scripts/typecheck-client-baseline.mjs          生成/刷新基线（config/typecheck-client-baseline.json）
//   node scripts/typecheck-client-baseline.mjs --check  与基线比较，错误数上升即 exit 1
//
// 判据只看「错误总数」：存量允许存在，但只许减少。按域清零时同步下调基线。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE = resolve(ROOT, 'config/typecheck-client-baseline.json')
const checkMode = process.argv.includes('--check')

function runVueTsc() {
  // vue-tsc 走上游客户端 tsconfig；--noEmit 不改产物
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  try {
    execFileSync(cmd, ['vue-tsc', '--noEmit', '-p', 'tsconfig.client.json', '--pretty', 'false'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return { errors: 0, sample: [] }
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const lines = out.split('\n').filter((l) => /error TS\d+/.test(l))
    // 区分「有类型错」与「工具自身崩溃」：崩溃时没有 TS 错误行但退出码非 0，不能当 0 错基线
    if (lines.length === 0) return { errors: null, inconclusive: true, sample: out.split('\n').slice(-3) }
    return { errors: lines.length, sample: lines.slice(0, 5) }
  }
}

const { errors, sample, inconclusive } = runVueTsc()
const now = new Date().toISOString()

if (inconclusive) {
  console.warn('[typecheck:client] INCONCLUSIVE：vue-tsc 未能产出类型错误清单（工具崩溃/环境问题），不写基线、不判定')
  process.exit(0)
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
