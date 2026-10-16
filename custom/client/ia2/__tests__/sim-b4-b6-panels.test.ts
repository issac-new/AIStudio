// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-b4-b6-panels.test.ts
// B4/B5/B6 单测（签 3 运行观测/签 5 交付健康/签 6 需求追溯，R1/R2/R4/R12）：
// 纯函数（拓扑行序/CLI 输出整形/休眠行整形）+三面板 VTU（四服务红绿点如实、
// 派发器与休眠卡降级、分支三态徽、交付物缺件红显、AC 判词链三源缺席列 null）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../api/ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/ops')>()
  return { ...actual, fetchTopology: vi.fn(), fetchDispatcherHealth: vi.fn(), fetchSleepingWorkers: vi.fn() }
})
vi.mock('../../ide/utils/auth-fetch', () => ({
  authFetch: vi.fn(),
}))

import { topologyRows, cliHealthEntries, sleepingRows, type ServiceProbe } from '../api/ops'
import { fetchTopology, fetchDispatcherHealth, fetchSleepingWorkers } from '../api/ops'
import { authFetch } from '../../ide/utils/auth-fetch'
import OpsPanel from '../views/sim/OpsPanel.vue'
import DeliveryPanel from '../views/sim/DeliveryPanel.vue'
import TracePanel from '../views/sim/TracePanel.vue'

const mockedTopology = vi.mocked(fetchTopology)
const mockedDisp = vi.mocked(fetchDispatcherHealth)
const mockedSleep = vi.mocked(fetchSleepingWorkers)
const mockedAuthFetch = vi.mocked(authFetch)

describe('纯函数层', () => {
  it('topologyRows：四服务固定位次+红点 detail（失败带原因，未返回=如实未探测）', () => {
    const services: Record<string, ServiceProbe> = {
      studio: { ok: true, status: 200, latency_ms: 12 },
      gateway: { ok: false, latency_ms: 1501, error: 'connect ECONNREFUSED' },
    }
    const rows = topologyRows(services)
    expect(rows.map(r => r.name)).toEqual(['gateway', 'studio', 'synapse', 'hindsight'])
    expect(rows[0]).toMatchObject({ ok: false, detail: 'connect ECONNREFUSED' })
    expect(rows[1]).toMatchObject({ ok: true, detail: '12ms（HTTP 200）' })
    expect(rows[2]).toMatchObject({ ok: false, detail: '未探测到（端点未返回该服务）' })
  })
  it('cliHealthEntries：对象→键值行；raw→原文；失败→错误行', () => {
    expect(cliHealthEntries({ ok: true, data: { ready: ['a', 'b'], since_s: 300 } })).toEqual([
      { k: 'ready', v: '["a","b"]' }, { k: 'since_s', v: '300' },
    ])
    expect(cliHealthEntries({ ok: true, data: { raw: 'line1\nline2' } })).toEqual([{ k: '输出', v: 'line1\nline2' }])
    expect(cliHealthEntries({ ok: false, error: 'boom' })).toEqual([{ k: '错误', v: 'boom' }])
  })
  it('sleepingRows：契约形状成表；形状漂移整表降级原文', () => {
    expect(sleepingRows({ ok: true, data: { idle_sec: 10, sleeping: [{ account: 'chen', silent_s: 900 }] } }))
      .toEqual([{ account: 'chen', silent_s: '900' }])
    expect(sleepingRows({ ok: true, data: { something: 'else' } }))
      .toEqual([{ 输出: '{"something":"else"}' }])
    expect(sleepingRows({ ok: false, error: 'x' })).toEqual([{ 错误: 'x' }])
  })
})

describe('OpsPanel — 签 3 运行观测（R1/R2）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('四服务红绿点如实：失败服务红点+原因；派发器键值卡；休眠表渲染；探测时刻可见', async () => {
    mockedTopology.mockResolvedValue({
      services: {
        gateway: { ok: true, status: 200, latency_ms: 8 },
        studio: { ok: false, latency_ms: 1500, error: 'connect refused' },
        synapse: { ok: true, status: 200, latency_ms: 20 },
        hindsight: { ok: true, status: 200, latency_ms: 15 },
      },
      checkedAt: '2026-10-16T04:00:00.000Z',
    })
    mockedDisp.mockResolvedValue({ ok: true, data: { ready: ['chen', 'hu'], zero_hatch_streak: 0 } })
    mockedSleep.mockResolvedValue({ ok: true, data: { idle_sec: 60, sleeping: [{ account: 'wei', silent_s: 1800 }] } })
    const w = mount(OpsPanel)
    await w.find('[data-testid="ops-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ops-svc-gateway"]').find('[data-testid="ops-dot"]').classes()).toContain('ops__dot--ok')
    const studioRow = w.find('[data-testid="ops-svc-studio"]')
    expect(studioRow.find('[data-testid="ops-dot"]').classes()).toContain('ops__dot--fail')
    expect(studioRow.text()).toContain('connect refused')
    expect(w.text()).toContain('ready')
    expect(w.find('[data-testid="ops-sleeping-table"]').text()).toContain('wei')
    expect(w.find('[data-testid="ops-checked-at"]').text()).toContain('2026-10-16T04:00:00')
    expect(w.find('[data-testid="ops-liveness-absent"]').text()).toContain('活性端点未接')
    w.unmount()
  })

  it('三端点各自失败单独呈现不拖垮整卡（topology 503→错误行，sleeping 503→独立错误）', async () => {
    mockedTopology.mockRejectedValue(new Error('/api/hermes/sim/topology → 503'))
    mockedDisp.mockResolvedValue({ ok: true, data: { ready: [] } })
    mockedSleep.mockRejectedValue(new Error('/api/hermes/sim/sleeping-workers → 503'))
    const w = mount(OpsPanel)
    await w.find('[data-testid="ops-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ops-error"]').text()).toContain('503')
    expect(w.find('[data-testid="ops-sleeping-error"]').text()).toContain('503')
    expect(w.text()).toContain('ready')
    w.unmount()
  })
})

