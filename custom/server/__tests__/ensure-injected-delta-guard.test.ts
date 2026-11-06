// overlay/custom/server/__tests__/ensure-injected-delta-guard.test.ts
// 守门：ensure-injected.mjs 必须处理「series 领先 manifest」差量。
// 根因（2026-09-22）：旧逻辑只看 manifest 存在就 exit(0)，series 尾部新 patch
// （336-338 事件）永远不上树且无日志，曾被迫手动 git apply + 手工登记。
// P1 Task 5（2026-11-05）起差量语义升级：ensure 读 manifest v2 + planIncrement 严格
// 增量——尾部增量（tail-append）打印清单后经 inject 主链（runInjection 事务化应用
// + manifest 原子更新）自动补套；v1/last-failed/前缀破坏等形态拒绝并指引 clean。
// 本测试做源码标记断言（脚本顶层副作用无法直接 import），防止回退到静默跳过。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
// inject.mjs 顶部无副作用(直跑守卫见其尾部),可静态 import 做行为断言。
import * as injectModule from '../../../scripts/inject.mjs'

const scriptPath = resolve(__dirname, '../../../scripts/ensure-injected.mjs')

describe('ensure-injected 差量守卫（series 领先 manifest 不许静默）', () => {
  const src = readFileSync(scriptPath, 'utf8')

  it('存在差量计算与自动补套（planIncrement tail-append → inject 主链）', () => {
    expect(src).toContain('series 领先 manifest')
    expect(src).toContain('planIncrement')
    expect(src).toContain("inc.kind === 'noop'")
    // 补套走 inject 主链单一写入路径（runInjection 事务化应用），不再裸 git apply
    expect(src).toContain("spawnSync('node', ['scripts/inject.mjs']")
  })

  it('差量非空必须打印清单（防回退为裸 exit(0)）', () => {
    // 差量分支内先 console.warn 清单再补套；不允许 tail-append 时无输出退出
    const deltaBranch = src.slice(src.indexOf("inc.kind === 'noop'"))
    expect(deltaBranch).toContain('console.warn(`[ensure-injected] series 领先 manifest')
  })

  it('补套成功后 manifest 由主链原子更新（防再出现手工登记）', () => {
    // 差量入册在 inject 主链（executor→writeManifestAtomic）完成；ensure 侧不得
    // 再出现 v1 式手写 manifest（writeFileSync appliedPatches）回退面
    expect(src).not.toContain('appliedPatches: nextApplied')
    expect(src).not.toMatch(/writeFileSync\([^)]*manifestPath/)
    const execSrc = readFileSync(resolve(__dirname, '../../../scripts/platform/inject/executor.mjs'), 'utf8')
    expect(execSrc).toContain('writeManifestAtomic')
  })

  it('v1 manifest 与 last-failed 必须拒绝（不自动收养/失败态不作成功输入）', () => {
    expect(src).toContain('isV2Manifest(manifest)')
    expect(src).toContain('process.exit(3)')
    expect(src).toContain('last-failed')
  })

  it('hermes-agent 目标路由与 inject.mjs 前缀集一致', () => {
    // 2026-09-23 收敛:前缀集在 inject.mjs 以 HERMES_AGENT_PATCH_PREFIXES 单一导出,
    // P1 Task 5 起 ensure 不再自行路由补丁（路由归 inject 主链/planner 单一事实源）。
    // 守卫从"两处文本一致"升级为:① 清单内容行为断言(含基础运行时前缀);② ensure
    // 侧不得内联前缀(内联=恢复双源漂移面)。
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
    expect(ensureSrc).not.toContain("startsWith('hermes_cli/')")
    expect(ensureSrc).not.toContain('isHermesAgentPatchPath(')
  })

  it('aipay-agent-sync.sh 的 AGENT_PREFIXES 与 inject.mjs 前缀集双向相等（2a02847 防复发）', () => {
    // 2a02847 事故：inject.mjs 补齐 tools//tests/tools//tests/agent/ 时漏了 shell 侧镜像
    // AGENT_PREFIXES，tools/ 开头的 patch 被静默跳过（候选 0 exit 0 无告警）。上例
    // toContain 是单向断言（删前缀仍绿），此处解析 shell 正则片段与 js 导出逐项双向比对，
    // 任一侧增删即红。分树轮（2026-10-03）aipay-agent-sync.sh 移居 simharness 独立仓
    // （ncwk 根下与 overlay 平级；MX_SIMHARNESS_ROOT 可覆盖）。
    const m2hRoot = process.env.MX_SIMHARNESS_ROOT
      ?? [
        // AIStudio 单仓整合轮（2026-10-24）：simharness 并入本仓，仓内优先；旧布局
        // （ncwk 根下与 overlay 平级）向上逐级探测回落——全新克隆仓外无兄弟目录
        // 会 ENOENT（/tmp 实证）。
        resolve(__dirname, '../../../simharness'),
        ...Array.from({ length: 9 }, (_, i) => i + 4)
          .map((up) => resolve(__dirname, '../'.repeat(up), 'simharness')),
      ].find((d) => existsSync(d))
    // 主检出向上 4 级=ncwk 根；worktree（.claude/worktrees/<b>）需 8 级——逐级探测兜底，
    // 仍找不到（脱离仓库运行）时给原 env 提示路径保持报错可读。
    const syncSrc = readFileSync(
      resolve(m2hRoot || resolve(__dirname, '../../../../simharness'), 'aipay-agent-sync.sh'),
      'utf8')
    const m = syncSrc.match(/AGENT_PREFIXES='\^\(([^)]*)\)'/)
    expect(m, "aipay-agent-sync.sh 应含 AGENT_PREFIXES='^(a/|b_|...)' 正则片段").toBeTruthy()
    // shell 侧为 grep -E 正则片段：点号等元字符带 \ 转义（model_tools\.py 实锤），
    // 比对前归一化去转义，两侧口径才可比。
    const shellPrefixes = (m as RegExpMatchArray)[1].split('|').filter((p) => p.length > 0).map((p) => p.replace(/\\/g, ''))
    const jsPrefixes = [...injectModule.HERMES_AGENT_PATCH_PREFIXES]
    expect(shellPrefixes.filter((p) => !jsPrefixes.includes(p)), 'shell 侧多出/未同步到 js 的前缀').toEqual([])
    expect(jsPrefixes.filter((p) => !shellPrefixes.includes(p)), 'js 侧多出/未同步到 shell 的前缀').toEqual([])
    expect(shellPrefixes.slice().sort(), '两侧前缀集逐项相等').toEqual(jsPrefixes.slice().sort())
  })
})

