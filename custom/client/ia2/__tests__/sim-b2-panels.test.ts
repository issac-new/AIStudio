// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-b2-panels.test.ts
// B2 单测（S2 监督面板+S3 证据库，R7/R10/R12——设计正本 §二）：
//   1) organizeJournal 纯函数：分窗计数/判词摘要/缺陷单挂窗/游离行如实计数
//   2) SupervisionPanel：观察窗流倒序渲染+研判/判词时间线+行点击进锚点抽屉+错误如实
//   3) EvidencePanel：锚反查命中进抽屉（类型与锚号传递）/失败如实/台账子表三态徽/
//      帧图廊挂账态在位
//   4) SimCenterView 集成：监督/证据两签换实装面板、其余四签仍占位
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('../api/supervision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/supervision')>()
  return { ...actual, fetchJournal: vi.fn(), fetchAnchor: vi.fn() }
})
vi.mock('../api/gatekeeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gatekeeper')>()
  return { ...actual, fetchClearanceLedger: vi.fn() }
})

import { organizeJournal, type JournalLine } from '../api/supervision'
import { fetchJournal, fetchAnchor } from '../api/supervision'
import { fetchClearanceLedger } from '../api/gatekeeper'
import SupervisionPanel from '../views/sim/SupervisionPanel.vue'
import EvidencePanel from '../views/sim/EvidencePanel.vue'

const mockedFetchJournal = vi.mocked(fetchJournal)
const mockedFetchAnchor = vi.mocked(fetchAnchor)
const mockedFetchLedger = vi.mocked(fetchClearanceLedger)

const LINES: JournalLine[] = [
  { t: 'round', ts: '2026-10-15 16:06:00', round: 0 }, // 开窗前游离行
  { t: 'window_start', ts: '2026-10-15 16:07:19', posture: '姿态: standard' },
  { t: 'round', ts: '2026-10-15 16:08:20', round: 1, changed: false },
  { t: 'round', ts: '2026-10-15 16:09:20', round: 2, changed: true, gateEvent: true },
  { t: 'situation_brief', ts: '2026-10-15 16:10:00', brief: '局势：G2 评审中，两路在制' },
  { t: 'defect_ticket', ts: '2026-10-15 16:11:00', pr: 'PR-3', type: 'nudge', count: 1, ticket: 'nudge 新增 1 笔' },
  { t: 'stall_verdict', ts: '2026-10-15 16:12:00', verdict: '未停滞：轮询有变化' },
  { t: 'window_end', ts: '2026-10-15 16:12:30' },
  { t: 'window_start', ts: '2026-10-15 17:00:00' },
  { t: 'round', ts: '2026-10-15 17:01:00', round: 1, changed: false, ledgerEvent: true },
]

describe('organizeJournal — journal 分窗组织（R10）', () => {
  it('分窗计数与判词摘要：窗 2 轮/1 变化/1 闸事件/1 缺陷单；末窗未闭无摘要', () => {
    const o = organizeJournal(LINES)
    expect(o.windows).toHaveLength(2)
    const w1 = o.windows[0]
    expect(w1).toMatchObject({ startTs: '2026-10-15 16:07:19', posture: '姿态: standard', rounds: 2, changedRounds: 1, gateEvents: 1, ledgerEvents: 0, tickets: 1 })
    expect(w1.summary).toContain('未停滞')
    const w2 = o.windows[1]
    expect(w2).toMatchObject({ rounds: 1, changedRounds: 0, ledgerEvents: 1 })
    expect(w2.summary).toBeUndefined()
  })
  it('研判/判词/缺陷单归列；开窗前游离行如实计数不丢弃', () => {
    const o = organizeJournal(LINES)
    expect(o.briefs).toHaveLength(1)
    expect(o.briefs[0].text).toContain('G2 评审中')
    expect(o.verdicts).toHaveLength(1)
    expect(o.tickets).toHaveLength(1)
    expect(o.unclassified).toBe(1)
  })
})

