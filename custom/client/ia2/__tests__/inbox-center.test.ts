// overlay/custom/client/ia2/__tests__/inbox-center.test.ts
// P3 Task 5 — 介入中心适配器重点测试：五源归一 / Triage 排序（等待×严重度）/
// 自动归档 7 天衰减 / 已分诊日切重置 / kv 纪律（畸形兜底、null storage）。
// 纯函数层：storage 一律注入内存实现，不耦合 DOM localStorage。
import { describe, it, expect } from 'vitest'
import {
  TRIAGE_KIND_WEIGHT, SEVERITY_FACTOR,
  triageScore, sortTriage,
  normalizeApprovals, normalizeTasks, normalizeAlarms, normalizeReminders,
  buildTriageEntries,
  loadTriagedMap, markTriaged, unmarkTriaged, pruneTriaged, writeTriagedMap, TRIAGED_KEY,
  loadResolvedMap, resolveEntry, pruneResolved, writeResolvedMap, RESOLVED_KEY, RESOLVE_DECAY_MS,
  projectTriage,
  type KvStorage,
  type TriageEntry,
  type ResolvedRecord,
} from '../adapters/inbox-center'

/** 内存 kv（隔离 localStorage；行为对照 runcenter inbox.ts 测试同款） */
function memStorage(): KvStorage & { dump(): Record<string, string> } {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) },
    dump: () => Object.fromEntries(m),
  }
}

const NOW = Date.parse('2026-09-10T12:00:00Z')
const TODAY = '2026-09-10'
const DAY = 86_400_000

function entryOf(partial: Partial<TriageEntry>): TriageEntry {
  return {
    id: 'x:1', kind: 'reminder', severity: 'low', title: 't', ts: 0, waitMs: 0,
    route: { path: '/app' }, ...partial,
  }
}

// ---------------------------------------------------------------------------
// 五源归一
// ---------------------------------------------------------------------------

