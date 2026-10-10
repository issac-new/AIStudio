// overlay/custom/server/governance/__tests__/capacity-analytics.test.ts
// 容量分析守门（2026-10-10 麦肯锡概念三轮）：临时 HERMES_HOME 假库聚合——
// 人/Agent 分类（-agent 后缀）、估算人日分桶、已完成交付人日、实际人日（墙上时长）、
// 时间窗过滤（创建/完成任一在窗内）、估算覆盖率诚实口径（未估算不折算）。
import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { capacityOverview } from '../capacity-analytics'

const home = mkdtempSync(join(tmpdir(), 'cap-test-'))
const DAY = 86400
const nowS = Math.floor(Date.now() / 1000)

function seedBoard(rel: string, rows: Array<[string, string, number, number | null, number | null, number | null]>): void {
  // [assignee, status, created_at, started_at, completed_at, estimate_days]
  const dir = join(home, rel === '.' ? '' : rel)
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir === home ? home : dir, 'kanban.db'))
  db.exec('CREATE TABLE IF NOT EXISTS tasks (assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, estimate_days REAL)')
  const ins = db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)')
  for (const r of rows) ins.run(...(r as never[]))
  db.close()
}

afterAll(() => { rmSync(home, { recursive: true, force: true }) })

describe('capacityOverview', () => {
  it('聚合/分类/窗过滤/覆盖率全链路如实', async () => {
    seedBoard('.', [
      // 人：估算 0.5+1.0；一张完成（实际 1 天墙长）
      ['chen', 'done', nowS - 5 * DAY, nowS - 5 * DAY, nowS - 4 * DAY, 0.5],
      ['chen', 'running', nowS - 1 * DAY, nowS - 1 * DAY, null, 1.0],
      // Agent：估算 2.0 全部完成（实际 3 天墙长）→ agentDeliveredDays=2.0
      ['hu-agent', 'done', nowS - 6 * DAY, nowS - 6 * DAY, nowS - 3 * DAY, 2.0],
      // 未指派：无估算（覆盖率分母计入、分子不计）
      [null, 'todo', nowS - 1 * DAY, null, null, null],
      // 窗外老卡（创建与完成均 > 30 天）：不进窗口
      ['chen', 'done', nowS - 60 * DAY, nowS - 60 * DAY, nowS - 59 * DAY, 9.0],
    ])
    seedBoard(join('kanban', 'boards', 'b1'), [
      ['wei', 'done', nowS - 2 * DAY, nowS - 2 * DAY, nowS - 1 * DAY, 0.5],
    ])

    const ov = await capacityOverview(30, home)
    const byName = new Map(ov.rows.map(r => [r.assignee, r]))
    expect(byName.get('chen')).toMatchObject({
      executor: 'human', total: 2, estimateDays: 1.5, deliveredDays: 0.5, actualDays: 1, doneCount: 1, inFlightCount: 1,
    })
    expect(byName.get('hu-agent')).toMatchObject({
      executor: 'agent', total: 1, estimateDays: 2, deliveredDays: 2, actualDays: 3, doneCount: 1,
    })
    expect(byName.get('(未指派)')).toMatchObject({ executor: 'unassigned', total: 1, estimateDays: 0 })
    expect(byName.get('wei')).toMatchObject({ executor: 'human', estimateDays: 0.5 })
    // 汇总：5 张窗内卡（b1 板 1 张 + 主库 4 张），4 张有估算
    expect(ov.summary.totalCards).toBe(5)
    expect(ov.summary.withEstimate).toBe(4)
    expect(ov.summary.coverage).toBeCloseTo(0.8, 1)
    expect(ov.summary.humanEstimateDays).toBe(2)      // chen 1.5 + wei 0.5
    expect(ov.summary.agentEstimateDays).toBe(2)
    expect(ov.summary.agentDeliveredDays).toBe(2)
    expect(ov.summary.actualDaysTotal).toBe(5)        // chen 1 + hu-agent 3 + wei 1
    expect(ov.note).toContain('-agent')
  })

  it('空库零卡不炸：coverage=0、rows 空', async () => {
    seedBoard('.', [])
    const ov = await capacityOverview(30, home)
    // 上一用例主库仍带 5 行——换独立空 home 验证
    const emptyHome = mkdtempSync(join(tmpdir(), 'cap-empty-'))
    try {
      mkdirSync(emptyHome, { recursive: true })
      const db = new DatabaseSync(join(emptyHome, 'kanban.db'))
      db.exec('CREATE TABLE IF NOT EXISTS tasks (assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, estimate_days REAL)')
      db.close()
      const ov2 = await capacityOverview(30, emptyHome)
      expect(ov2.rows).toEqual([])
      expect(ov2.summary.totalCards).toBe(0)
      expect(ov2.summary.coverage).toBe(0)
      expect(ov2.summary.agentDeliveredDays).toBe(0)
    } finally {
      rmSync(emptyHome, { recursive: true, force: true })
    }
  })
})
