// @vitest-environment jsdom
// V1 壳收敛（2026-10-16 视觉重规划 D2）：推演/治理两中心 body 类生命周期
// +上游 rail 隐藏规则在库（CSS 收敛零补丁的断言面）。独立文件避开重 mock 干扰。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('../api/overview', () => ({
  fetchRunState: vi.fn().mockResolvedValue({
    run: 'r', posture: 'standard', gates: { g1_frozen: 't1' }, steps: { a_done: '1' },
    ledger: { total: 40, open: 27, byType: { 'auto-approve': 22 } },
    source: { stateFile: 's', ledgerFile: 'l', ledgerPresent: true },
  }),
  fetchDeliverables: vi.fn().mockResolvedValue({ run: 'r', deliverables: [], scanned: 0 }),
  fetchIssues: vi.fn().mockResolvedValue({ run: 'r', count: 0, lines: [], stats: { totalLines: 0, totalIssue: 0, totalDisp: 0, disposed: 0, open: 0, rate: null }, source: '' }),
  fetchBranches: vi.fn().mockResolvedValue({ run: 'r', graceMs: 3600000, count: 0, branches: [] }),
  postureKind: (p: string) => p,
  gateRows: (g: Record<string, string>) => Object.entries(g).map(([key, value]) => ({ key, label: key, value })),
  netCardRows: () => ({ compensated: '', net: '', byType: [] }),
}))
vi.mock('../api/ops', () => ({ fetchTopology: vi.fn(), topologyRows: () => [], cliHealthEntries: () => [], sleepingRows: () => [] }))
vi.mock('../api/supervision', () => ({ fetchJournal: vi.fn(), fetchAnchor: vi.fn(), organizeJournal: () => ({ windows: [], briefs: [], verdicts: [], tickets: [], unclassified: 0 }) }))
vi.mock('../api/gatekeeper', () => ({ fetchClearanceLedger: vi.fn(), resolveClearance: vi.fn(), waiveClearance: vi.fn(), groupClearanceTargets: () => [], buildClosingOrder: () => '' }))
vi.mock('../api/gov', () => ({ fetchGateRepairs: vi.fn(), transitionGateRepair: vi.fn(), fetchKeyLedger: vi.fn(), putKeyLedger: vi.fn(), legalTransitions: () => [], GATE_STATE_LABEL: {}, GATE_FULL_NAME: {}, joinIssueDisposal: () => [], fetchIssues: vi.fn() }))
vi.mock('../../kanban/handoff', () => ({ HANDOFF_TYPES: [], HANDOFF_STATES: [], HANDOFF_TYPE_LABEL: {}, HANDOFF_STATE_LABEL: {} }))

// jsdom 无 ResizeObserver（迁入组件链上的图表件用）——桩化
class RO { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', RO)

import SimCenterView from '../views/sim/SimCenterView.vue'
import GovCenterView from '../views/gov/GovCenterView.vue'

async function mountView(view: typeof SimCenterView, path: string, name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, name, component: view }] })
  await router.push(path)
  await router.isReady()
  return mount(view, { global: { plugins: [router] } })
}

describe('壳收敛 ia-center-full（V1·视觉重规划 D2）', () => {
  it('SimCenterView：挂载加 body 类、卸载移除', { timeout: 20000 }, async () => {
    const w = await mountView(SimCenterView, '/app/sim', 'ia2.sim')
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
  })

  it('GovCenterView：同款生命周期', { timeout: 20000 }, async () => {
    const w = await mountView(GovCenterView, '/app/gov', 'ia2.governance')
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
  })

  it('隐藏规则在库：ia2.scss 含 body.ia-center-full .studio-navigation-rail { display:none }', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    expect(scss).toContain('body.ia-center-full .studio-navigation-rail')
    expect(scss.replace(/\s+/g, ' ')).toContain('display: none')
  })
})

