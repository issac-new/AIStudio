// overlay/custom/client/ia2/views/records/__tests__/records-view.test.ts
// 执行记录面纯断言（AgentTeams 吸收批二）：api 层（URL 拼接/筛选参数序列化/
// fail-soft 回落，mock authFetch）+ utils/records 纯函数（outcome 徽标映射/
// 筛选序列化空值不下发/分页按钮状态矩阵/列表→详情路由解析/时间体量格式）。
// 视图挂载面不在本文件（E2E 面随 simharness 走查），此处只锁契约形状。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authFetchMock = vi.fn()
vi.mock('../../../../shared/http', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }))

const { listExecutionRecords, fetchDelegateDetail, fetchCodingDetail } = await import('../../../api/execution-records')
const {
  serializeRecordFilters, paginationState, outcomeBadgeClass, outcomeLabel, kindLabel,
  detailRouteOf, formatRecordTime, formatDurationLabel, formatLogBytes,
} = await import('../../../utils/records')

/** Response 形状桩（api 层只消费 ok/status/json/text） */
function res(status: number, body?: unknown, raw?: string): {
  ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string>
} {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body))
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (body ?? {}),
    text: async () => text,
  }
}

const REC = {
  v: 1,
  kind: 'delegate',
  runId: 'run-1',
  taskId: 't-1',
  outcome: 'success',
  startedAt: 1730000000000,
} as const

beforeEach(() => { authFetchMock.mockReset() })

describe('api：列表（GET /api/execution-records）', () => {
  it('空筛选只带默认 limit；URL 可核对', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true, records: [REC], total: 1, offset: 0, limit: 50, hasMore: false }))
    const out = await listExecutionRecords()
    expect(out).toEqual({ records: [REC], total: 1, offset: 0, limit: 50, hasMore: false })
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/execution-records?limit=50')
    expect(authFetchMock.mock.calls[0][1]).toBeUndefined()
  })

  it('非空筛选下发、空值不下发；offset>0 才下发；agent 空格走 encodeURIComponent', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true, records: [], total: 0, hasMore: true }))
    await listExecutionRecords(
      { kind: 'delegate', outcome: 'failed', agent: 'zcode 1', task: '   ' },
      { limit: 20, offset: 40 },
    )
    expect(authFetchMock.mock.calls[0][0]).toBe(
      '/api/execution-records?kind=delegate&outcome=failed&agent=zcode%201&limit=20&offset=40',
    )
  })

  it('records 缺席回落空数组、数值字段缺失归零（fail-soft 不猜数）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(listExecutionRecords()).resolves.toEqual({ records: [], total: 0, offset: 0, limit: 0, hasMore: false })
  })

  it('ok:false 视为契约违约抛错', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: false }))
    await expect(listExecutionRecords()).rejects.toThrow('执行记录列表获取失败')
  })

  it('非 2xx 非 JSON 响应按 json() 包装形态抛「路径 → 状态：正文」', async () => {
    authFetchMock.mockResolvedValue(res(502, undefined, 'bad gateway'))
    await expect(listExecutionRecords()).rejects.toThrow('/api/execution-records?limit=50 → 502：bad gateway')
  })
})

describe('api：委托详情（GET /delegate/:taskId）', () => {
  it('id 走 encodeURIComponent；四字段原样透传', async () => {
    const record = { ...REC, taskId: 't 9' }
    authFetchMock.mockResolvedValue(res(200, { ok: true, record, result: { answer: 'ok' }, logTail: ['a', 'b'], logBytes: 2048 }))
    const out = await fetchDelegateDetail('t 9')
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/execution-records/delegate/t%209')
    expect(out).toEqual({ record, result: { answer: 'ok' }, logTail: ['a', 'b'], logBytes: 2048 })
  })

  it('record/result 缺席回落 null（索引条目可能被窗口裁剪）', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true, logTail: 'not-array', result: 42 }))
    const out = await fetchDelegateDetail('t1')
    expect(out.record).toBeNull()
    expect(out.result).toBeNull()
    expect(out.logTail).toEqual([])
    expect(out.logBytes).toBe(0)
  })

  it('ok:false 抛错', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: false }))
    await expect(fetchDelegateDetail('t1')).rejects.toThrow('委托记录详情获取失败')
  })
})

describe('api：编码运行详情（GET /coding/:sessionId）', () => {
  it('session/usage/changes 原样透传', async () => {
    const changes = [{ run_id: 'r1', change_id: 'c1', files_changed: 2, additions: 10, deletions: 3 }]
    authFetchMock.mockResolvedValue(res(200, { ok: true, session: { model: 'glm' }, usage: { turns: 4 }, changes }))
    const out = await fetchCodingDetail('sess/1')
    expect(authFetchMock.mock.calls[0][0]).toBe('/api/execution-records/coding/sess%2F1')
    expect(out.session).toEqual({ model: 'glm' })
    expect(out.usage).toEqual({ turns: 4 })
    expect(out.changes).toEqual(changes)
  })

  it('全部缺席回落空形；ok:false 抛错', async () => {
    authFetchMock.mockResolvedValue(res(200, { ok: true }))
    await expect(fetchCodingDetail('s1')).resolves.toEqual({ record: null, session: null, usage: null, changes: [] })
    authFetchMock.mockResolvedValue(res(200, { ok: false }))
    await expect(fetchCodingDetail('s1')).rejects.toThrow('编码运行详情获取失败')
  })
})

