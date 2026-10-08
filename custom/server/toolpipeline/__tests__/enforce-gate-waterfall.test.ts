// overlay/custom/server/toolpipeline/__tests__/enforce-gate-waterfall.test.ts
// H3 端到端集成：注入树的 ekko AgentToolRegistry（patch 565 瀑布）× overlay 执法钩子。
// 证明链路：setExecuteHooks → preExecute {allow:false} → registry 短路返回 error、
// 工具本体不执行。这是 H3"引擎通道已通"命题的直接证据。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentToolRegistry } from '../../../../../upstream/hermes-studio/packages/ekko-agent/src/tools/registry'
import { upsertLadder, _useLadderDirForTests, _resetLadderDirForTests } from '../../autonomyladder/autonomy-ladder'
import { ekkoEnforceGateHook } from '../enforce-gate'

let ladderDir: string

beforeEach(() => {
  ladderDir = mkdtempSync(join(tmpdir(), 'wf-ladder-'))
  _useLadderDirForTests(ladderDir)
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
})

afterAll(() => {
  _resetLadderDirForTests()
  rmSync(ladderDir, { recursive: true, force: true })
})

/** 假终端工具：记录是否被真实执行（deny 短路时不得置位）。 */
function makeTerminalTool(executed: { flag: boolean }) {
  return {
    definition: {
      name: 'terminal_exec',
      description: 'test terminal',
      parameters: { type: 'object' as const, properties: {} },
    },
    async execute(input: Record<string, unknown>) {
      executed.flag = true
      return { ok: true, content: `ran: ${String(input.command ?? '')}` }
    },
  }
}

describe('registry 瀑布 × 执法门（patch 565 通道实证）', () => {
  it('总闸关：钩子在链上，工具照常执行', async () => {
    const executed = { flag: false }
    const registry = new AgentToolRegistry()
    registry.setExecuteHooks([ekkoEnforceGateHook()])
    registry.register(makeTerminalTool(executed))
    const result = await registry.execute('terminal_exec', { command: 'ls -la' }, undefined as never)
    expect(result.ok).toBe(true)
    expect(executed.flag).toBe(true)
  })

  it('总闸开 + insight 档 + exec 工具：瀑布短路——工具未执行、返回 error 语义', async () => {
    upsertLadder({ target: 'wf-agent', level: 'insight' })
    process.env.HERMES_TOOL_ENFORCE = '1'
    const executed = { flag: false }
    const registry = new AgentToolRegistry()
    registry.setExecuteHooks([ekkoEnforceGateHook()])
    registry.register(makeTerminalTool(executed))
    const result = await registry.execute('terminal_exec', { command: 'ls -la' }, { profileId: 'wf-agent' } as never)
    expect(result.ok).toBe(false)
    expect(executed.flag).toBe(false)  // 关键断言：工具本体未被触碰
    expect(String(result.error)).toContain('insight')
  })

  it('总闸开 + assist 档 + 常规中危命令：放行且执行', async () => {
    upsertLadder({ target: 'wf-agent', level: 'assist', maxRiskTier: 'medium' })
    process.env.HERMES_TOOL_ENFORCE = '1'
    const executed = { flag: false }
    const registry = new AgentToolRegistry()
    registry.setExecuteHooks([ekkoEnforceGateHook()])
    registry.register(makeTerminalTool(executed))
    const result = await registry.execute('terminal_exec', { command: 'npm run build' }, { profileId: 'wf-agent' } as never)
    expect(result.ok).toBe(true)
    expect(executed.flag).toBe(true)
  })
})
