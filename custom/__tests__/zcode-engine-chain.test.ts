// overlay/custom/__tests__/zcode-engine-chain.test.ts
// 守门：zcode 引擎接入链（2026-09-23 R3 建立；2026-10-05 v0.7.30 迁移重写）。
// v0.7.30 上游原生吸收 zcode（定义/事件适配/桌面 CLI 识别/installation 探测），
// overlay 侧 patch 378/379 退役，接入面改为守上游原生结构 + 存量 patch（380/561）：
// ① series 不再登记 378/379、仍登记 380/561；② 上游原生 zcode 模块与 global-only
// 强制在位；③ client 侧原生接线（unions/选项/头像）；④ chat-run 入口走
// isNativeCodingAgent。clean 后跑则注入态断言 fail（提示先 inject）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../..')
const UPSTREAM_SERVER = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src')
const UPSTREAM_CLIENT = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/client/src')

function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('zcode 引擎接入链（R3 守门·v0.7.30 上游原生版）', () => {
  it('series：378/379 已退役（上游原生吸收），380/561 仍在', () => {
    const series = readOverlay('patches/series')
    expect(series).not.toMatch(/^378-server-zcode-coding-agent\.patch$/m)
    expect(series).not.toMatch(/^379-client-zcode-agent-ui\.patch$/m)
    expect(series).toMatch(/^380-server-zcode-engine-health-route\.patch$/m)
    expect(series).toMatch(/^561-server-zcode-scoped-fallback\.patch$/m)
  })

  it('上游原生 zcode 模块 + global-only 强制 + 探测（注入态 server 侧）', () => {
    expect(existsSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/zcode/definition.ts')),
      '上游原生 services/zcode/definition.ts 缺失——上游基线不对').toBe(true)
    expect(existsSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/zcode/installation.ts')),
      '上游原生桌面 CLI 识别 installation.ts 缺失').toBe(true)
    const native = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/contracts/agents/native-coding-agents.ts'), 'utf8')
    // overlay 561：zcode 与 cursor/qoder 同列 global-only（scoped 与其自管凭据体系冲突）
    expect(native).toMatch(/isGlobalOnlyCodingAgent[\s\S]*value === 'zcode'/)
    const index = readFileSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/index.ts'), 'utf8')
    expect(index).toContain('resolveZcodeCommand')
    expect(index).toContain("id === 'zcode'")
    const runManager = readFileSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/runtime/run-manager.ts'), 'utf8')
    expect(runManager).not.toContain('startZcodeExecTurn') // 378 退役：不再有 overlay 私有 zcode 分支
    expect(runManager).toContain('zcode')
  })

  it('client 侧接线（注入态：unions/选项/头像）', () => {
    const api = readFileSync(resolve(UPSTREAM_CLIENT, 'api/coding-agents.ts'), 'utf8')
    expect(api).toMatch(/CodingAgentId = .*'zcode'/)
    // 上游 #3199 将各处 Agent 选项收敛为 AGENT_OPTIONS 单一事实源（utils/agent-options.ts）
    const agentOptions = readFileSync(resolve(UPSTREAM_CLIENT, 'utils/agent-options.ts'), 'utf8')
    expect(agentOptions).toContain("{ label: 'ZCode', value: 'zcode' }")
    const avatar = readFileSync(resolve(UPSTREAM_CLIENT, 'utils/chat-agent-avatar.ts'), 'utf8')
    expect(avatar).toContain("zcode: { label: 'ZCode'")
    const store = readFileSync(resolve(UPSTREAM_CLIENT, 'stores/hermes/chat.ts'), 'utf8')
    expect(store).toContain("'zcode'")
  })

  it('chat-run 入口闸门认 zcode（isNativeCodingAgent 覆盖——回落 claude-code 的走查实修点）', () => {
    const parser = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/services/chat-run/types.ts'), 'utf8')
    expect(parser).toMatch(/isNativeCodingAgent\(value\)/)
    const handler = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/services/chat-run/handle-coding-agent-run.ts'), 'utf8')
    expect(handler).toMatch(/isNativeCodingAgent|agentId === 'zcode'/)
  })

  it('IDE 默认引擎 = zcode（底座切换核心断言）', () => {
    const store = readOverlay('custom/client/ide/store/ide.ts')
    expect(store).toMatch(/DEFAULT_IDE_AGENT: CodingAgentId = 'zcode'/)
    expect(store).toMatch(/case 'zcode':\n      return 'zcode'/)
    const agents = readOverlay('custom/client/ide/api/agents.ts')
    expect(agents).toMatch(/ORDER: CodingAgentId\[\] = \['zcode', 'codex'/)
  })
})
