import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { BUILTIN_METRICS } from '../../metricpolicy/store'
import {
  CAPABILITY_REUSE_RATE_DEFINITION,
  CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
  HUMAN_AI_TEAM_SUCCESS_DEFINITION,
  capabilityMetrics,
  capabilityReuseRate,
  capabilitySupplyLeadTime,
  humanAiTeamSuccess,
} from '../metrics'
import {
  _useOutcomeStoreForTests,
  appendEvent,
  confirmTeam,
  createContract,
  type CreateContractInput,
} from '../../outcome/outcome-store'
import type { OutcomeTeamMember } from '../../outcome/types'

let home = ''

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'capability-metrics-'))
  const makeDb = (path: string, tasks: Array<[string, string, number, string]>, runs: Array<[string, number]>) => {
    mkdirSync(join(path, '..'), { recursive: true })
    const db = new DatabaseSync(path)
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, skills TEXT)')
    db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
    for (const row of tasks) db.prepare('INSERT INTO tasks VALUES (?,?,?,?)').run(...row)
    for (const row of runs) db.prepare('INSERT INTO task_runs VALUES (?,?)').run(...row)
    db.close()
  }
  makeDb(join(home, 'kanban.db'), [
    ['t1', 'ready', 1, '["coding","review"]'],
    ['t2', 'ready', 3, '["coding"]'],
  ], [
    ['t1', 2],
    ['t2', 5],
  ])
  makeDb(join(home, 'kanban', 'boards', 'b1', 'kanban.db'), [
    ['t3', 'todo', 4, '["coding"]'],
  ], [])
  process.env.HERMES_HOME = home
})

afterAll(() => {
  delete process.env.HERMES_HOME
  if (home) rmSync(home, { recursive: true, force: true })
})

describe('能力组指标', () => {
  it('供给时效取创建到首次 run 的中位时长；无样本返回 unavailable', async () => {
    const reading = await capabilitySupplyLeadTime()
    expect(reading).toMatchObject({
      key: 'measure/capability-supply-lead-time',
      value: 1_500,
      unit: 'ms',
      sample: 2,
      available: true,
      definition: CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
    })
  })

  it('复用率按“被 ≥2 个看板调用”的标签数 / 有需求标签数计算', async () => {
    const reading = await capabilityReuseRate()
    expect(reading).toMatchObject({
      key: 'measure/capability-reuse-rate',
      value: 0.5,
      unit: '%',
      sample: 2,
      available: true,
      definition: CAPABILITY_REUSE_RATE_DEFINITION,
    })
  })

  it('复用率样本低于下限时 unavailable——单标签 0%/100% 是单点误导（审查 S3 修复）', async () => {
    const singleHome = mkdtempSync(join(tmpdir(), 'capability-metrics-single-'))
    const db = new DatabaseSync(join(singleHome, 'kanban.db'))
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, skills TEXT)')
    db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
    db.prepare('INSERT INTO tasks VALUES (?,?,?,?)').run('t9', 'ready', 1, '["coding"]')
    db.close()
    const prev = process.env.HERMES_HOME
    process.env.HERMES_HOME = singleHome
    try {
      const reading = await capabilityReuseRate()
      expect(reading.available).toBe(false)
      expect(reading.value).toBeNull()
      expect(reading.sample).toBe(1)
      expect(reading.gap).toContain('样本下限')
    } finally {
      if (prev === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = prev
      rmSync(singleHome, { recursive: true, force: true })
    }
  })


  it('三项一次取齐，且读数口径与登记簿逐字一致', async () => {
    const readings = await capabilityMetrics()
    expect(readings).toHaveLength(3)
    for (const reading of readings) {
      const def = BUILTIN_METRICS.find((metric) => metric.key === reading.key)
      expect(def?.definition).toBe(reading.definition)
    }
  })
})