describe('SupervisionPanel — S2 监督面板', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('读取渲染：观察窗倒序+计数行+研判/判词时间线+数据源可见', async () => {
    mockedFetchJournal.mockResolvedValue({
      run: '20261015-v8-run20', tail: 50, count: LINES.length, skippedBadLines: 0,
      lines: LINES, source: '/runs/20261015-v8-run20/workflow-journal.ndjson',
    })
    const w = mount(SupervisionPanel)
    await w.find('[data-testid="sup-run"]').setValue('20261015-v8-run20')
    await w.find('[data-testid="sup-load"]').trigger('click')
    await flushPromises()
    expect(mockedFetchJournal).toHaveBeenCalledWith('20261015-v8-run20', 50)
    const first = w.find('[data-testid="sup-win-w2"]')
    expect(first.exists()).toBe(true)
    expect(w.find('[data-testid="sup-win-w1"]').exists()).toBe(true)
    expect(first.text()).toContain('轮数 1')
    expect(w.find('[data-testid="sup-win-summary-w1"]').text()).toContain('未停滞')
    expect(w.findAll('[data-testid="sup-brief-row"]')).toHaveLength(1)
    expect(w.findAll('[data-testid="sup-verdict-row"]')).toHaveLength(1)
    expect(w.text()).toContain('未归类行 1 条')
    expect(w.text()).toContain('数据源：/runs/20261015-v8-run20')
    w.unmount()
  })

  it('判词行点击→锚点抽屉展开 journal 原行（R7 下钻）', async () => {
    mockedFetchJournal.mockResolvedValue({
      run: 'r', tail: 50, count: LINES.length, skippedBadLines: 0, lines: LINES, source: 's',
    })
    const w = mount(SupervisionPanel)
    await w.find('[data-testid="sup-run"]').setValue('r')
    await w.find('[data-testid="sup-load"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="sup-verdict-row"]').trigger('click')
    const drawer = w.find('[data-testid="sim-anchor-drawer"]')
    expect(drawer.classes()).toContain('sim-anchor-drawer--open')
    expect(w.find('[data-testid="sim-anchor-drawer-evidence"]').text()).toContain('stall_verdict')
    w.unmount()
  })

  it('端点失败如实报错（未配置 503 场景），不渲染窗流', async () => {
    mockedFetchJournal.mockRejectedValue(new Error('/api/hermes/sim/journal → 503'))
    const w = mount(SupervisionPanel)
    await w.find('[data-testid="sup-run"]').setValue('r')
    await w.find('[data-testid="sup-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sup-error"]').text()).toContain('503')
    expect(w.find('[data-testid="sup-win-w1"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('EvidencePanel — S3 证据库', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('锚反查命中：抽屉开+类型与锚号传递+原文进抽屉', async () => {
    mockedFetchAnchor.mockResolvedValue({ type: 'commit', data: { stat: 'd197be6c\nplusprimer\n2026-10-16\ndocs: freeze' } })
    const w = mount(EvidencePanel)
    await w.find('[data-testid="ev-anchor-input"]').setValue('d197be6c')
    await w.find('[data-testid="ev-anchor-search"]').trigger('click')
    await flushPromises()
    expect(mockedFetchAnchor).toHaveBeenCalledWith('d197be6c')
    expect(w.find('[data-testid="sim-anchor-drawer"]').classes()).toContain('sim-anchor-drawer--open')
    expect(w.find('[data-testid="sim-anchor-drawer-anchor"]').text()).toContain('d197be6c')
    expect(w.find('[data-testid="sim-anchor-drawer-evidence"]').text()).toContain('docs: freeze')
    w.unmount()
  })

  it('锚反查失败（404/400）如实报错；帧图廊挂账态在位', async () => {
    mockedFetchAnchor.mockRejectedValue(new Error('/api/hermes/sim/anchor → 404（{"error":"synapse 查询失败"}）'))
    const w = mount(EvidencePanel)
    await w.find('[data-testid="ev-anchor-input"]').setValue('$notfound')
    await w.find('[data-testid="ev-anchor-search"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ev-anchor-error"]').text()).toContain('404')
    expect(w.find('[data-testid="ev-frames-absent"]').text()).toContain('帧目录端点未接')
    w.unmount()
  })

  it('台账子表：三态徽+汇总行；读取失败如实', async () => {
    mockedFetchLedger.mockResolvedValue({
      rows: [
        { id: 'e1', type: 'nudge', defect: 'PR-3', detail: '', status: 'open', state: 'open' },
        { id: 'e2', type: 'auto-approve', defect: 'PR-2', detail: '', status: 'open', state: 'waived' },
        { id: 'e3', type: 'nudge', defect: '', detail: '', status: 'open', state: 'resolved' },
      ],
      open: 1, resolved: 1, waived: 1, pass: false,
    })
    const w = mount(EvidencePanel)
    await w.find('[data-testid="ev-ledger-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ev-ledger-summary"]').text()).toContain('拒开新轮')
    expect(w.find('[data-testid="ev-ledger-state-e1"]').text()).toBe('未清')
    expect(w.find('[data-testid="ev-ledger-state-e2"]').classes()).toContain('ev__state--waived')
    expect(w.find('[data-testid="ev-ledger-state-e3"]').text()).toBe('已清')
    w.unmount()
    mockedFetchLedger.mockRejectedValue(new Error('/api/hermes/orgloop/ledger → 503'))
    const w2 = mount(EvidencePanel)
    await w2.find('[data-testid="ev-ledger-load"]').trigger('click')
    await flushPromises()
    expect(w2.find('[data-testid="ev-ledger-error"]').text()).toContain('503')
    w2.unmount()
  })
})
