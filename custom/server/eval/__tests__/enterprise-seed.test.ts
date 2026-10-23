// 企业级约束种子库守门（2026-10-23 挂账清偿 G3）。
// 腾讯文误区十一：权限边界/长周期交互/行业合规三轴在学术 benchmark 缺位。
import { describe, it, expect } from 'vitest'
import {
  ENTERPRISE_AXES, ENTERPRISE_SET_NAME, ENTERPRISE_TASK_AXES,
  axesCoverage, buildEnterpriseSeedTasks,
} from '../enterprise-seed'

describe('种子任务', () => {
  const tasks = buildEnterpriseSeedTasks()

  it('9 任务三轴各 3；映射表全覆盖无遗漏', () => {
    expect(tasks).toHaveLength(9)
    for (const axis of ENTERPRISE_AXES) {
      const n = tasks.filter((t) => ENTERPRISE_TASK_AXES[t.id] === axis.key).length
      expect(n, axis.key).toBe(3)
    }
    expect(Object.keys(ENTERPRISE_TASK_AXES).sort()).toEqual(tasks.map((t) => t.id).sort())
  })

  it('risk 断言 expect 全为 no（红线复用既有校验）；每轴 ≥1 条 S0 机械判', () => {
    for (const t of tasks) {
      for (const a of t.rubric) {
        if (a.kind === 'risk') expect(a.expect, `${t.id}/${a.id}`).toBe('no')
      }
    }
    for (const axis of ENTERPRISE_AXES) {
      const axisTasks = tasks.filter((t) => ENTERPRISE_TASK_AXES[t.id] === axis.key)
      const s0 = axisTasks.reduce((n, t) => n + t.rubric.filter((a) => a.s0).length, 0)
      expect(s0, axis.key).toBeGreaterThan(0)
    }
  })

  it('S0 regex 可编译（种子不埋坏模式）', () => {
    for (const t of tasks) {
      for (const a of t.rubric) {
        if (a.s0?.kind === 'regex') expect(() => new RegExp(a.s0.pattern)).not.toThrow()
      }
    }
  })

  it('problem/expectedBehavior 非空且具体（内容纪律：可验证场景非口号）', () => {
    for (const t of tasks) {
      expect(t.problem.length).toBeGreaterThan(20)
      expect(t.expectedBehavior.length).toBeGreaterThan(10)
    }
  })
})

describe('axesCoverage 覆盖读数', () => {
  it('全轴覆盖：三轴各 3 任务、s0 计数>0、无 gap 无未归类', () => {
    const r = axesCoverage(buildEnterpriseSeedTasks())
    expect(r.gaps).toEqual([])
    expect(r.unmapped).toEqual([])
    expect(r.axes.find((a) => a.axis === 'permission')!.taskCount).toBe(3)
    expect(r.axes.every((a) => a.s0Count > 0)).toBe(true)
  })

  it('缺轴如实列 gap；映射表外任务列 unmapped（不臆断）', () => {
    const only = buildEnterpriseSeedTasks().filter((t) => ENTERPRISE_TASK_AXES[t.id] === 'permission')
    const r = axesCoverage(only)
    expect(r.gaps.sort()).toEqual(['compliance', 'long_horizon'])
    const r2 = axesCoverage([{ ...only[0], id: 'unknown-task' }])
    expect(r2.unmapped).toEqual(['unknown-task'])
  })

  it('空任务集：三轴全 gap', () => {
    const r = axesCoverage([])
    expect(r.gaps).toHaveLength(3)
  })
})

describe('建集输入校验（与 store.createSet 契约一致）', () => {
  it('集名稳定（幂等建集的锚）', () => {
    expect(ENTERPRISE_SET_NAME).toBe('企业级约束种子库·v1')
  })
})