describe('V2 设计语言 token（D4：单一事实源在库）', () => {
  it('五态色/字阶四级/间距/卡片规范齐全；胶囊容器规则在位', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    for (const tok of ['--ia-fresh', '--ia-stale', '--ia-fail', '--ia-pass', '--ia-compensated',
      '--ia-fs-page', '--ia-fs-block', '--ia-fs-body', '--ia-fs-aux',
      '--ia-sp-1', '--ia-sp-4', '--ia-card-border', '--ia-card-radius', '--ia-card-pad']) {
      expect(scss, tok).toContain(tok)
    }
    expect(scss).toContain('.ia-status-capsule')
  })

  it('SitlineBar：任务+在线两 chip 挂胶囊容器类（收一条释放层级）', async () => {
    const { default: SitlineBar } = await import('../components/SitlineBar.vue')
    const w = mount(SitlineBar, {
      props: { waitingCount: 2, oldestLabel: '', taskTotal: 8, taskByStatus: { todo: 2 }, onlinePeople: 1, onlineAgents: 2, onlineMachines: 1 },
    })
    expect(w.find('[data-testid="sitline"]').classes()).toContain('ia-status-capsule')
    expect(w.findAll('.ia-status-capsule__item')).toHaveLength(2)
    w.unmount()
  })
})

describe('V3 旗舰屏排版（D6）', () => {
  it('OverviewPanel 真数据渲染：KPI 分母辅助+七幕分段头在位', { timeout: 20000 }, async () => {
    const { createRouter, createMemoryHistory } = await import('vue-router')
    const { default: OverviewPanel } = await import('../views/sim/OverviewPanel.vue')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/sim', name: 'ia2.sim', component: OverviewPanel }] })
    await router.push('/app/sim?run=r')
    await router.isReady()
    const w = mount(OverviewPanel, { global: { plugins: [router] } })
    for (let i = 0; i < 30; i++) {
      if ((await w.findAll('[data-testid="ov-posture"]').length) > 0) break
      await flushPromises()
      await new Promise(r => setTimeout(r, 100))
    }
    expect(w.findAll('[data-testid^="ov-step-acthead-"]').length).toBeGreaterThanOrEqual(1)
    expect(w.find('[data-testid="ov-kpi-gates"]').find('.ov__kpi-denom').exists()).toBe(true)
    w.unmount()
  })
})

/** WCAG 相对亮度/对比度（与规范公式一致；3 位 hex 展开支持） */
function lum(hex: string): number {
  const h = hex.length === 4 ? '#' + [1, 2, 3].map(i => hex[i] + hex[i]).join('') : hex
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('V2 补批：五态色 WCAG 对比度（D4 token 机械守门）', () => {
  const DARK_BG = '#1d1f23' // 当前深色态主背景（驾驶屏面板实测底色）
  // 2026-10-18 双主题复核：浅色状态底需要深文字、深色状态底需要浅文字，按主题分两套。
  const DARK_TOKENS: Record<string, string> = {
    '--ia-fresh': '#53b483', '--ia-stale': '#d4a017', '--ia-fail': '#f08a8a',
    '--ia-pass': '#53b483', '--ia-compensated': '#b39ddb',
  }
  const LIGHT_TOKENS: Record<string, string> = {
    '--ia-fresh': '#17663a', '--ia-stale': '#7a5a06', '--ia-fail': '#b3261e',
    '--ia-pass': '#17663a', '--ia-compensated': '#5e3f92',
  }
  it('深色背景（现用主题）文字级 AA：五态色全部 ≥4.5:1', () => {
    for (const [name, hex] of Object.entries(DARK_TOKENS)) {
      const r = contrast(hex, DARK_BG)
      expect(r, `${name} ${hex} 深底 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('浅色主题文字级 AA：五态色对白底全部 ≥4.5:1，且两套 token 与 ia2.scss 同步', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    for (const [name, hex] of Object.entries(LIGHT_TOKENS)) {
      expect(contrast(hex, '#ffffff'), `${name} 浅底`).toBeGreaterThanOrEqual(4.5)
      expect(scss, `${name} light`).toContain(`${name}: ${hex};`)
    }
    for (const [name, hex] of Object.entries(DARK_TOKENS)) {
      expect(scss, `${name} dark`).toContain(`${name}: ${hex};`)
    }
  })
})

describe('V1 补批：工作台同收敛（D7——rail 去留评估结论=收敛）', () => {
  it('WorkbenchView 生命周期两行在库（33K 重型壳不做整挂载——同 scss 守门模式 grep 断言）', () => {
    const src = readFileSync(resolve(__dirname, '../views/WorkbenchView.vue'), 'utf8')
    expect(src).toContain("document.body.classList.add('ia-center-full')")
    expect(src).toContain("document.body.classList.remove('ia-center-full')")
    // onMounted/onUnmounted 确实导入（防只写调用没导 hook）
    expect(src).toMatch(/import \{[^}]*onMounted[^}]*\} from 'vue'/)
  })
})