// ── 人机团队成功率（2026-11-28）：批三的结果团队与结算早已落地，此前却恒返回「批三未落地」。
// 现按口径计算：同时含人与 Agent 成员的结果团队里，结算结论为「达成」的团队数 ÷ 同口径已结算团队数。
describe('人机团队成功率：按结果团队的结算计算', () => {
  const prevGraph = process.env.HERMES_DECISION_GRAPH
  const prevFlag = process.env.OUTCOME_WORKBENCH
  let dir = ''
  let seq = 0

  // confirmTeam 会触发决策落账的后台任务；单测不碰宿主状态，与 outcome-store 测试同款关闸。
  beforeAll(() => { process.env.HERMES_DECISION_GRAPH = '0' })
  afterAll(() => {
    if (prevGraph === undefined) delete process.env.HERMES_DECISION_GRAPH; else process.env.HERMES_DECISION_GRAPH = prevGraph
    if (prevFlag === undefined) delete process.env.OUTCOME_WORKBENCH; else process.env.OUTCOME_WORKBENCH = prevFlag
  })
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'human-ai-'))
    _useOutcomeStoreForTests(dir)
    process.env.OUTCOME_WORKBENCH = '1'
  })
  afterEach(() => {
    _useOutcomeStoreForTests(null)
    rmSync(dir, { recursive: true, force: true })
  })

  function contract(): CreateContractInput {
    const id = `oc-${++seq}`
    return {
      schemaVersion: 1,
      outcomeId: id,
      rootTaskId: `task-${seq}`,
      version: 1,
      title: '人机协作交付',
      valueStatement: '让人与 Agent 协作完成一项业务结果',
      ownerPersonId: 'p-1',
      measures: [{
        measureId: 'm-1', name: '按时交付', definition: '是否在期限前交付', unit: '件',
        operator: 'gte', baseline: null, target: 1, sourceRef: 'kanban://task',
      }],
      acceptance: { statements: [], requiredEvidenceKinds: [] },
      scope: { included: ['协作交付'], excluded: [] },
      riskTier: 'low',
      defaultReversibility: 'reversible',
      verificationOwnerId: 'p-2',
      contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
      learningOptIn: false,
      status: 'draft',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }
  }

  const PERSON: OutcomeTeamMember = { subjectKind: 'person', subjectId: 'p-3', role: 'member', responsibility: '业务判断' }
  const AGENT: OutcomeTeamMember = { subjectKind: 'agent', subjectId: 'agent-1', role: 'member', responsibility: '执行' }

  /** 造一个带团队、带结算的结果。members 缺省＝人与 Agent 各一。verdict=null 表示不结算。 */
  function settled(verdict: 'achieved' | 'partial' | 'missed' | 'unknown' | null, members: OutcomeTeamMember[] | null = [PERSON, AGENT], settlementId?: string): string {
    const c = contract()
    expect(createContract(c, 'p-1').ok).toBe(true)
    if (members) {
      const t = confirmTeam(c.outcomeId, { expectedVersion: 0, members, status: 'active', changeReason: '组队' }, 'p-1')
      expect(t.ok, JSON.stringify(t)).toBe(true)
    }
    if (verdict) {
      const sid = settlementId ?? `set-${c.outcomeId}`
      const e = appendEvent(c.outcomeId, 'settlement_signed', {
        settlementId: sid, verdict,
        settlement: { settlementId: sid, outcomeId: c.outcomeId, contractVersion: 1, verdict, rationale: '理由足够长的一段话用于结算签署', measurementIds: [], signedBy: 'p-1', signedAt: 1700000200000 },
      }, 'p-1', 1)
      expect(e.ok, JSON.stringify(e)).toBe(true)
    }
    return c.outcomeId
  }

  it('结果工作台未启用：如实标未启用，不读数据、不写 0 或 100', () => {
    delete process.env.OUTCOME_WORKBENCH
    settled('achieved')
    const reading = humanAiTeamSuccess()
    expect(reading).toMatchObject({ key: 'measure/human-ai-team-success', value: null, available: false, sample: 0 })
    expect(reading.gap).toContain('未启用')
    expect(reading.gap).not.toContain('批三未落地')
  })

  it('两支人机团队一支达成：成功率 50%，样本 2', () => {
    settled('achieved')
    settled('missed')
    const reading = humanAiTeamSuccess()
    expect(reading).toMatchObject({ value: 0.5, unit: '%', sample: 2, available: true })
    expect(reading.definition).toBe(HUMAN_AI_TEAM_SUCCESS_DEFINITION)
  })

  it('只有「达成」算成功：部分达成、未达成、未知都不算', () => {
    settled('achieved')
    settled('partial')
    settled('missed')
    settled('unknown')
    const reading = humanAiTeamSuccess()
    expect(reading.value).toBe(0.25)
    expect(reading.sample).toBe(4)
  })

  it('不是人机混编的团队不进出口径：纯人、纯 Agent、没有团队的结果都不计', () => {
    settled('achieved')
    settled('missed')
    settled('achieved', [PERSON, { ...PERSON, subjectId: 'p-4' }])  // 纯人
    settled('achieved', [AGENT, { ...AGENT, subjectId: 'agent-2' }])  // 纯 Agent
    settled('achieved', null)  // 没有团队
    const reading = humanAiTeamSuccess()
    expect(reading.sample).toBe(2)
    expect(reading.value).toBe(0.5)
  })

  it('没有结算的人机团队不进分母', () => {
    settled('achieved')
    settled(null)
    settled(null)
    const reading = humanAiTeamSuccess()
    expect(reading.sample).toBe(1)
  })

  it('合同修订后旧结算被取代：只算当前有效的那条', () => {
    const id = settled('achieved', undefined, 'set-old')
    appendEvent(id, 'settlement_superseded', { settlementId: 'set-old', reason: '合同修订' }, 'p-1', 2)
    appendEvent(id, 'settlement_signed', {
      settlementId: 'set-new', verdict: 'missed',
      settlement: { settlementId: 'set-new', outcomeId: id, contractVersion: 2, verdict: 'missed', rationale: '修订后重新结算的理由写在这里', measurementIds: [], signedBy: 'p-1', signedAt: 1700000300000 },
    }, 'p-1', 2)
    settled('achieved')
    const reading = humanAiTeamSuccess()
    expect(reading.sample).toBe(2)
    expect(reading.value).toBe(0.5)
  })

  it('旧结算被取代且尚未重新结算：该团队此刻没有有效结算，不进分母', () => {
    // 真实场景：合同修订后旧结算作废，结果责任人都还没重新结算。
    // 只认「最后一条有效结算」与只认「最后一条」在这里才会分道。
    const id = settled('achieved', undefined, 'set-old')
    appendEvent(id, 'settlement_superseded', { settlementId: 'set-old', reason: '合同修订' }, 'p-1', 2)
    settled('missed')
    settled('missed')
    const reading = humanAiTeamSuccess()
    expect(reading.sample).toBe(2)
    expect(reading.value).toBe(0)
  })

  it('没有同口径已结算团队：不可用并写明原因，不写 0% 也不写 100%', () => {
    settled(null)
    const reading = humanAiTeamSuccess()
    expect(reading).toMatchObject({ value: null, available: false, sample: 0 })
    expect(reading.gap).toContain('已结算')
    expect(reading.gap).not.toContain('批三未落地')
  })

  it('样本不足 2：算得出也不给单点比例（沿用复用率的样本纪律）', () => {
    settled('achieved')
    const reading = humanAiTeamSuccess()
    expect(reading).toMatchObject({ value: null, available: false, sample: 1 })
    expect(reading.gap).toContain('样本')
  })

  it('结果存储目录读不到：如实说读不到——结果域的读取函数会吞掉读失败，不能让它被看成「没有团队」', () => {
    settled('achieved')
    settled('achieved')
    // 把存储根指向一个普通文件：列目录必然失败。结果域的 listAllContracts 会把它吞成 []。
    const notADir = join(dir, 'not-a-directory')
    writeFileSync(notADir, 'x')
    _useOutcomeStoreForTests(notADir)
    try {
      const reading = humanAiTeamSuccess()
      expect(reading).toMatchObject({ value: null, available: false, sample: 0 })
      expect(reading.gap).toContain('读不到')
      expect(reading.gap).not.toContain('没有已结算')
    } finally {
      _useOutcomeStoreForTests(dir)
    }
  })
})
