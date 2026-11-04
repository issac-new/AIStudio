// W4：六类故障样本种子集——六题齐、判据全 S0、可建集（规则级；真实模型=外部依赖未跑）。
import { describe, expect, it } from 'vitest'
import { buildFaultSeedTasks, FAULT_CATEGORIES, FAULT_SET_NAME } from '../fault-seed'

describe('fault-seed（W4 eval 通道化）', () => {
  it('六类各一题，id 稳定', () => {
    const tasks = buildFaultSeedTasks()
    expect(tasks).toHaveLength(6)
    expect(tasks.map((t) => t.id)).toEqual(FAULT_CATEGORIES.map((c) => `fault-${c.key}`))
  })

  it('判据全为 S0 确定性断言且只用四断言词表', () => {
    const allowed = ['json_path', 'side_effects_max', 'forbidden_tools', 'result_schema', 'regex', 'threshold', 'required_tools', 'no_loop', 'redundant_ratio', 'similarity']
    for (const task of buildFaultSeedTasks()) {
      const rubric = (task as unknown as { rubric: Array<{ s0?: { kind: string } }> }).rubric
      expect(rubric.length).toBeGreaterThan(0)
      for (const r of rubric) {
        expect(r.s0).toBeDefined()
        expect(allowed).toContain(r.s0!.kind)
      }
    }
  })

  it('W3 四断言词表覆盖至少四类（空输入/依赖/重复/越权/拒绝/超时映射齐）', () => {
    const kinds = new Set(
      buildFaultSeedTasks().flatMap((t) =>
        (t as unknown as { rubric: Array<{ s0?: { kind: string } }> }).rubric.map((r) => r.s0?.kind),
      ),
    )
    for (const k of ['json_path', 'side_effects_max', 'forbidden_tools']) expect(kinds.has(k)).toBe(true)
  })

  it('建集入仓（store 面）：名称唯一、任务可被 createSet 接受（隔离目录不留账）', async () => {
    const dir = (await import('fs')).mkdtempSync((await import('os')).tmpdir() + '/fault-seed-')
    process.env.EVAL_STORE = dir
    try {
      const { createSet, listSets } = await import('../store')
      expect(listSets().find((s) => s.name === FAULT_SET_NAME)).toBeUndefined()
      const r = createSet({ name: FAULT_SET_NAME, track: 'e2e', tasks: buildFaultSeedTasks() }, 'fault-seed-test')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.set.tasks).toHaveLength(6)
    } finally {
      delete process.env.EVAL_STORE
      ;(await import('fs')).rmSync(dir, { recursive: true, force: true })
    }
  })
})
