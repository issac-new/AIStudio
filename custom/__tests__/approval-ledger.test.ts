// P0b 统一审批账本守门（spec 2026-11-10-execution-kernel-unification §6 P0b/§8/§10 I4）：
// 记录构造走契约取数（不得自拼 recordType）、append-only 语义、入口覆盖率取数口、
// fail-soft（账本坏不炸主链路）。合成点接线断言：tool-hooks postExecute ok 调用落 exempted、
// mention-dispatch 派发落 exempted——接线面在各自域测试已有，此处锁账本域自身契约。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendApprovalRecord, buildApprovalRecord, entryCoverage,
  readApprovalLedger, synthesizeExempted, approvalLedgerDir,
} from '../server/approval-ledger/ledger-store'
import { fourModeOf } from '../server/executioncontract/index'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'approval-ledger-'))
  process.env.HERMES_APPROVAL_LEDGER_DIR = dir
})

afterEach(() => {
  delete process.env.HERMES_APPROVAL_LEDGER_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('approval-ledger P0b', () => {
  it('记录构造：yolo 放行落 exempted，decidedBy=policy:auto，policyVersion 来自契约', () => {
    const r = buildApprovalRecord({
      tool: 'terminal_exec', mode: 'yolo', sessionId: 's1', profile: 'p1',
      entryPoint: 'test', decided: 'auto',
    })
    expect(r.recordType).toBe('approval.exempted')
    expect(r.decidedBy).toBe('policy:auto')
    expect(r.riskClass).toBe('shell')
    expect(r.policyVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(r.recordId).toBeTruthy()
  })

  it('四挡→账本类型：build 落 pending（待人工）；readonly 挡落 exempted 且 decidedBy=policy:readonly', () => {
    const pending = buildApprovalRecord({
      tool: 'write_file', mode: 'build', sessionId: 's', profile: 'p',
      entryPoint: 't', decided: 'auto',
    })
    expect(pending.recordType).toBe('approval.pending')
    const readonly = buildApprovalRecord({
      tool: 'read_file', mode: 'plan', sessionId: 's', profile: 'p',
      entryPoint: 't', decided: 'readonly',
    })
    expect(readonly.recordType).toBe('approval.exempted')
    expect(readonly.decidedBy).toBe('policy:readonly')
  })

  it('append-only 语义：顺序追加可回读，entries[0] 最早', () => {
    for (const tool of ['read_file', 'write_file', 'git_push']) {
      expect(synthesizeExempted({
        tool, mode: 'yolo', sessionId: 's1', profile: 'p1', entryPoint: 'e1', decided: 'auto',
      })).toBe(true)
    }
    const entries = readApprovalLedger()
    expect(entries.map(e => e.tool)).toEqual(['read_file', 'write_file', 'git_push'])
    expect(existsSync(join(approvalLedgerDir(), 'approval-ledger.jsonl'))).toBe(true)
  })

  it('入口覆盖率取数口（I4 矩阵断言的数据源）：按 entryPoint 计数', () => {
    for (const ep of ['ekko-tool-waterfall', 'zcode-mention-dispatch', 'ekko-tool-waterfall']) {
      synthesizeExempted({ tool: 'terminal_exec', mode: 'legacy', sessionId: 's', profile: 'p', entryPoint: ep, decided: 'auto' })
    }
    const cov = entryCoverage(['ekko-tool-waterfall', 'zcode-mention-dispatch', 'ide-coding-agent'])
    expect(cov).toEqual({ 'ekko-tool-waterfall': 2, 'zcode-mention-dispatch': 1, 'ide-coding-agent': 0 })
  })

  it('fail-soft：目录不可写时 append 返回 false 不抛错（观测面不阻断业务）', () => {
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'not-a-dir')
    process.env.HERMES_APPROVAL_LEDGER_DIR = join(blocker, 'sub')
    expect(synthesizeExempted({
      tool: 'x', mode: 'yolo', sessionId: 's', profile: 'p', entryPoint: 't', decided: 'auto',
    })).toBe(false)
    delete process.env.HERMES_APPROVAL_LEDGER_DIR
  })

  it('七档/legacy 别名归一到四挡（唯一归一点 fourModeOf）', () => {
    expect(fourModeOf('readonly')).toBe('plan')
    expect(fourModeOf('plan')).toBe('plan')
    expect(fourModeOf('default')).toBe('build')
    expect(fourModeOf('acceptEdits')).toBe('guarded')
    expect(fourModeOf('dontAsk')).toBe('guarded')
    expect(fourModeOf('auto')).toBe('yolo')
    expect(fourModeOf('bypassPermissions')).toBe('yolo')
    expect(fourModeOf('yolo')).toBe('yolo')
    expect(fourModeOf('some-unknown-mode')).toBe('legacy')
    expect(fourModeOf(null)).toBe('legacy')
  })

  it('记录不落敏感原值：detail 只允许调用方显式给的键', () => {
    const r = buildApprovalRecord({
      tool: 'terminal_exec', mode: 'yolo', sessionId: 's', profile: 'p',
      entryPoint: 't', decided: 'auto', detail: { taskId: 'T-1' },
    })
    const raw = JSON.parse(JSON.stringify(r))
    expect(raw.detail).toEqual({ taskId: 'T-1' })
    expect(JSON.stringify(raw)).not.toContain('command')
  })

  it('手工裁决与免审同 schema：overrideRecordType 走 resolved 且 decidedBy=user', () => {
    const r = buildApprovalRecord({
      tool: 'git_push', mode: 'guarded', sessionId: 's', profile: 'p',
      entryPoint: 't', decided: 'user', overrideRecordType: 'approval.resolved',
    })
    expect(r.recordType).toBe('approval.resolved')
    expect(r.decidedBy).toBe('user')
    expect(r.riskClass).toBe('git_write')
  })
})

describe('终审修复 I4：契约损坏不炸启动成功门', () => {
  it('synthesizeExempted 对坏契约 fail-soft（返回 false 不抛）', () => {
    process.env.HERMES_EXECUTION_CONTRACT_PATH = join(dir, 'not-exist.json')
    try {
      expect(synthesizeExempted({ tool: 'x', mode: 'yolo', sessionId: 's', profile: 'p', entryPoint: 't', decided: 'auto' })).toBe(false)
    } finally {
      delete process.env.HERMES_EXECUTION_CONTRACT_PATH
    }
  })
})
