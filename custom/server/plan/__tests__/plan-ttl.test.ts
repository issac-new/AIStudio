// Plan Mode TTL（2026-11-05 AI Native 吸收批 T3：计划卡死六死法之一）＋
// pr-babysitter 轮询上限＋plan.stale 检测器。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  requestPlanMode, decidePlan, listRequested, listAllPlans, expireStalePlans, planTtlMs,
} from '../../plan/plan-mode'
import { PATTERN_TEMPLATES } from '../../loop/types'
import { detectPlanStale } from '../../clusterinspector/detectors'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-ttl-'))
  process.env.HERMES_PLAN_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_PLAN_DIR
  delete process.env.PLAN_TTL_MS
  rmSync(dir, { recursive: true, force: true })
})

describe('plan TTL（requested 悬挂不可能）', () => {
  it('TTL 内 requested 正常可裁决', () => {
    const p = requestPlanMode({ planId: 'fresh', fromAgent: 'a', planText: 'x' })
    expect(p.state).toBe('requested')
    expect(listRequested().map((x) => x.planId)).toEqual(['fresh'])
    const ok = decidePlan('fresh', 'confirmed', 'human')
    expect('state' in ok && ok.state).toBe('confirmed')
  })

  it('超 TTL 自动转 expired 且不可再裁决', () => {
    process.env.PLAN_TTL_MS = '50'
    const p = requestPlanMode({ planId: 'old', fromAgent: 'a', planText: 'x' })
    // 手工把 at 拨回 1 小时前（模拟悬挂）
    const file = join(dir, 'old.json')
    const body = JSON.parse(JSON.stringify(p))
    body.at = Date.now() - 3600_000
    writeFileSync(file, JSON.stringify(body))
    const expired = expireStalePlans()
    expect(expired.map((x) => x.planId)).toEqual(['old'])
    const again = decidePlan('old', 'confirmed', 'human')
    expect('error' in again && again.error).toContain('expired')
    expect(listRequested()).toEqual([]) // expired 不再占队列
    expect(listAllPlans().find((x) => x.planId === 'old')?.state).toBe('expired')
  })

  it('listRequested 惰性过期（读路径执法）', async () => {
    process.env.PLAN_TTL_MS = '30'
    requestPlanMode({ planId: 'lazy', fromAgent: 'a', planText: 'x' })
    await new Promise((r) => setTimeout(r, 60))
    expect(listRequested()).toEqual([])
    expect(listAllPlans().find((x) => x.planId === 'lazy')?.state).toBe('expired')
  })

  it('planTtlMs 环境覆盖与默认 30 分钟', () => {
    expect(planTtlMs()).toBe(30 * 60 * 1000)
    process.env.PLAN_TTL_MS = '1234'
    expect(planTtlMs()).toBe(1234)
    process.env.PLAN_TTL_MS = '-1'
    expect(planTtlMs()).toBe(30 * 60 * 1000) // 非法值回落默认
  })
})

describe('pr-babysitter 轮询上限（六死法·PR 守望）', () => {
  it('模板带 maxPollsWithoutChange=12 且停止条件写明升级', () => {
    const t = PATTERN_TEMPLATES['pr-babysitter']
    expect(t.maxPollsWithoutChange).toBe(12)
    expect(t.stopConditionTemplate).toContain('escalate to human')
  })
  it('非守望模板不强制该字段（可选）', () => {
    expect(PATTERN_TEMPLATES['daily-triage'].maxPollsWithoutChange).toBeUndefined()
  })
})

describe('detectPlanStale（plan.stale 检测器）', () => {
  const now = Date.now()
  it('未接线=合法空态', () => {
    expect(detectPlanStale({ ts: now } as never)).toEqual([])
    expect(detectPlanStale({ ts: now, planRequests: [] } as never)).toEqual([])
  })
  it('requested 悬挂超阈报 warn，≥2× 升 high', () => {
    const snap = {
      ts: now,
      planRequests: [
        { planId: 'p1', fromAgent: 'a', at: now - 31 * 60 * 1000, state: 'requested' },
        { planId: 'p2', fromAgent: 'b', at: now - 61 * 60 * 1000, state: 'requested' },
        { planId: 'p3', fromAgent: 'c', at: now - 60 * 1000, state: 'requested' }, // 未超阈不报
      ],
    }
    const out = detectPlanStale(snap as never)
    expect(out.map((a) => a.subject).sort()).toEqual(['plan:p1', 'plan:p2'])
    expect(out.find((a) => a.subject === 'plan:p1')?.severity).toBe('warn')
    expect(out.find((a) => a.subject === 'plan:p2')?.severity).toBe('high')
  })
  it('expired 计划报 warn（过期仍在悬挂=须重新申请）', () => {
    const out = detectPlanStale({ ts: now, planRequests: [{ planId: 'p9', fromAgent: 'a', at: now - 999999, state: 'expired' }] } as never)
    expect(out[0].detector).toBe('plan.stale')
    expect(out[0].severity).toBe('warn')
  })
})

describe('detectAll 注册', () => {
  it('detectAll 已接线 detectPlanStale（源级断言——detectAll 需全量快照，单元不造整快照）', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { resolve } = require('node:path') as typeof import('node:path')
    const src = readFileSync(resolve(__dirname, '../../clusterinspector/detectors.ts'), 'utf8')
    expect(src).toContain('...detectPlanStale(snap')
  })
})
