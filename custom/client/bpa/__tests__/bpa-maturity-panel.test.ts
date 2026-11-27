// 流程成熟度面板守门（2026-11-28）：九项打齐才给总体成熟度、才画雷达图；
// 未打齐时显示进度，不把没打分的因素显示成 0 分或给出误导性的「总体 P几」。
// ECharts 在 jsdom 里没有布局，整体桩掉，只断言「有没有去画」与文案。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { bpaApi } from '@/custom/bpa/api'
import { bpaMessages } from '@/custom/bpa/i18n'
import { PEMM_FACTORS } from '@/custom/bpa/pemm'

const init = vi.fn()
vi.mock('echarts', () => ({
  init: (...args: unknown[]) => init(...args),
}))
vi.mock('@/custom/bpa/api', () => ({
  bpaApi: {
    maturityHistory: vi.fn(),
    submitMaturity: vi.fn(),
  },
}))

const L = bpaMessages.zh.bpa
const all = (level: number) => Object.fromEntries(PEMM_FACTORS.map((f) => [f.key, level]))

async function mountComp() {
  const mod = await import('@/custom/bpa/components/BpaMaturityPanel.vue')
  return mount(mod.default, { props: { L }, global: { plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: {} })] } })
}

/** 让雷达容器在 jsdom 里「可绘制」：组件用 clientWidth/clientHeight 判断。 */
function giveSize(): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 320 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 260 })
}

beforeEach(() => {
  vi.clearAllMocks()
  init.mockReturnValue({ setOption: vi.fn(), dispose: vi.fn() })
})

describe('BpaMaturityPanel：未打齐不出总体结论', () => {
  it('没有任何评估记录：显示进度 0/9，不显示总体成熟度块', async () => {
    vi.mocked(bpaApi.maturityHistory).mockResolvedValue({ ok: true, history: [] } as never)
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="bpa-pemm-overall"]').exists()).toBe(false)
    expect(w.find('[data-testid="bpa-pemm-overall-pending"]').exists()).toBe(true)
    expect(w.find('[data-testid="bpa-pemm-progress"]').text()).toContain('0/9')
    expect(w.find('[data-testid="bpa-pemm-radar-pending"]').exists()).toBe(true)
    // 页面上供打分用的单选按钮本来就有 P0–P4 字样，所以只断言总体块与它的名称不出现
    expect(w.find('[data-testid="bpa-pemm-overall"]').exists()).toBe(false)
    expect(w.text()).not.toContain('最佳流程')
  })

  it('最近一次评估只打了一项 P4：不显示「总体 P4」，雷达图不画', async () => {
    giveSize()
    vi.mocked(bpaApi.maturityHistory).mockResolvedValue({
      ok: true,
      history: [{ id: 'a', scoredAt: 1, scores: { design: 4 } }],
    } as never)
    const w = await mountComp()
    await flushPromises()
    // 改动前这里会显示「P4」——只拿已打分项取最低分
    expect(w.find('[data-testid="bpa-pemm-overall"]').exists()).toBe(false)
    expect(w.find('[data-testid="bpa-pemm-progress"]').text()).toContain('1/9')
    // 注意：「流程设计」这一项用户确实打了 P4，它旁边的级别名「P4 最佳流程」照常显示——那是单项分，
    // 不是总体结论。要拦的是总体块，上面已断言它不存在。
    // 未打齐不画雷达：传给 ECharts 的数据里不应出现「未打分＝0」
    const radarCalls = init.mock.calls.filter((c) => (c[0] as HTMLElement).getAttribute('data-testid') === 'bpa-pemm-radar')
    expect(radarCalls).toHaveLength(0)
    expect(w.find('[data-testid="bpa-pemm-radar"]').classes()).toContain('chart--hidden')
    // 历史表的总体列写「—」
    const cells = w.findAll('tbody tr td')
    expect(cells[1]?.text()).toBe('—')
  })

  it('九项打齐、一项最低：显示总体 P1 与最短板，雷达图画出且不补 0', async () => {
    giveSize()
    const scores = { ...all(3), staff: 1 }
    vi.mocked(bpaApi.maturityHistory).mockResolvedValue({
      ok: true,
      history: [{ id: 'a', scoredAt: 1, scores }],
    } as never)
    const w = await mountComp()
    await flushPromises()
    const overall = w.find('[data-testid="bpa-pemm-overall"]')
    expect(overall.exists()).toBe(true)
    expect(overall.text()).toContain('P1')
    expect(overall.text()).toContain('流程员工')
    expect(w.find('[data-testid="bpa-pemm-overall-pending"]').exists()).toBe(false)
    expect(w.find('[data-testid="bpa-pemm-radar-pending"]').exists()).toBe(false)
    const radarCalls = init.mock.calls.filter((c) => (c[0] as HTMLElement).getAttribute('data-testid') === 'bpa-pemm-radar')
    expect(radarCalls).toHaveLength(1)
    const chart = init.mock.results.find((r) => r.value?.setOption)?.value
    const option = (chart?.setOption as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { series: Array<{ data: Array<{ value: number[] }> }> }
    expect(option.series[0].data[0].value).toEqual(PEMM_FACTORS.map((f) => scores[f.key]))
    expect(option.series[0].data[0].value).not.toContain(0)
  })

  it('从空历史逐项点选：第八项后仍不出总体、不画雷达；第九项点完才出', async () => {
    giveSize()
    vi.mocked(bpaApi.maturityHistory).mockResolvedValue({ ok: true, history: [] } as never)
    const w = await mountComp()
    await flushPromises()
    const pick = async (key: string, level: number) => {
      await w.find(`input[type="radio"][name="pemm-${key}"][value="${level}"]`).setValue(true)
      await flushPromises()
    }
    // 前八项打 P3：还差第九项，不出总体结论
    for (const f of PEMM_FACTORS.slice(0, 8)) await pick(f.key, 3)
    expect(w.find('[data-testid="bpa-pemm-progress"]').text()).toContain('8/9')
    expect(w.find('[data-testid="bpa-pemm-overall"]').exists()).toBe(false)
    expect(w.find('[data-testid="bpa-pemm-overall-pending"]').exists()).toBe(true)
    expect(init.mock.calls.filter((c) => (c[0] as HTMLElement).getAttribute('data-testid') === 'bpa-pemm-radar')).toHaveLength(0)
    // 第九项打 P1：出总体，最短板是它
    const last = PEMM_FACTORS[8]
    await pick(last.key, 1)
    expect(w.find('[data-testid="bpa-pemm-overall"]').text()).toContain('P1')
    expect(w.find('[data-testid="bpa-pemm-overall"]').text()).toContain(last.nameZh)
    expect(w.find('[data-testid="bpa-pemm-overall-pending"]').exists()).toBe(false)
    const chart = init.mock.results.find((r) => r.value?.setOption)?.value
    const option = (chart?.setOption as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[0] as { series: Array<{ data: Array<{ value: number[] }> }> }
    expect(option.series[0].data[0].value.filter((v) => v === 3)).toHaveLength(8)
    expect(option.series[0].data[0].value.filter((v) => v === 1)).toHaveLength(1)
  })
})
