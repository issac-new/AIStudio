// P0b-2 Task 2 守门：IDE/群聊编码任务启动免审记录。合成点唯一性靠补丁 765 的
// 内容断言锁（补丁是本仓产物，非上游行为，grep 断言成立）；记录语义靠纯函数测试。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  codingLaunchApprovalRecord, codingLaunchEntryPoint, codingLaunchMode,
} from '../server/approval-ledger/coding-entry'
import { synthesizeExempted, readApprovalLedger } from '../server/approval-ledger/ledger-store'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coding-entry-ledger-'))
  process.env.HERMES_APPROVAL_LEDGER_DIR = dir
})

afterEach(() => {
  delete process.env.HERMES_APPROVAL_LEDGER_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('coding-entry 免审记录', () => {
  it('入口分流：ide/group_chat/workflow 三类可对账', () => {
    expect(codingLaunchEntryPoint('coding_agent')).toBe('ide-coding-agent')
    expect(codingLaunchEntryPoint('group_chat')).toBe('group-chat-coding-agent')
    expect(codingLaunchEntryPoint('workflow')).toBe('workflow-coding-agent')
    expect(codingLaunchEntryPoint('global_agent')).toBe('workflow-coding-agent')
  })

  it('档位如实：缺省 yolo=现状，approvalRequired=true 记 plan（本批二值，P1 换四挡）', () => {
    expect(codingLaunchMode(undefined)).toBe('yolo')
    expect(codingLaunchMode(false)).toBe('yolo')
    expect(codingLaunchMode(true)).toBe('plan')
  })

  it('合成入参：tool 带 codingAgentId、detail 不含敏感原值', () => {
    const rec = codingLaunchApprovalRecord({
      codingAgentId: 'zcode', sessionSource: 'group_chat', approvalRequired: false,
      sessionId: 's1', agentSessionId: 'a1',
    })
    expect(rec.tool).toBe('coding_agent_launch:zcode')
    expect(rec.entryPoint).toBe('group-chat-coding-agent')
    expect(rec.mode).toBe('yolo')
    expect(rec.decided).toBe('auto')
    expect(rec.detail).toEqual({ codingAgentId: 'zcode', agentSessionId: 'a1', source: 'group_chat' })
  })

  it('经 synthesizeExempted 落账一条 exempted（policyVersion 随契约）', () => {
    expect(synthesizeExempted(codingLaunchApprovalRecord({
      codingAgentId: 'dsh', sessionSource: 'coding_agent', sessionId: 's2', agentSessionId: 'a2',
    }))).toBe(true)
    const entries = readApprovalLedger()
    expect(entries).toHaveLength(1)
    expect(entries[0].recordType).toBe('approval.exempted')
    expect(entries[0].entryPoint).toBe('ide-coding-agent')
    expect(entries[0].mode).toBe('yolo')
    expect(entries[0].policyVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(existsSync(join(dir, 'approval-ledger.jsonl'))).toBe(true)
  })
})

describe('补丁 765 接线锁（合成点唯一）', () => {
  it('补丁存在、series 登记、且只在一处（启动成功 return 前）调 codingLaunchApprovalRecord', () => {
    const patchPath = join(repoRoot, 'patches/765-server-coding-launch-approval-ledger.patch')
    expect(existsSync(patchPath), '补丁文件存在').toBe(true)
    const patch = readFileSync(patchPath, 'utf8')
    const series = readFileSync(join(repoRoot, 'patches/series'), 'utf8')
    expect(series).toContain('765-server-coding-launch-approval-ledger.patch')
    expect(patch).toContain("from '../../../custom/approval-ledger/coding-entry'")
    expect(patch).toContain('codingLaunchApprovalRecord(')
    expect(patch).toContain('synthesizeExempted(')
    // 唯一合成点：vendor 侧调用恰一次
    const calls = patch.split('codingLaunchApprovalRecord(').length - 1
    expect(calls).toBe(1)
  })
})

describe('终审修复 C1/C2：DSH 导入路径可解析＋档位取值源', () => {
  it('补丁 766 的 DSH import 相对路径在注入态可解析（四级）', async () => {
    const { createRequire } = await import('node:module')
    const { readFileSync: rf } = await import('node:fs')
    const patch = rf(join(repoRoot, 'patches/766-server-coding-launch-fourmode.patch'), 'utf8')
    const m = patch.match(/import \{ dshPermissionRequired \} from '([^']+)'/)
    expect(m, '补丁含 dsh import 行').toBeTruthy()
    const dshFile = join(repoRoot, 'vendor/hermes-studio/packages/server/src/modules/coding-agents/services/dsh/chat-turn.ts')
    const req = createRequire(dshFile)
    expect(() => req.resolve(m![1] + '.ts'.replace('.ts', ''))).toBeTruthy()
    // 相对深度显式断言：services/dsh/ → src/custom 需四级
    expect(m![1]).toBe('../../../../custom/executioncontract/mode-policy')
  })

  it('codingLaunchApprovalRecord 优先消费四挡 permissionMode；未配置回落二值（C2）', async () => {
    const mod = await import('../server/approval-ledger/coding-entry')
    const rec = mod.codingLaunchApprovalRecord({
      codingAgentId: 'zcode', sessionSource: 'coding_agent',
      permissionMode: 'plan', sessionId: 's', agentSessionId: 'a',
    } as never)
    expect(rec.mode).toBe('plan')
    const fallback = mod.codingLaunchApprovalRecord({
      codingAgentId: 'zcode', sessionSource: 'coding_agent',
      approvalRequired: true, sessionId: 's', agentSessionId: 'a',
    } as never)
    expect(fallback.mode).toBe('plan')
    const neither = mod.codingLaunchApprovalRecord({
      codingAgentId: 'zcode', sessionSource: 'coding_agent',
      sessionId: 's', agentSessionId: 'a',
    } as never)
    expect(neither.mode).toBe('yolo')
  })

  it('补丁 765 调用点传 permissionMode 而非不存在的 launch.approvalRequired（C2）', () => {
    const patch = readFileSync(join(repoRoot, 'patches/765-server-coding-launch-approval-ledger.patch'), 'utf8')
    expect(patch).toContain('permissionMode: sessionMode ? zcodeNativeMode(sessionMode) : undefined')
    expect(patch).not.toContain('approvalRequired: launch.approvalRequired')
  })
})