describe('normalizeApprovals — 源①审批/中断', () => {
  it('awaiting run → high 审批条目：runId 深链 + graphId 副题 + 等待时长', () => {
    const [e] = normalizeApprovals([{
      runId: 'r1', graphId: 'g1',
      lastActivityAt: '2026-09-10T11:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    }], NOW)
    expect(e).toMatchObject({
      id: 'approval:r1', kind: 'approval', severity: 'high',
      title: 'r1', subtitle: 'g1', runId: 'r1',
      ts: Date.parse('2026-09-10T11:00:00Z'),
      waitMs: 3_600_000,
    })
    expect(e.route).toEqual({ name: 'ia2.runDetail', params: { runId: 'r1' } })
  })

  it('事件时刻缺失回落 updatedAt；两者皆坏 → waitMs 0 不为负', () => {
    const [fallback] = normalizeApprovals([{ runId: 'r1', graphId: '', lastActivityAt: null, updatedAt: '2026-09-10T09:00:00Z' }], NOW)
    expect(fallback.waitMs).toBe(3 * 3_600_000)
    expect(fallback.subtitle).toBeUndefined()
    const [bad] = normalizeApprovals([{ runId: 'r2', graphId: 'g', lastActivityAt: 'not-a-date', updatedAt: null }], NOW)
    expect(bad.waitMs).toBe(0)
    const [future] = normalizeApprovals([{ runId: 'r3', graphId: 'g', lastActivityAt: '2026-09-10T13:00:00Z', updatedAt: null }], NOW)
    expect(future.waitMs).toBe(0) // 时钟偏斜夹 0
  })
})

describe('normalizeTasks — 源②阻塞/源③待审', () => {
  it('blocked → high、review → medium；其余状态不进收件箱', () => {
    const entries = normalizeTasks([
      { id: 't1', title: '修登录', status: 'blocked', createdAt: NOW - 2 * DAY },
      { id: 't2', title: '审文案', status: 'review', createdAt: NOW - DAY },
      { id: 't3', title: '进行中', status: 'doing', createdAt: NOW - DAY },
    ], NOW)
    expect(entries.map(e => [e.id, e.kind, e.severity])).toEqual([
      ['task:t1', 'blocked', 'high'],
      ['task:t2', 'review', 'medium'],
    ])
    expect(entries[0].waitMs).toBe(2 * DAY)
    expect(entries[0].route).toEqual({ path: '/app/tasks' })
  })

  it('createdAt 不可考 → ts 0、waitMs 0（排同严重度末位，不炸）', () => {
    const [e] = normalizeTasks([{ id: 't9', title: '无时间', status: 'blocked', createdAt: null }], NOW)
    expect(e.ts).toBe(0)
    expect(e.waitMs).toBe(0)
  })
})

describe('normalizeAlarms — 源④熔断/停滞告警', () => {
  it('stuck → medium、escalated → high；每 loop 只留最近一条', () => {
    const entries = normalizeAlarms([
      { loopId: 'l1', events: [
        { type: 'loop.stuck', ts: NOW - 3 * DAY },
        { type: 'loop.stuck', ts: NOW - DAY },       // 更近 → 胜出
        { type: 'loop.tick-complete', ts: NOW - 1 }, // 非告警忽略
      ] },
      { loopId: 'l2', events: [{ type: 'loop.escalated', ts: NOW - 2 * DAY }] },
    ], NOW, { l1: '晨检循环', l2: '部署循环' })
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ id: 'alarm:l1', kind: 'alarm', severity: 'medium', title: '晨检循环', ts: NOW - DAY })
    expect(entries[1]).toMatchObject({ id: 'alarm:l2', severity: 'high', title: '部署循环' })
    expect(entries[0].route).toEqual({ path: '/app/runs', query: { loop: 'l1' } })
  })

  it('同刻 escalated 与 stuck 并存取 escalated；全坏 ts / 无告警事件 → 不产条目', () => {
    const [tie] = normalizeAlarms([{ loopId: 'l1', events: [
      { type: 'loop.stuck', ts: NOW - DAY },
      { type: 'loop.escalated', ts: NOW - DAY },
    ] }], NOW)
    expect(tie.severity).toBe('high')

    const none = normalizeAlarms([
      { loopId: 'l2', events: [{ type: 'loop.stuck', ts: 'bad' }] },
      { loopId: 'l3', events: [{ type: 'loop.tick-complete', ts: NOW }] },
    ], NOW)
    expect(none).toEqual([])
  })
})

describe('normalizeReminders — 源⑤待办提醒', () => {
  it('今日待办 ∪ 闹钟已到的待办进入；未来日程不进', () => {
    const entries = normalizeReminders([
      { id: 'a', title: '今日无闹钟', date: TODAY },                                        // 今日 → 进
      { id: 'b', title: '今日稍后闹钟', date: TODAY, remindAt: NOW + 3_600_000 },           // 今日（闹钟未到）→ 进
      { id: 'c', title: '昨日逾期闹钟', date: '2026-09-09', remindAt: NOW - DAY },          // 闹钟已过 → 进
      { id: 'd', title: '明日待办', date: '2026-09-11', remindAt: null },                   // 未来 → 不进
      { id: 'e', title: '昨日无闹钟', date: '2026-09-09', remindAt: null },                 // 非今日且无闹钟 → 不进
    ], NOW, TODAY)
    expect(entries.map(e => e.id)).toEqual(['todo:a', 'todo:b', 'todo:c'])
    expect(entries.every(e => e.severity === 'low' && e.kind === 'reminder')).toBe(true)
  })

  it('闹钟时刻为排序时刻；无闹钟回落日期（零点）', () => {
    const [withAlarm] = normalizeReminders([{ id: 'a', title: 'x', date: TODAY, remindAt: NOW - 1_800_000 }], NOW, TODAY)
    expect(withAlarm.ts).toBe(NOW - 1_800_000)
    expect(withAlarm.waitMs).toBe(1_800_000)
    const [byDate] = normalizeReminders([{ id: 'b', title: 'y', date: TODAY }], NOW, TODAY)
    expect(byDate.ts).toBe(Date.parse(TODAY))
  })
})

// ---------------------------------------------------------------------------
// 排序：等待时长 × 严重度
// ---------------------------------------------------------------------------

describe('triageScore / sortTriage', () => {
  it('score = waitMs × severityFactor（词表锚定：high4 medium2 low1）', () => {
    expect(SEVERITY_FACTOR).toEqual({ high: 4, medium: 2, low: 1 })
    expect(TRIAGE_KIND_WEIGHT).toEqual({ approval: 0, blocked: 1, review: 2, alarm: 3, reminder: 4 })
    expect(triageScore({ waitMs: 1_000, severity: 'high' })).toBe(4_000)
    expect(triageScore({ waitMs: 1_000, severity: 'low' })).toBe(1_000)
  })

  it('久等低severity 升到 短等高severity 之前；同分回源权重（审批先于阻塞）', () => {
    const sorted = sortTriage([
      entryOf({ id: 'a', kind: 'blocked', severity: 'high', waitMs: 1_000, ts: 100 }),   // 4000
      entryOf({ id: 'b', kind: 'reminder', severity: 'low', waitMs: 9_000, ts: 200 }),   // 9000
      entryOf({ id: 'c', kind: 'approval', severity: 'high', waitMs: 1_000, ts: 300 }),  // 4000 同分
      entryOf({ id: 'd', kind: 'review', severity: 'medium', waitMs: 1_000, ts: 400 }),  // 2000
    ])
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('同分同权重按 ts 升序、再按 id 确定性收尾；不改入参', () => {
    const input = [
      entryOf({ id: 'z', kind: 'blocked', severity: 'high', waitMs: 500, ts: 20 }),
      entryOf({ id: 'y', kind: 'blocked', severity: 'high', waitMs: 500, ts: 10 }),
    ]
    const snapshot = [...input]
    expect(sortTriage(input).map(e => e.id)).toEqual(['y', 'z'])
    expect(input).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// 聚合
// ---------------------------------------------------------------------------

describe('buildTriageEntries — 五源聚合', () => {
  it('五源全归一、默认排序输出（今日键缺省取 now 当日）', () => {
    const entries = buildTriageEntries({
      approvals: [{ runId: 'r1', graphId: 'g', lastActivityAt: null, updatedAt: '2026-09-10T11:00:00Z' }],
      tasks: [{ id: 't1', title: '阻塞', status: 'blocked', createdAt: NOW - DAY }],
      alarms: [{ loopId: 'l1', events: [{ type: 'loop.stuck', ts: NOW - 2 * 3_600_000 }] }],
      reminders: [{ id: 'td1', title: '待办', date: TODAY }],
    }, NOW)
    // 得分锚定：blocked 1d×4=3.46e8 > reminder 午夜起 12h×1=1.73e8
    //   > approval 1h×4=1.44e7 = 同分 alarm 2h×2=1.44e7（同分回源权重，审批在前）
    expect(entries.map(e => e.kind)).toEqual(['blocked', 'reminder', 'approval', 'alarm'])
  })
})

// ---------------------------------------------------------------------------
// kv 纪律
// ---------------------------------------------------------------------------

describe('kv 纪律 — 已分诊/归档', () => {
  it('null storage：读取空、写入静默不抛', () => {
    expect(loadTriagedMap(null)).toEqual({})
    expect(loadResolvedMap(null)).toEqual({})
    expect(() => markTriaged('x', TODAY, null)).not.toThrow()
    expect(() => resolveEntry('x', entryOf({ id: 'x' }), new Date(NOW).toISOString(), null)).not.toThrow()
  })

  it('畸形 JSON / 非对象 / 数组载荷按空兜底；非字符串值过滤', () => {
    const s = memStorage()
    s.setItem(TRIAGED_KEY, '{broken')
    expect(loadTriagedMap(s)).toEqual({})
    s.setItem(TRIAGED_KEY, '["array"]')
    expect(loadTriagedMap(s)).toEqual({})
    s.setItem(TRIAGED_KEY, JSON.stringify({ a: 'ok', b: 42, c: null }))
    expect(loadTriagedMap(s)).toEqual({ a: 'ok' })
    s.setItem(RESOLVED_KEY, '"string"')
    expect(loadResolvedMap(s)).toEqual({})
    s.setItem(RESOLVED_KEY, JSON.stringify({ a: { ts: 'nope' }, b: { ts: '2026-09-10T00:00:00Z', entry: { id: 'b' } } }))
    expect(Object.keys(loadResolvedMap(s))).toEqual(['b'])
  })

  it('markTriaged 持久化、unmarkTriaged 移除；resolveEntry 重复记录只更新时刻', () => {
    const s = memStorage()
    expect(markTriaged('e1', TODAY, s)['e1']).toBe(TODAY)
    expect(loadTriagedMap(s)).toEqual({ e1: TODAY })
    unmarkTriaged('e1', s)
    expect(loadTriagedMap(s)).toEqual({})

    const entry = entryOf({ id: 'e2' })
    resolveEntry('e2', entry, '2026-09-09T00:00:00Z', s)
    resolveEntry('e2', entry, '2026-09-10T00:00:00Z', s)
    const resolved = loadResolvedMap(s)
    expect(resolved['e2'].ts).toBe('2026-09-10T00:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// 自动归档：7 天衰减
// ---------------------------------------------------------------------------

describe('pruneResolved — 7 天衰减', () => {
  it('超 7 天丢弃、窗内保留、边界（恰好 7 天）保留', () => {
    const map: Record<string, ResolvedRecord> = {
      fresh: { ts: new Date(NOW - DAY).toISOString(), entry: entryOf({ id: 'fresh' }) },
      edge: { ts: new Date(NOW - RESOLVE_DECAY_MS).toISOString(), entry: entryOf({ id: 'edge' }) },
      stale: { ts: new Date(NOW - RESOLVE_DECAY_MS - 1).toISOString(), entry: entryOf({ id: 'stale' }) },
      broken: { ts: 'not-a-date', entry: entryOf({ id: 'broken' }) },
    }
    expect(Object.keys(pruneResolved(map, NOW))).toEqual(['fresh', 'edge'])
  })

  it('衰减窗口可注入（测试短窗）', () => {
    const map = { a: { ts: new Date(NOW - 50).toISOString(), entry: entryOf({ id: 'a' }) } }
    expect(pruneResolved(map, NOW, 100)['a']).toBeDefined()
    expect(pruneResolved(map, NOW, 10)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// 日切重置 + 分诊投影
// ---------------------------------------------------------------------------

describe('projectTriage — 待处理/已分诊两视图', () => {
  const live = [
    entryOf({ id: 'approval:r1', kind: 'approval', severity: 'high', waitMs: DAY, ts: NOW - DAY }),
    entryOf({ id: 'task:t1', kind: 'blocked', severity: 'high', waitMs: 2 * DAY, ts: NOW - 2 * DAY }),
    entryOf({ id: 'todo:z', kind: 'reminder', severity: 'low', waitMs: 3_600_000, ts: NOW - 3_600_000 }),
  ]

  it('今日分诊标记 → 条目移入 done（origin triaged），其余留在 pending 已排序', () => {
    const p = projectTriage(live, {
      triaged: { 'approval:r1': TODAY }, resolved: {}, dayKey: TODAY, now: NOW,
    })
    expect(p.pending.map(e => e.id)).toEqual(['task:t1', 'todo:z'])
    expect(p.done).toHaveLength(1)
    expect(p.done[0]).toMatchObject({ origin: 'triaged' })
    expect(p.done[0].entry.id).toBe('approval:r1')
  })

  it('日切自动重置：昨天的标记次日失效，条目回到待处理', () => {
    const p = projectTriage(live, {
      triaged: { 'approval:r1': '2026-09-09' }, resolved: {}, dayKey: TODAY, now: NOW,
    })
    expect(p.pending.map(e => e.id)).toContain('approval:r1')
    expect(p.done).toEqual([])
  })

  it('归档快照进 done（origin archived）；衰减后从 done 消失', () => {
    // 现实场景：审批 run 恢复 → 条目离开活源（entries 不再含它），离场时记录快照
    const afterResume = [live[1], live[2]]
    const resolved: Record<string, ResolvedRecord> = {
      'approval:r1': { ts: new Date(NOW - DAY).toISOString(), entry: live[0] },
    }
    const fresh = projectTriage(afterResume, { triaged: {}, resolved, dayKey: TODAY, now: NOW })
    expect(fresh.pending.map(e => e.id)).toEqual(['task:t1', 'todo:z'])
    expect(fresh.done[0]).toMatchObject({ origin: 'archived' })
    expect(fresh.done[0].entry.id).toBe('approval:r1') // 快照在源消失后仍可渲染

    const decayed = projectTriage(afterResume, {
      triaged: {}, resolved, dayKey: TODAY, now: NOW + RESOLVE_DECAY_MS + 1,
    })
    expect(decayed.done).toEqual([]) // 7 天衰减：从列表消失
    expect(decayed.pending.map(e => e.id)).toEqual(['task:t1', 'todo:z'])
  })

  it('归档条目重现于活源（同一 run 再次中断）→ 回待处理，不背归档包袱', () => {
    const resolved: Record<string, ResolvedRecord> = {
      'approval:r1': { ts: new Date(NOW - DAY).toISOString(), entry: live[0] },
    }
    const p = projectTriage(live, { triaged: {}, resolved, dayKey: TODAY, now: NOW })
    expect(p.pending.map(e => e.id)).toContain('approval:r1')
    // done 只有快照，无 triaged 标记的活条目
    expect(p.done.filter(d => d.origin === 'triaged')).toEqual([])
  })

  it('同 id 双态去重：手动分诊优先于归档', () => {
    const resolved: Record<string, ResolvedRecord> = {
      'approval:r1': { ts: new Date(NOW - DAY).toISOString(), entry: live[0] },
    }
    const p = projectTriage(live, {
      triaged: { 'approval:r1': TODAY }, resolved, dayKey: TODAY, now: NOW,
    })
    expect(p.done).toHaveLength(1)
    expect(p.done[0].origin).toBe('triaged')
  })

  it('pruneTriaged 只留当日键（写回裁剪防无界）', () => {
    expect(pruneTriaged({ a: TODAY, b: '2026-09-01', c: '2026-09-09' }, TODAY)).toEqual({ a: TODAY })
  })

  it('writeTriagedMap / writeResolvedMap 整体落盘（prune 后写回）', () => {
    const s = memStorage()
    markTriaged('old', '2026-09-01', s)
    writeTriagedMap(pruneTriaged(loadTriagedMap(s), TODAY), s)
    expect(loadTriagedMap(s)).toEqual({})

    resolveEntry('gone', entryOf({ id: 'gone' }), new Date(NOW - RESOLVE_DECAY_MS - 1).toISOString(), s)
    resolveEntry('kept', entryOf({ id: 'kept' }), new Date(NOW - DAY).toISOString(), s)
    writeResolvedMap(pruneResolved(loadResolvedMap(s), NOW), s)
    expect(Object.keys(loadResolvedMap(s))).toEqual(['kept'])
  })
})
