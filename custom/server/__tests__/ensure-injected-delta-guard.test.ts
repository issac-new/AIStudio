// overlay/custom/server/__tests__/ensure-injected-delta-guard.test.ts
// 守门：ensure-injected.mjs 必须处理「series 领先 manifest」差量。
// 根因（2026-09-22）：旧逻辑只看 manifest 存在就 exit(0)，series 尾部新 patch
// （336-338 事件）永远不上树且无日志，曾被迫手动 git apply + 手工登记。
// 本测试做源码标记断言（脚本顶层副作用无法直接 import），防止回退到静默跳过。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
// inject.mjs 顶部无副作用(直跑守卫见其尾部),可静态 import 做行为断言。
import * as injectModule from '../../../scripts/inject.mjs'

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
    // 2026-09-23 收敛:前缀集在 inject.mjs 以 HERMES_AGENT_PATCH_PREFIXES 单一导出,
    // ensure-injected.mjs import 复用谓词。守卫从"两处文本一致"升级为:
    // ① 清单内容行为断言(含基础运行时前缀);② ensure-injected 确实复用而非内联。
    const { HERMES_AGENT_PATCH_PREFIXES } = injectModule
    const expected = [
      'hermes_cli/', 'plugins/', 'agent/', 'apps/', 'assets/', 'acp_',
      'gateway/', 'tests/gateway/', 'tests/hermes_cli/',
      'optional-mcps/', 'optional-skills/',
      'tools/', 'tests/tools/', 'tests/agent/',
    ]
    for (const p of expected) {
      expect(HERMES_AGENT_PATCH_PREFIXES, `前缀 ${p}`).toContain(p)
    }
    const injectSrc = readFileSync(resolve(__dirname, '../../../scripts/inject.mjs'), 'utf8')
    expect(injectSrc).toContain('export const HERMES_AGENT_PATCH_PREFIXES')
    // ensure-injected 不得再内联前缀(内联=恢复双源漂移面)
    const ensureSrc = readFileSync(resolve(__dirname, '../../../scripts/ensure-injected.mjs'), 'utf8')
    expect(ensureSrc).toContain("isHermesAgentPatchPath } from './inject.mjs'")
    expect(ensureSrc).not.toContain("startsWith('hermes_cli/')")
  })

  it('aipay-agent-sync.sh 的 AGENT_PREFIXES 与 inject.mjs 前缀集双向相等（2a02847 防复发）', () => {
    // 2a02847 事故：inject.mjs 补齐 tools//tests/tools//tests/agent/ 时漏了 shell 侧镜像
    // AGENT_PREFIXES，tools/ 开头的 patch 被静默跳过（候选 0 exit 0 无告警）。上例
    // toContain 是单向断言（删前缀仍绿），此处解析 shell 正则片段与 js 导出逐项双向比对，
    // 任一侧增删即红。
    const syncSrc = readFileSync(resolve(__dirname, '../../../scripts/aipay/aipay-agent-sync.sh'), 'utf8')
    const m = syncSrc.match(/AGENT_PREFIXES='\^\(([^)]*)\)'/)
    expect(m, "aipay-agent-sync.sh 应含 AGENT_PREFIXES='^(a/|b_|...)' 正则片段").toBeTruthy()
    const shellPrefixes = (m as RegExpMatchArray)[1].split('|').filter((p) => p.length > 0)
    const jsPrefixes = [...injectModule.HERMES_AGENT_PATCH_PREFIXES]
    expect(shellPrefixes.filter((p) => !jsPrefixes.includes(p)), 'shell 侧多出/未同步到 js 的前缀').toEqual([])
    expect(jsPrefixes.filter((p) => !shellPrefixes.includes(p)), 'js 侧多出/未同步到 shell 的前缀').toEqual([])
    expect(shellPrefixes.slice().sort(), '两侧前缀集逐项相等').toEqual(jsPrefixes.slice().sort())
  })
})

