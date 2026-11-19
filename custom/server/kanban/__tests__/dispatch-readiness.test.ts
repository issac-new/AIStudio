// 派单五问准入单元（批二）：五维判据各 ok/missing 态＋enforce/warn 收口。
// assess 是纯函数直接构造输入；enforce 走 env 开关。
import { describe, expect, it, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assessDispatchReadiness, enforceOrWarnReadiness, DispatchReadinessError,
} from '../dispatch-readiness'

const dims = (ok: boolean, findings: { dimension: string; ok: boolean }[]) =>
  Object.fromEntries(findings.map(f => [f.dimension, f.ok])) as Record<string, boolean>

afterEach(() => {
  delete process.env.HERMES_DISPATCH_READINESS_ENFORCE
  vi.restoreAllMocks()
})

describe('assessDispatchReadiness（五问判据）', () => {
  it('全绿：工作区在位＋规则面声明＋标题＋taskId＋验收标记', () => {
    const ws = mkdtempSync(join(tmpdir(), 'rdy-'))
    try {
      const r = assessDispatchReadiness({
        workspacePath: ws,
        taskId: 't1',
        task: { title: '修复登录 500', body: 'AC-1 登录返回 200' },
        handoffRuleLine: '交接契约：…',
      })
      expect(r.filter(f => f.ok)).toHaveLength(5)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('五缺失：workspacePath 不存在/无规则面/无标题/无 taskId/无验收标记', () => {
    const r = assessDispatchReadiness({
      workspacePath: join(tmpdir(), 'definitely-missing-dir'),
        task: { title: '', body: '改动说明若干（不含判定标记，避免夹具自陷）' },
    })
    expect(dims(false, r)).toEqual({
      information: false, rules: false, goal: false, control: false, verifiable: false,
    })
  })

  it('规则面三选一：step 授权要素可单独满足', () => {
    const ws = mkdtempSync(join(tmpdir(), 'rdy-'))
    try {
      const r = assessDispatchReadiness({
        workspacePath: ws, taskId: 't1',
        task: { title: 'x', body: 'AC-1 y' },
        stepsRuleCoverage: true,
      })
      expect(r.find(f => f.dimension === 'rules')?.ok).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('可验证：列证据契约可单独满足；AC 变体（AC1/AC·2/验收/acceptance/dod）都认', () => {
    const ws = mkdtempSync(join(tmpdir(), 'rdy-'))
    try {
      const byContract = assessDispatchReadiness({
        workspacePath: ws, taskId: 't1', task: { title: 'x', body: '不含验收字样' },
        handoffRuleLine: 'l', columnRequiredArtifacts: ['testlog'],
      })
      expect(byContract.find(f => f.dimension === 'verifiable')?.ok).toBe(true)
      for (const body of ['AC1 通过', 'AC·2 通过', '验收：见 qgate', 'acceptance: cmd', 'dod 列表']) {
        const r = assessDispatchReadiness({
          workspacePath: ws, taskId: 't1', task: { title: 'x', body }, handoffRuleLine: 'l',
        })
        expect({ body, ok: r.find(f => f.dimension === 'verifiable')?.ok }).toEqual({ body, ok: true })
      }
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })
})

describe('enforceOrWarnReadiness（执法梯度）', () => {
  it('默认 warn：缺项不抛，打一行', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = assessDispatchReadiness({ workspacePath: join(tmpdir(), 'missing'), task: { title: '', body: '' } })
    expect(() => enforceOrWarnReadiness(r)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('五问缺口')
  })

  it('enforce：缺项抛 DispatchReadinessError（消息带维度）', () => {
    process.env.HERMES_DISPATCH_READINESS_ENFORCE = '1'
    const r = assessDispatchReadiness({ workspacePath: join(tmpdir(), 'missing'), task: { title: '', body: '' } })
    expect(() => enforceOrWarnReadiness(r)).toThrow(DispatchReadinessError)
    try {
      enforceOrWarnReadiness(r)
      throw new Error('unreachable')
    } catch (e) {
      expect((e as Error).message).toContain('information')
      expect((e as Error).message).toContain('verifiable')
    }
  })

  it('全绿时 enforce 不抛', () => {
    process.env.HERMES_DISPATCH_READINESS_ENFORCE = '1'
    const ws = mkdtempSync(join(tmpdir(), 'rdy-'))
    try {
      const r = assessDispatchReadiness({
        workspacePath: ws, taskId: 't1',
        task: { title: 'x', body: 'AC-1 y' }, handoffRuleLine: 'l',
      })
      expect(() => enforceOrWarnReadiness(r)).not.toThrow()
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })
})
