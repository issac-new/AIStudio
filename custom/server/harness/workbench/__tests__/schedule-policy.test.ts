// 调度面测试（Harmony 吸收轮）：策略归一/校验/坏档隔离/bootstrap，以及它真的改变探测行为。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
const prevHome = process.env.HERMES_HOME

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sched-'))
  process.env.HERMES_HOME = dir
})
afterEach(() => {
  if (prevHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = prevHome
  rmSync(dir, { recursive: true, force: true })
})

describe('调度策略', () => {
  it('缺省值完整；归一化越界钳制；start==... 非法类型回落默认', async () => {
    const m = await import('../schedule-policy')
    expect(m.readSchedulePolicy(dir)).toEqual(m.DEFAULT_SCHEDULE_POLICY)
    const n = m.normalizeSchedulePolicy({ probeMaxTasks: 999, probeK: 0, probeConcurrency: 99, retryBackoffSeconds: -5 })
    expect(n.probeMaxTasks).toBe(50)
    expect(n.probeK).toBe(1)
    expect(n.probeConcurrency).toBe(8)
    expect(n.retryBackoffSeconds).toBe(0)
    const bad = m.normalizeSchedulePolicy({ probeMaxTasks: 'x' as unknown as number })
    expect(bad.probeMaxTasks).toBe(m.DEFAULT_SCHEDULE_POLICY.probeMaxTasks)
  })

  it('校验拒绝非对象与越界值，通过时返回归一化策略', async () => {
    const m = await import('../schedule-policy')
    expect(m.validateSchedulePolicy(null).valid).toBe(false)
    const bad = m.validateSchedulePolicy({ probeK: 99, probeConcurrency: 0 })
    expect(bad.valid).toBe(false)
    expect(bad.problems.length).toBe(2)
    const okv = m.validateSchedulePolicy({ probeMaxTasks: 3, probeK: 2 })
    expect(okv.valid).toBe(true)
    expect(okv.policy?.probeMaxTasks).toBe(3)
  })

  it('坏档隔离：损坏文件改名 .corrupt-* 后回默认，不覆写原内容', async () => {
    const m = await import('../schedule-policy')
    const file = m.scheduleFile(dir)
    writeFileSync(file, '{not json')
    expect(m.readSchedulePolicy(dir)).toEqual(m.DEFAULT_SCHEDULE_POLICY)
    const leftovers = (await import('node:fs')).readdirSync(dir).filter((f) => f.includes('.corrupt-'))
    expect(leftovers).toHaveLength(1)
  })

  it('bootstrap：缺席才创建（0600 缺省值），已存在不动', async () => {
    const m = await import('../schedule-policy')
    const r1 = m.ensureScheduleFile(dir)
    expect(r1.created).toBe(true)
    expect(existsSync(r1.file)).toBe(true)
    expect(JSON.parse(readFileSync(r1.file, 'utf8'))).toEqual(m.DEFAULT_SCHEDULE_POLICY)
    const r2 = m.ensureScheduleFile(dir)
    expect(r2.created).toBe(false)
  })
})

describe('调度面注册与写盘白名单', () => {
  it('scheduling 面为 managed；策略文件存在时才 available；只允许写 harness-schedule.json', async () => {
    const reg = await import('../surface-registry')
    const before = reg.collectSurfaces(dir).find((s) => s.key === 'scheduling')!
    expect(before.applyMode).toBe('managed')
    expect(before.available).toBe(false)

    const sp = await import('../schedule-policy')
    sp.ensureScheduleFile(dir)
    const after = reg.collectSurfaces(dir).find((s) => s.key === 'scheduling')!
    expect(after.available).toBe(true)
    expect(after.artifacts.samples).toContain('harness-schedule.json')

    expect(reg.resolveManagedTarget('scheduling', 'harness-schedule.json', dir).ok).toBe(true)
    expect(reg.resolveManagedTarget('scheduling', 'config.yaml', dir).ok).toBe(false)
    expect(reg.resolveManagedTarget('scheduling', '../escape.json', dir).ok).toBe(false)
  })
})

describe('策略真的改变探测行为', () => {
  it('策略 probeMaxTasks=2 时预算预估按 2 题算（默认 5 会算成 5 题）', async () => {
    const svc = await import('../service')
    const evalStore = await import('../../../eval/store')
    const sp = await import('../schedule-policy')

    process.env.HARNESS2_STORE = join(dir, 'wb', 'workbench.json')
    evalStore._useStoreDirForTests(join(dir, 'eval'))

    const set = evalStore.createSet({
      name: '调度预算集',
      track: 'e2e',
      tasks: Array.from({ length: 6 }, (_, i) => ({
        id: `t${i}`,
        problem: `p${i}`,
        expectedBehavior: 'e',
        rubric: [{ id: `a${i}`, text: 'ok', expect: 'yes', kind: 'result' }],
      })),
    })
    if (!set.ok) throw new Error(JSON.stringify(set))

    const created = await svc.createProposal({
      title: '调度面用',
      hypothesis: '改调度策略会改变探测题数',
      surfaceKey: 'skills',
      targetPath: null,
      mode: 'sequential',
      budgetCapUsd: 0.01,
      evidenceRefs: ['task:t1'],
      variants: [{ label: 'a', content: 'x' }, { label: 'b', content: 'y' }],
      createdBy: 't',
    })
    // 直接置为已批准（本测试只关心预算预估读的是策略文件）
    const store = await import('../store')
    await store.mutateStore((st) => {
      const p = st.proposals.find((x) => x.id === created.id)!
      p.status = 'approved'
    })

    sp.ensureScheduleFile(dir)
    writeFileSync(sp.scheduleFile(dir), JSON.stringify({ probeMaxTasks: 2, probeK: 1, probeConcurrency: 1, retryBackoffSeconds: 0 }))
    const err = await svc
      .startAutoProbe(created.id, { setId: set.set.id, estimatedCostPerTaskUsd: 0.01, spawnRun: async () => { throw new Error('预算闸应在派题前拦下，不该真的 spawn') } })
      .catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('× 2 题')

    // 换成默认策略（无文件）→ 按 5 题算
    rmSync(sp.scheduleFile(dir), { force: true })
    const err2 = await svc
      .startAutoProbe(created.id, { setId: set.set.id, estimatedCostPerTaskUsd: 0.01, spawnRun: async () => { throw new Error('预算闸应在派题前拦下，不该真的 spawn') } })
      .catch((e: Error) => e)
    expect((err2 as Error).message).toContain('× 5 题')
  })
})