describe('DeliveryPanel — 签 5 交付健康（R4）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('分支三态徽+推送态；交付物链在场计数与缺件红显', async () => {
    mockedAuthFetch.mockImplementation(async (path: string) => {
      if (String(path).includes('/branches')) {
        return { ok: true, status: 200, json: () => Promise.resolve({
          run: 'r', graceMs: 3600000, count: 3,
          branches: [
            { name: 'feat/a', localTs: 1, pushTs: 1, pushed: true, freshness: 'fresh' as const },
            { name: 'feat/b', localTs: 2, pushTs: null, pushed: false, freshness: 'stale' as const },
            { name: 'feat/c', localTs: 0, pushTs: 0, pushed: true, freshness: 'old' as const },
          ],
        }) } as Response
      }
      return { ok: true, status: 200, json: () => Promise.resolve({
        run: 'r', scanned: 9,
        deliverables: [
          { name: 'freeze', label: '冻结单', file: 'requirements/RFD-001.freeze.md' },
          { name: 'test-report', label: '测试报告', file: null },
        ],
      }) } as Response
    })
    const w = mount(DeliveryPanel)
    await w.find('[data-testid="dlv-run"]').setValue('r')
    await w.find('[data-testid="dlv-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="dlv-fresh-feat/a"]').text()).toBe('新鲜')
    expect(w.find('[data-testid="dlv-fresh-feat/b"]').text()).toBe('宽限窗内')
    expect(w.find('[data-testid="dlv-fresh-feat/c"]').text()).toBe('旧残留')
    expect(w.text()).toContain('从未推送')
    expect(w.text()).toContain('在库 1/2')
    expect(w.find('[data-testid="dlv-dv-freeze"]').text()).toContain('✓')
    expect(w.find('[data-testid="dlv-dv-test-report"]').text()).toContain('缺')
    w.unmount()
  })

  it('branches 端点 503（SIM_BRANCHES_REPO 未配置）如实报错', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({ error: 'x' }) } as Response)
    const w = mount(DeliveryPanel)
    await w.find('[data-testid="dlv-run"]').setValue('r')
    await w.find('[data-testid="dlv-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="dlv-error"]').text()).toContain('503')
    w.unmount()
  })
})

describe('TracePanel — 签 6 需求追溯（R12）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('AC 四列表+三源在场徽+判词三态徽；缺席列 null 如实', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({
      run: 'r',
      rows: [
        { ac: 'AC-1', criterion: '重复提交返回同一支付单号', caseResult: '通过', uatVerdict: '通过' },
        { ac: 'AC-2', criterion: null, caseResult: null, uatVerdict: '不通过' },
        { ac: 'AC-3', criterion: '金额单位为分', caseResult: '失败', uatVerdict: null },
      ],
      meta: { frozenPresent: true, testReportPresent: false, acceptancePresent: true },
      source: { evidenceDir: '/runs/r/evidence' },
    }) } as Response)
    const w = mount(TracePanel)
    await w.find('[data-testid="trc-run"]').setValue('r')
    await w.find('[data-testid="trc-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="trc-row-AC-1"]').text()).toContain('重复提交返回同一支付单号')
    expect(w.find('[data-testid="trc-row-AC-2"]').text()).toContain('（冻结单缺席）')
    expect(w.find('[data-testid="trc-row-AC-2"]').text()).toContain('null')
    const meta = w.find('[data-testid="trc-meta"]')
    expect(meta.text()).toContain('冻结单✓')
    expect(meta.text()).toContain('测试报告缺')
    expect(w.find('[data-testid="trc-row-AC-1"]').find('.trc__verdict').classes()).toContain('trc__verdict--pass')
    expect(w.find('[data-testid="trc-row-AC-2"]').find('.trc__verdict').classes()).toContain('trc__verdict--reject')
    expect(w.find('[data-testid="trc-row-AC-3"]').find('.trc__verdict').text()).toBe('未判')
    w.unmount()
  })

  it('trace 端点失败如实报错；空行集呈现「三源均未提取到」', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({
      run: 'r', rows: [], meta: { frozenPresent: false, testReportPresent: false, acceptancePresent: false }, source: { evidenceDir: 'x' },
    }) } as Response)
    const w = mount(TracePanel)
    await w.find('[data-testid="trc-run"]').setValue('r')
    await w.find('[data-testid="trc-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="trc-empty"]').text()).toContain('三源均未提取到')
    w.unmount()
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) } as Response)
    const w2 = mount(TracePanel)
    await w2.find('[data-testid="trc-run"]').setValue('r')
    await w2.find('[data-testid="trc-load"]').trigger('click')
    await flushPromises()
    expect(w2.find('[data-testid="trc-error"]').text()).toContain('503')
    w2.unmount()
  })
})
