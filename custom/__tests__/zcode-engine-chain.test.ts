// overlay/custom/__tests__/zcode-engine-chain.test.ts
// 守门：zcode 引擎接入链（2026-09-23 R3，patch 378/379 + IDE 默认引擎切换）。
// ① 注入态上游文件含 zcode 引擎注册/分发/模块；② IDE 默认引擎 = zcode；
// ③ patch 378/379 已登记 series。clean 后跑则注入态断言 fail（提示先 inject）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../..')
const UPSTREAM_SERVER = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src')
const UPSTREAM_CLIENT = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/client/src')

function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('zcode 引擎接入链（R3 守门）', () => {
  it('series 登记 patch 378/379', () => {
    const series = readOverlay('patches/series')
    expect(series).toMatch(/^378-server-zcode-coding-agent\.patch$/m)
    expect(series).toMatch(/^379-client-zcode-agent-ui\.patch$/m)
  })

  it('契约 + 引擎登记 + 分发 + 探测（注入态 server 侧）', () => {
    expect(existsSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/zcode/turn-process.ts')),
      'services/zcode/ 模块未注入——先 npm run inject').toBe(true)
    const runtime = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/contracts/agents/runtime.ts'), 'utf8')
    expect(runtime).toContain("'zcode'")
    const index = readFileSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/index.ts'), 'utf8')
    expect(index).toContain('ZCODE_CODING_AGENT_DEFINITION')
    expect(index).toMatch(/getCodingAgentManagedMcpServerConfigs|installCodingAgent/) // 文件可读
    expect(index).toContain('zcode CLI 构建产物缺失')
    const runManager = readFileSync(resolve(UPSTREAM_SERVER, 'modules/coding-agents/services/runtime/run-manager.ts'), 'utf8')
    expect(runManager).toContain('startZcodeExecTurn')
    expect(runManager).toContain("agentId === 'zcode'")
    expect(runManager).toContain('recordZcodeNativeSessionId')
  })

  it('client 侧接线（注入态：unions/选项/头像/队列/图标/映射）', () => {
    const api = readFileSync(resolve(UPSTREAM_CLIENT, 'api/coding-agents.ts'), 'utf8')
    expect(api).toMatch(/CodingAgentId = .*'zcode'/)
    const chatPanel = readFileSync(resolve(UPSTREAM_CLIENT, 'components/hermes/chat/ChatPanel.vue'), 'utf8')
    expect(chatPanel).toContain('{ label: "ZCode", value: "zcode" }')
    const avatar = readFileSync(resolve(UPSTREAM_CLIENT, 'utils/chat-agent-avatar.ts'), 'utf8')
    expect(avatar).toContain("zcode: { label: 'ZCode'")
    expect(existsSync(resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/client/public/coding-agents/zcode.svg')),
      'zcode.svg 图标未注入').toBe(true)
    const store = readFileSync(resolve(UPSTREAM_CLIENT, 'stores/hermes/chat.ts'), 'utf8')
    expect(store).toContain("if (id === 'zcode') return 'zcode'")
  })

  it('chat-run 入口闸门认 zcode（消息不过 codingAgentId 解析器会被回落 claude-code——R3 走查实修点）', () => {
    const parser = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/services/chat-run/types.ts'), 'utf8')
    expect(parser).toContain("|| value === 'zcode') return value")
    const handler = readFileSync(resolve(UPSTREAM_SERVER, 'modules/studio/services/chat-run/handle-coding-agent-run.ts'), 'utf8')
    expect(handler).toMatch(/agentId === 'zcode'/)
  })

  it('IDE 默认引擎 = zcode（底座切换核心断言）', () => {
    const store = readOverlay('custom/client/ide/store/ide.ts')
    expect(store).toMatch(/DEFAULT_IDE_AGENT: CodingAgentId = 'zcode'/)
    expect(store).toMatch(/case 'zcode':\n      return 'zcode'/)
    const agents = readOverlay('custom/client/ide/api/agents.ts')
    expect(agents).toMatch(/ORDER: CodingAgentId\[\] = \['zcode', 'codex'/)
  })
})
