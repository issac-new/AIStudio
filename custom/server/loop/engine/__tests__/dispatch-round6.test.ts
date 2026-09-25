// overlay/custom/server/loop/engine/__tests__/dispatch-round6.test.ts
// R6 守门：dispatch reason 词表 / dispatcher 认领护栏+原因透传 /
// loop-engine 人机分工门禁（in_review 待人审）/ ia2 reason 投影 / patch 352 漂移。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import {
  DISPATCH_REASON_CODES,
  isDispatchReasonCode,
  type DispatchReasonCode,
} from '../dispatch-reason'
import { SubagentDispatcher, type DispatchOutcome } from '../subagent-dispatcher'
import type { TaskContract } from '../../types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mkContract(over: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'c1', loopId: 'l1',
    source: { summary: 's' } as never,
    readPlan: { requiredReads: [] } as never,
    writeBoundary: [],
    verificationIntent: {} as never,
    resultTemplate: { artifactType: 'code' } as never,
    worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    ...over,
  } as TaskContract
}

describe('dispatch reason 词表（multica dispatch/reason.go 语义）', () => {
  it('12 个稳定枚举 + isDispatchReasonCode 校验', () => {
    expect(DISPATCH_REASON_CODES).toHaveLength(12)
    for (const c of ['queued', 'handed_off', 'runtime_offline', 'max_depth_exceeded', 'gate_pending_human', 'lease_conflict', 'board_concurrency_full']) {
      expect(isDispatchReasonCode(c)).toBe(true)
    }
    expect(isDispatchReasonCode('not_a_reason')).toBe(false)
    expect(isDispatchReasonCode(123)).toBe(false)
  })
})

describe('dispatcher 认领护栏 + 原因透传', () => {
  it('runtime 离线 → 拦截不调用 invoke + runtime_offline 回调', async () => {
    const reasons: DispatchOutcome['reason'][] = []
    const invoke = vi.fn(async () => 'ok')
    const d = new SubagentDispatcher({
      invokeAgent: invoke,
      isRuntimeHealthy: () => false,
      onDispatchReason: (_id, r) => reasons.push(r),
    })
    const out = await d.dispatchWithOutcome(mkContract(), 'maker')
    expect(out.ok).toBe(false)
    expect(out.reason.code).toBe('runtime_offline')
    expect(invoke).not.toHaveBeenCalled()
    expect(reasons[0].code).toBe('runtime_offline')
  })

  it('深度超限 → 拦截 + max_depth_exceeded（routa delegation-depth 语义）', async () => {
    const reasons: DispatchOutcome['reason'][] = []
    // 必须注入 invokeAgent 桩：缺省时 dispatcher 走 CLI 兜底真实 spawn hermes
    // （subagent-dispatcher 的真实调用链），测试机会留下真实 agent 进程与 LLM 调用。
    const invoke = vi.fn(async () => 'ok')
    const d = new SubagentDispatcher({ invokeAgent: invoke, onDispatchReason: (_id, r) => reasons.push(r) })
    // 预置深度到上限（连续 5 层内嵌）
    for (let i = 0; i < 5; i++) {
      const p = d.dispatchWithOutcome(mkContract({ id: `c${i}` }), 'maker')
      void p // 不 await，制造嵌套
    }
    // 手工把 depth 顶到 5：连续同步 await 五层（每层 await 完会减，故直接模拟 6 层并发）
    const deep = new SubagentDispatcher({ invokeAgent: invoke, onDispatchReason: (_id, r) => reasons.push(r) })
    const pending: Array<Promise<DispatchOutcome>> = []
    for (let i = 0; i < 5; i++) pending.push(deep.dispatchWithOutcome(mkContract({ id: `x${i}` }), 'maker'))
    const out6 = await deep.dispatchWithOutcome(mkContract({ id: 'x6' }), 'maker')
    expect(out6.ok).toBe(false)
    expect(out6.reason.code).toBe('max_depth_exceeded')
    await Promise.all(pending)
  }, 15000)

  it('放行 → handed_off + invoke 被调', async () => {
    const reasons: DispatchOutcome['reason'][] = []
    const invoke = vi.fn(async () => 'ok')
    const d = new SubagentDispatcher({ invokeAgent: invoke, onDispatchReason: (_id, r) => reasons.push(r) })
    const out = await d.dispatchWithOutcome(mkContract(), 'maker')
    expect(out.ok).toBe(true)
    expect(out.reason.code).toBe('handed_off')
    expect(invoke).toHaveBeenCalledOnce()
    expect(reasons.some(r => r.code === 'handed_off')).toBe(true)
  })
})

describe('ia2 reason 投影（buildLoopRows 第三参 contracts）', () => {
  it('loop 取其下 contract 最高优先级 reason（拦截类 > handed_off）', async () => {
    const { buildLoopRows } = await import('../../../../client/ia2/adapters/flow')
    const loops = [{ id: 'l1', name: 'L', stage: 'handoff', status: 'running', updatedAt: '' }] as never
    const contracts = [
      { id: 'c1', loopId: 'l1', dispatchReason: 'handed_off', dispatchReasonDetail: null },
      { id: 'c2', loopId: 'l1', dispatchReason: 'runtime_offline', dispatchReasonDetail: 'unhealthy' },
    ] as never
    const rows = buildLoopRows(loops, 0, contracts)
    expect(rows[0].dispatchReason).toBe('runtime_offline')
    expect(rows[0].dispatchReasonDetail).toBe('unhealthy')
  })

  it('无 reason → null；空 contracts 不炸', async () => {
    const { buildLoopRows } = await import('../../../../client/ia2/adapters/flow')
    const loops = [{ id: 'l1', name: 'L', stage: 'handoff', status: 'running', updatedAt: '' }] as never
    expect(buildLoopRows(loops, 0, [])[0].dispatchReason).toBeNull()
    expect(buildLoopRows(loops, 0)[0].dispatchReason).toBeNull()
  })
})

describe('patch 352 漂移守卫', () => {
  // 从 custom/server/loop/engine/__tests__ 上溯到 overlay 根：../../../../..
  const overlayRoot = resolve(__dirname, '../../../../..')

  it('352 双语含 ia2.dispatch 12 键；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/352-client-i18n-ia2-dispatch-reason.patch'), 'utf8')
    for (const key of ['runtime_offline', 'max_depth_exceeded', 'gate_pending_human', 'lease_conflict', 'board_concurrency_full']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('352-client-i18n-ia2-dispatch-reason.patch')
    // 未注入检出（worktree/CI）回落 series 登记：守卫语义=补丁已登记进 overlay 补丁集
    const manifest = existsSync(resolve(overlayRoot, '.overlay-injected.json'))
      ? JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
      : { appliedPatches: readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) }
    expect(manifest.appliedPatches).toContain('352-client-i18n-ia2-dispatch-reason.patch')
  })

  it('loop-engine 人机分工门禁存在（in_review 待人审 + gate_pending_human 事件）', () => {
    const eng = readFileSync(resolve(overlayRoot, 'custom/server/loop/engine/loop-engine.ts'), 'utf8')
    expect(eng).toContain('gateHumanReview')
    expect(eng).toContain("reason: 'gate_pending_human'")
    expect(eng).toContain("status: 'submitted'")
    expect(eng).toContain('dispatchWithOutcome')
  })

  it('types 含 dispatchReason 字段 + dispatch-blocked 事件', () => {
    const types = readFileSync(resolve(overlayRoot, 'custom/server/loop/types.ts'), 'utf8')
    expect(types).toContain('dispatchReason?: string | null')
    expect(types).toContain("type: 'loop.dispatch-blocked'")
  })
})
