// 推演问题 dev-branch-missing 硬闸门：编排器交付判定必须带远端 ref 证据。
// 根因：chen 本地 feat/DEV-PAYCORE 已 commit 但未 push，任务被误判完成；其他 agent 看不到。
// 两层守门：verifyPushResult 纯函数 + Verifier 接线（pushBranch 声明即启用）。
import { describe, expect, it } from 'vitest'
import { verifyPushResult } from '../push-verify'
import { Verifier } from '../verifier'
import type { TaskContract, LoopInstance } from '../../types'

describe('编排任务完成校验 push 证据（dev-branch-missing 硬闸门）', () => {
  it('缺 push 证据（远端 ref 为空）→ 判定未完成', () => {
    expect(verifyPushResult('a'.repeat(40), '', true).ok).toBe(false)
  })
  it('远端 ref 分叉 → 判定未完成（他人改动了同一分支）', () => {
    expect(verifyPushResult('a'.repeat(40), 'b'.repeat(40) + '\trefs/heads/feat/x', true).ok).toBe(false)
  })
  it('ls-remote 失败（离线）→ 判定未完成（不许盲报）', () => {
    expect(verifyPushResult('a'.repeat(40), '', false).ok).toBe(false)
  })
  it('远端 ref 与本地 HEAD 一致 → 可完成', () => {
    const sha = 'c'.repeat(40)
    expect(verifyPushResult(sha, `${sha}\trefs/heads/feat/x`, true).ok).toBe(true)
  })
})

function mkContract(over: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'c1', loopId: 'l1',
    source: { summary: 's' } as never,
    readPlan: { requiredReads: [] } as never,
    writeBoundary: [],
    verificationIntent: { programmatic: [], judge: null, human: null } as never,
    resultTemplate: { artifactType: 'pr', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    ...over,
  } as TaskContract
}

const mkLoop = () => ({ autonomyLevel: 'L3' }) as unknown as LoopInstance

describe('Verifier 接线：声明 pushBranch 的交付须带远端 ref 证据', () => {
  it('pushBranch 声明 + 无 worktree → overall failed（not-pushed）', async () => {
    const v = new Verifier()
    const record = await v.verify(mkContract({ resultTemplate: { artifactType: 'pr', requiredFiles: [], pushBranch: 'feat/DEV-PAYCORE' } }), mkLoop())
    expect(record.overall).toBe('failed')
    expect(record.results.pushEvidence?.ok).toBe(false)
    expect(record.results.pushEvidence?.reason).toBe('not-pushed')
  })
  it('未声明 pushBranch → 闸门关闭，pushEvidence 为 null、语义不变', async () => {
    const v = new Verifier()
    const record = await v.verify(mkContract(), mkLoop())
    expect(record.results.pushEvidence).toBeNull()
    expect(record.overall).toBe('passed')
  })
})
