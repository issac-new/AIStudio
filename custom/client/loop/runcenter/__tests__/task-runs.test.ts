// overlay/custom/client/loop/runcenter/__tests__/task-runs.test.ts
// task-runs 纯函数投影守门：join 保真、排序、过滤三轴（2026-09-28 产品实操演示轮）。
import { describe, expect, it } from 'vitest'
import { filterTaskRunRows, toTaskRunRows } from '../adapters/task-runs'
import type { MindProjectionDto } from '../api'

const mind: MindProjectionDto = {
  available: true,
  thoughts: [
    { id: 't_a', title: '支付收银台 RFD-001：需求分析与冻结', status: 'completed', createdAt: '2026-09-25T01:00:00.000Z', board: null },
    { id: 't_b', title: '缺陷修复：TEST-FE 渠道拦截', status: 'ready', createdAt: '2026-09-26T01:00:00.000Z', board: null },
  ],
  runs: [
    { runId: '9', thoughtId: 't_a', status: 'completed', durationSec: 30, startedAt: '2026-09-25T02:00:00.000Z', endedAt: '2026-09-25T02:00:30.000Z', outcome: 'completed', summary: '需求冻结完成' },
    { runId: '10', thoughtId: 't_b', status: 'failed', durationSec: 5, startedAt: '2026-09-26T03:00:00.000Z', endedAt: '2026-09-26T03:00:05.000Z', outcome: 'failed', summary: '回归失败' },
    { runId: '11', thoughtId: 't_a', status: 'completed', durationSec: 12, startedAt: '2026-09-27T04:00:00.000Z', endedAt: '2026-09-27T04:00:12.000Z', outcome: 'completed', summary: null },
    // 孤儿 run：thoughtId 无对应任务——行保留、标题空，不静默丢弃
    { runId: '12', thoughtId: 't_gone', status: 'completed', durationSec: 1, startedAt: '2026-09-28T05:00:00.000Z', endedAt: '2026-09-28T05:00:01.000Z', outcome: 'completed', summary: '遗留' },
  ],
  relations: [],
}

describe('toTaskRunRows', () => {
  it('join 任务标题/状态；孤儿 run 行保留标题空', () => {
    const rows = toTaskRunRows(mind)
    expect(rows).toHaveLength(4)
    const orphan = rows.find(r => r.runId === '12')
    expect(orphan).toMatchObject({ taskId: 't_gone', taskTitle: null, taskStatus: null })
    expect(rows.find(r => r.runId === '9')?.taskTitle).toBe('支付收银台 RFD-001：需求分析与冻结')
  })

  it('按最近结束倒序（endedAt 缺失排最末）', () => {
    const rows = toTaskRunRows(mind)
    expect(rows.map(r => r.runId)).toEqual(['12', '11', '10', '9'])
  })
})

describe('filterTaskRunRows', () => {
  const rows = toTaskRunRows(mind)

  it('status 精确过滤', () => {
    expect(filterTaskRunRows(rows, { status: 'failed' }).map(r => r.runId)).toEqual(['10'])
  })

  it('query 对 taskId/runId/标题/摘要包含匹配（大小写不敏感）', () => {
    expect(filterTaskRunRows(rows, { query: 'RFD-001' }).map(r => r.runId)).toEqual(['11', '9'])
    expect(filterTaskRunRows(rows, { query: '回归' }).map(r => r.runId)).toEqual(['10'])
    expect(filterTaskRunRows(rows, { query: '  T_A ' }).map(r => r.runId)).toEqual(['11', '9'])
  })

  it('空过滤条件返回全量', () => {
    expect(filterTaskRunRows(rows, {})).toHaveLength(4)
  })
})
