// @vitest-environment jsdom
// RSI 生命周期审计面板节（2026-11-26 可信 RSI 正文级轮）：主张层级证据表的渲染与降级。
// 数据面 fetch 全 mock——格态与锚点是否属实由 custom/server/harness/__tests__/rsi-lifecycle.test.ts
// 负责，本层只守「八组要求 × 三层」在客户端的呈现与缺字段时的降级。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

type Status = 'examined' | 'partial' | 'not_evaluated'
type Level = 'update' | 'successor' | 'meta'
const LEVELS: readonly Level[] = ['update', 'successor', 'meta']
const REQUIREMENTS = ['validity', 'behavioral', 'fairness', 'security', 'privacy', 'transparency', 'control', 'accountability'] as const

/** 一份与服务端同形的证据图：格态按「更新层多数已评估、公平隐私与元改进层多数未评估」铺开。 */
function claimLevels(): { cells: Array<{ requirement: string; level: Level; status: Status; anchor: string; note: string }>; summary: Record<Status, number>; source: string; boundary: string } {
  const statusOf = (requirement: string, level: Level): Status => {
    if (requirement === 'fairness' || requirement === 'privacy') return 'not_evaluated'
    if (level === 'meta') return requirement === 'transparency' || requirement === 'control' || requirement === 'accountability' ? 'examined' : 'not_evaluated'
    if (requirement === 'security') return 'partial'
    if (level === 'successor' && (requirement === 'validity' || requirement === 'behavioral' || requirement === 'control')) return 'partial'
    return 'examined'
  }
  const cells = REQUIREMENTS.flatMap((requirement) =>
    LEVELS.map((level) => {
      const status = statusOf(requirement, level)
      return {
        requirement,
        level,
        status,
        anchor: status === 'not_evaluated' ? '' : 'custom/server/harness/workbench/service.ts',
        note: `${requirement}/${level}：${status === 'examined' ? '有机制评估这一格' : status === 'partial' ? '有机制但覆盖不全' : '没有评估过'}`,
      }
    }),
  )
  const count = (s: Status): number => cells.filter((c) => c.status === s).length
  return {
    cells,
    summary: { examined: count('examined'), partial: count('partial'), not_evaluated: count('not_evaluated') },
    source: 'arXiv 2610.35193v1 §2.3、表 8、图 8',
    boundary: '声明式盘点（锚点为静态声明）；元改进层的未评估是递归深度锁 1 的设计取舍',
  }
}

function report(): Record<string, unknown> {
  return {
    ok: true,
    loops: [],
    summary: { implemented: 31, partial: 3, nr: 1, total: 35 },
    gapLines: [],
    claimLevels: claimLevels(),
    meta: { source: 's', criteria: 'NR＝未实现该阶段操作', boundary: 'b' },
  }
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

async function mountWith(body: unknown, response?: Response) {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => response ?? jsonResponse(body))
  const { default: Section } = await import('../components/RsiLifecycleSection.vue')
  const w = mount(Section, { global: { plugins: [i18n] } })
  await flushPromises()
  return w
}