describe('utils：筛选参数序列化（空值不下发）', () => {
  it('全空 → 仅默认 limit', () => {
    expect(serializeRecordFilters({}, undefined, undefined)).toBe('?limit=50')
    expect(serializeRecordFilters(undefined)).toBe('?limit=50')
  })

  it('limit 非法（0/负/NaN）回落默认页大小；向下取整', () => {
    expect(serializeRecordFilters({}, 0, 0)).toBe('?limit=50')
    expect(serializeRecordFilters({}, -5, 0)).toBe('?limit=50')
    expect(serializeRecordFilters({}, Number.NaN, 0)).toBe('?limit=50')
    expect(serializeRecordFilters({}, 20.9, 0)).toBe('?limit=20')
  })

  it('offset=0 不下发、>0 下发；空白字符串筛选值不下发', () => {
    expect(serializeRecordFilters({ kind: '  ' }, 10, 0)).toBe('?limit=10')
    expect(serializeRecordFilters({ kind: 'coding-run' }, 10, 10)).toBe('?kind=coding-run&limit=10&offset=10')
  })
})

describe('utils：outcome 徽标与文案', () => {
  it('四态各得各 class；未知值回落灰（照录不猜色）', () => {
    expect(outcomeBadgeClass('success')).toBe('rec-badge--success')
    expect(outcomeBadgeClass('failed')).toBe('rec-badge--failed')
    expect(outcomeBadgeClass('timeout')).toBe('rec-badge--timeout')
    expect(outcomeBadgeClass('blocked')).toBe('rec-badge--blocked')
    expect(outcomeBadgeClass('weird')).toBe('rec-badge--blocked')
  })

  it('文案 zh/en；未知 outcome 与 kind 原样展示', () => {
    expect(outcomeLabel('success')).toBe('成功')
    expect(outcomeLabel('blocked', 'en')).toBe('Blocked')
    expect(outcomeLabel('weird')).toBe('weird')
    expect(kindLabel('coding-run')).toBe('编码运行')
    expect(kindLabel('delegate', 'en')).toBe('Delegate')
    expect(kindLabel('other')).toBe('other')
  })
})

describe('utils：分页按钮状态矩阵', () => {
  it('offset=0 禁上一页；hasMore 控下一页；页码=offset/limit+1', () => {
    expect(paginationState(0, 50, true)).toEqual({ prevDisabled: true, nextDisabled: false, pageNo: 1 })
    expect(paginationState(50, 50, false)).toEqual({ prevDisabled: false, nextDisabled: true, pageNo: 2 })
    expect(paginationState(0, 50, false)).toEqual({ prevDisabled: true, nextDisabled: true, pageNo: 1 })
    expect(paginationState(100, 50, true)).toEqual({ prevDisabled: false, nextDisabled: false, pageNo: 3 })
  })

  it('负 offset 视作首页；limit 非法按 1 兜底不炸除法', () => {
    expect(paginationState(-30, 50, true)).toEqual({ prevDisabled: true, nextDisabled: false, pageNo: 1 })
    expect(paginationState(3, 0, true)).toEqual({ prevDisabled: false, nextDisabled: false, pageNo: 4 })
  })
})

describe('utils：列表 → 详情路由解析', () => {
  it('delegate 按 taskId、coding-run 按 sessionId', () => {
    expect(detailRouteOf({ kind: 'delegate', taskId: 't-1' })).toEqual({
      name: 'ia2.recordDetail',
      params: { kind: 'delegate', id: 't-1' },
    })
    expect(detailRouteOf({ kind: 'coding-run', sessionId: 's-1' })).toEqual({
      name: 'ia2.recordDetail',
      params: { kind: 'coding-run', id: 's-1' },
    })
  })

  it('定位键缺席/未知 kind/空入参返回 null（列表不造死链）', () => {
    expect(detailRouteOf({ kind: 'delegate' })).toBeNull()
    expect(detailRouteOf({ kind: 'coding-run' })).toBeNull()
    expect(detailRouteOf({ kind: 'other', taskId: 't' })).toBeNull()
    expect(detailRouteOf(null)).toBeNull()
  })
})

describe('utils：时间/耗时/体量格式（fail-soft）', () => {
  it('缺失时间给「—」；可解析 epoch 给本地时间串', () => {
    expect(formatRecordTime(undefined)).toBe('—')
    expect(formatRecordTime('')).toBe('—')
    expect(formatRecordTime(1730000000000)).not.toBe('')
    expect(formatRecordTime(1730000000000)).not.toBe('—')
  })

  it('耗时：缺任一侧/负值（时钟偏移）=「—」；秒与分级分段', () => {
    expect(formatDurationLabel(undefined, 100)).toBe('—')
    expect(formatDurationLabel(100, 50)).toBe('—')
    expect(formatDurationLabel(1000, 12550)).toBe('11.6 秒')
    expect(formatDurationLabel(0, 65000)).toBe('1 分 05 秒')
    expect(formatDurationLabel(0, 3600000)).toBe('1 时 00 分')
  })

  it('体量：B/KiB/MiB 三段；缺失=「—」', () => {
    expect(formatLogBytes(undefined)).toBe('—')
    expect(formatLogBytes(512)).toBe('512 B')
    expect(formatLogBytes(2048)).toBe('2.0 KiB')
    expect(formatLogBytes(3 * 1024 * 1024)).toBe('3.0 MiB')
  })
})
