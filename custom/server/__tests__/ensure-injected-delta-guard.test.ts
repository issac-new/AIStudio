// overlay/custom/server/__tests__/ensure-injected-delta-guard.test.ts
// 守门：ensure-injected.mjs 必须处理「series 领先 manifest」差量。
// 根因（2026-09-22）：旧逻辑只看 manifest 存在就 exit(0)，series 尾部新 patch
// （336-338 事件）永远不上树且无日志，曾被迫手动 git apply + 手工登记。
// 本测试做源码标记断言（脚本顶层副作用无法直接 import），防止回退到静默跳过。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const scriptPath = resolve(__dirname, '../../../scripts/ensure-injected.mjs')

describe('ensure-injected 差量守卫（series 领先 manifest 不许静默）', () => {
  const src = readFileSync(scriptPath, 'utf8')

  it('存在差量计算与自动补套', () => {
    expect(src).toContain('series 领先 manifest')
    expect(src).toContain('applyDelta')
    expect(src).toContain("filter((p) => !injectedSet.has(p))")
  })

  it('差量非空必须打印清单（防回退为裸 exit(0)）', () => {
    // 差量分支内先 console.warn 清单再 apply；不允许 delta.length>0 时无输出退出
    const deltaBranch = src.slice(src.indexOf('const delta ='))
    expect(deltaBranch).toContain('console.warn(`[ensure-injected] series 领先 manifest')
  })

  it('补套成功后把差量写回 manifest（防再出现手工登记）', () => {
    expect(src).toContain('appliedPatches: nextApplied')
  })

  it('hermes-agent 目标路由与 inject.mjs 前缀集一致', () => {
    const injectSrc = readFileSync(resolve(__dirname, '../../../scripts/inject.mjs'), 'utf8')
    const prefixes = [
      "startsWith('hermes_cli/')", "startsWith('plugins/')", "startsWith('agent/')",
      "startsWith('apps/')", "startsWith('assets/')", "startsWith('acp_')",
      "startsWith('gateway/')", "startsWith('tests/gateway/')", "startsWith('tests/hermes_cli/')",
    ]
    for (const p of prefixes) {
      expect(src).toContain(p)
      expect(injectSrc).toContain(p)
    }
  })
})
