import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
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

  it('人机团队成功率在批三结算口径前明确 unknown，不写 0/100', () => {
    const reading = humanAiTeamSuccess()
    expect(reading).toMatchObject({
      key: 'measure/human-ai-team-success',
      value: null,
      available: false,
      sample: 0,
      definition: HUMAN_AI_TEAM_SUCCESS_DEFINITION,
    })
    expect(reading.gap).toContain('OutcomeTeam/Settlement')
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