describe('RsiLifecycleSection 主张层级证据图', () => {
  beforeEach(() => vi.clearAllMocks())

  it('八行三列、表头三层、汇总计数与格态一致，每格带说明', async () => {
    const body = report()
    const map = body.claimLevels as ReturnType<typeof claimLevels>
    const w = await mountWith(body)
    expect(w.find('[data-testid="harness-rsi-claims"]').text()).toContain('主张层级证据图')

    const heads = w.findAll('[data-testid="harness-rsi-claims"] thead th').map((h) => h.text())
    expect(heads).toEqual(['', '更新层', '后继层', '元改进层'])
    expect(w.findAll('[data-testid^="harness-rsi-claim-row-"]')).toHaveLength(REQUIREMENTS.length)

    const summary = w.find('[data-testid="harness-rsi-claims-summary"]').text()
    expect(summary).toContain(`已评估 ${map.summary.examined}`)
    expect(summary).toContain(`部分 ${map.summary.partial}`)
    expect(summary).toContain(`未评估 ${map.summary.not_evaluated}`)
    expect(summary).toContain(`/ ${map.cells.length}`)
    expect(map.summary.examined + map.summary.partial + map.summary.not_evaluated).toBe(24)

    const labelOf = (s: Status): string => (s === 'examined' ? '已评估' : s === 'partial' ? '部分' : '未评估')
    for (const cell of map.cells) {
      const el = w.find(`[data-testid="harness-rsi-claim-${cell.requirement}-${cell.level}"]`)
      expect(el.text()).toBe(labelOf(cell.status))
      expect(el.classes()).toContain(`rl__claimcell--${cell.status}`)
      expect(el.attributes('title')).toBe(cell.note)
    }
    expect(w.find('[data-testid="harness-rsi-claim-fairness-update"]').text()).toBe('未评估')
    expect(w.find('[data-testid="harness-rsi-claim-control-meta"]').text()).toBe('已评估')
    expect(w.find('[data-testid="harness-rsi-claims-note"]').text()).toContain('声明式盘点')
    w.unmount()
  })

  it('旧服务端不带 claimLevels：表格不渲染，环路矩阵汇总照常', async () => {
    const legacy = report()
    delete legacy.claimLevels
    const w = await mountWith(legacy)
    expect(w.find('[data-testid="harness-rsi-claims"]').exists()).toBe(false)
    expect(w.find('[data-testid="harness-rsi-lc-summary"]').text()).toContain('已实现 31')
    w.unmount()
  })

  it('缺格显示「—」，不补成任何格态', async () => {
    const body = report()
    const map = body.claimLevels as ReturnType<typeof claimLevels>
    map.cells = map.cells.filter((c) => !(c.requirement === 'privacy' && c.level === 'update'))
    const w = await mountWith(body)
    const missing = w.find('[data-testid="harness-rsi-claim-privacy-update"]')
    expect(missing.text()).toBe('—')
    expect(missing.classes().some((c) => c.startsWith('rl__claimcell--'))).toBe(false)
    w.unmount()
  })

  it('格态边线规则带 td 前缀，压得过单元格通用规则（浏览器走查抓出：边线停在透明实线）', async () => {
    // jsdom 不编译 scoped 样式，这里守样式源：单元格通用规则是「类＋元素」且写了 border-left 简写，
    // 单个类选择器压不过它——边线颜色与样式写了也不生效，三种格态实际只靠文字颜色区分。
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const source = readFileSync(resolve(__dirname, '../components/RsiLifecycleSection.vue'), 'utf8')
    expect(source).toMatch(/\.rl__claimtable td\s*\{[^}]*border-left:/)
    // 已评估只换边线颜色，线型取通用规则的实线；部分与未评估另改线型。
    const expectations: Array<[Status, RegExp]> = [
      ['examined', /border-left-color:/],
      ['partial', /border-left-style: dashed/],
      ['not_evaluated', /border-left-style: dotted/],
    ]
    for (const [status, declaration] of expectations) {
      const rule = source.match(new RegExp(`([^\\n{}]*?)\\.rl__claimcell--${status}\\s*\\{([^}]*)\\}`))
      expect(rule, status).not.toBeNull()
      expect(rule![1].trim().endsWith('td'), status).toBe(true)
      expect(rule![2], status).toMatch(declaration)
    }
  })

  it('接口失败时显示错误行，不编造证据图', async () => {
    const w = await mountWith(null, { ok: false, status: 500, json: async () => ({}) } as unknown as Response)
    expect(w.find('[data-testid="harness-rsi-claims"]').exists()).toBe(false)
    expect(w.find('.rl__error').text()).toContain('HTTP 500')
    w.unmount()
  })
})
