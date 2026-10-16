// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-atoms.test.ts
// X0 六原子组件包守门（设计正本《2026-10-16-design-derived-from-requirements.md》§二）：
// 每组件 ≥2 例、必含缺席态；锚点抽屉 480px 断言；判词位接口上不收正文（防从叙述猜判词）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import {
  SimDualCredential,
  SimAnchorDrawer,
  SimCompensatedTag,
  SimVerdictField,
  SimInterventionCard,
  SimDisciplineNote,
} from '../components/sim/index'

describe('SimDualCredential — 双凭证标（R4）', () => {
  it('双锚齐：显示提交短号与卡号', () => {
    const w = mount(SimDualCredential, { props: { commit: 'abcdef1234567890', card: 't_rel_001' } })
    expect(w.find('[data-testid="sim-dual-cred-commit"]').text()).toBe('提交 abcdef1234')
    expect(w.find('[data-testid="sim-dual-cred-card"]').text()).toBe('卡 t_rel_001')
    expect(w.find('[data-testid="sim-dual-cred-commit-gap"]').exists()).toBe(false)
    w.unmount()
  })

  it('缺席态：缺任一锚红显缺口，不静默', () => {
    const w = mount(SimDualCredential, { props: { commit: 'abc123', card: null } })
    expect(w.find('[data-testid="sim-dual-cred-commit"]').text()).toBe('提交 abc123')
    const gap = w.find('[data-testid="sim-dual-cred-card-gap"]')
    expect(gap.exists()).toBe(true)
    expect(gap.text()).toBe('缺卡锚')
    expect(gap.classes()).toContain('sim-dual-cred__gap')
    w.unmount()
  })
})

describe('SimAnchorDrawer — 锚点抽屉（R7，唯一反查交互）', () => {
  it('开态：480px 右滑容器＋锚行＋证据原文；关闭钮 emit close', async () => {
    const w = mount(SimAnchorDrawer, {
      props: { open: true, title: '步 18 证据', anchorType: 'event', anchorId: '$EnQbo21v', evidence: 'DEV-DONE 行原文' },
    })
    const root = w.find('[data-testid="sim-anchor-drawer"]')
    expect(root.classes()).toContain('sim-anchor-drawer--open')
    expect(root.attributes('style')).toBeUndefined()
    // 宽度单一事实源=组件样式（480px），不随调用方漂移
    const sfc = readFileSync(resolve(__dirname, '../components/sim/SimAnchorDrawer.vue'), 'utf8')
    expect(sfc).toContain('width: 480px')
    expect(w.find('[data-testid="sim-anchor-drawer-anchor"]').text()).toContain('$EnQbo21v')
    expect(w.find('[data-testid="sim-anchor-drawer-evidence"]').text()).toBe('DEV-DONE 行原文')
    await w.find('[data-testid="sim-anchor-drawer-close"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('缺席态：open=false 不滑出；无锚与无原文如实呈现', () => {
    const closed = mount(SimAnchorDrawer, { props: { open: false } })
    expect(closed.find('[data-testid="sim-anchor-drawer"]').classes()).not.toContain('sim-anchor-drawer--open')
    closed.unmount()
    const noAnchor = mount(SimAnchorDrawer, { props: { open: true } })
    expect(noAnchor.find('[data-testid="sim-anchor-drawer-anchor-absent"]').exists()).toBe(true)
    expect(noAnchor.find('[data-testid="sim-anchor-drawer-evidence"]').text()).toBe('（证据原文缺席）')
    noAnchor.unmount()
  })
})

describe('SimCompensatedTag — 代偿紫标（N1 紫标不隐藏）', () => {
  it('带计数：紫标＋净额口径提示', () => {
    const w = mount(SimCompensatedTag, { props: { count: 40 } })
    const tag = w.find('[data-testid="sim-comp-tag"]')
    expect(tag.text()).toBe('代偿 40')
    expect(tag.attributes('title')).toBe('净额口径不计入')
    w.unmount()
  })

  it('缺席态：计数未知仍显示紫标本体（不隐藏）', () => {
    const w = mount(SimCompensatedTag, { props: {} })
    expect(w.find('[data-testid="sim-comp-tag"]').text()).toBe('代偿')
    w.unmount()
  })
})

describe('SimVerdictField — 判词结构位（R3 只认结构化字段）', () => {
  it('结构化判词＋provenance 徽（代偿代判紫色）＋判据可查', () => {
    const w = mount(SimVerdictField, {
      props: { verdict: { value: 'PASS', provenance: 'compensated' }, criteria: 'AC-1 幂等' },
    })
    expect(w.find('[data-testid="sim-verdict-value"]').text()).toBe('PASS')
    const prov = w.find('[data-testid="sim-verdict-provenance"]')
    expect(prov.text()).toBe('代偿代判')
    expect(prov.classes()).toContain('sim-verdict__prov--compensated')
    expect(w.find('[data-testid="sim-verdict-criteria"]').exists()).toBe(true)
    w.unmount()
  })

  it('缺席态：无判词如实呈现；接口不收正文参数（正文提及不判定）', () => {
    const w = mount(SimVerdictField, { props: { verdict: null } })
    expect(w.find('[data-testid="sim-verdict-absent"]').text()).toContain('无判词')
    // 从接口上杜绝叙述判词：props 类型只有 verdict/criteria，传未知属性不产生渲染
    const probe = mount(SimVerdictField, { props: { verdict: null } as never, attrs: { prose: '看起来通过了' } })
    expect(probe.text()).not.toContain('看起来通过了')
    probe.unmount()
    w.unmount()
  })
})

describe('SimInterventionCard — 介入卡（R5）', () => {
  it('批准/打回双钮发出动作与载荷（含依据锚与决策前提）', async () => {
    const w = mount(SimInterventionCard, {
      props: {
        point: {
          id: 'iv-06', title: 'G2 架构评审判词', sourceKind: 'gate', sourceKey: 'g2_arch_pass',
          belief: '方案复用既有实现未重复造轮', evidenceAnchor: '$EnQbo21v',
        },
      },
    })
    expect(w.find('[data-testid="sim-interv-icon"]').exists()).toBe(true)
    expect(w.find('[data-testid="sim-interv-source"]').text()).toBe('关卡')
    expect(w.find('[data-testid="sim-interv-belief"]').text()).toContain('须先确认：方案复用既有实现')
    await w.find('[data-testid="sim-interv-approve"]').trigger('click')
    await w.find('[data-testid="sim-interv-reject"]').trigger('click')
    const approve = w.emitted('approve')
    const reject = w.emitted('reject')
    expect(approve && approve[0][0]).toEqual({ id: 'iv-06', belief: '方案复用既有实现未重复造轮', evidenceAnchor: '$EnQbo21v' })
    expect(reject && reject[0][0]).toEqual({ id: 'iv-06', belief: '方案复用既有实现未重复造轮', evidenceAnchor: '$EnQbo21v' })
    w.unmount()
  })

  it('registry 来源标签与状态键回退：五类来源齐、无锚显键不误报缺锚', () => {
    const w = mount(SimInterventionCard, {
      props: { point: { id: 'iv-05', title: '分诊确认', sourceKind: 'registry', sourceKey: 'triage', pending: true } },
    })
    expect(w.find('[data-testid="sim-interv-source"]').text()).toBe('登记')
    expect(w.find('[data-testid="sim-interv-key"]').text()).toBe('键 triage')
    expect(w.find('[data-testid="sim-interv-anchor-absent"]').exists()).toBe(false)
    w.unmount()
  })

  it('决策前提缺席=如实显示缺席（旧后端未供），不硬凑', () => {
    const w = mount(SimInterventionCard, {
      props: { point: { id: 'iv-12', title: '清偿门 waive 待批', sourceKind: 'clearance' } },
    })
    const gap = w.find('[data-testid="sim-interv-belief-absent"]')
    expect(gap.exists()).toBe(true)
    expect(gap.text()).toContain('缺决策前提')
    w.unmount()
  })

  it('缺席态：无锚无键=缺依据锚红显，不拦动作', async () => {
    const w = mount(SimInterventionCard, {
      props: { point: { id: 'iv-clr', title: '清偿门 waive 待批', sourceKind: 'clearance' } },
    })
    const gap = w.find('[data-testid="sim-interv-anchor-absent"]')
    expect(gap.exists()).toBe(true)
    expect(gap.text()).toBe('缺依据锚')
    await w.find('[data-testid="sim-interv-approve"]').trigger('click')
    expect(w.emitted('approve')).toHaveLength(1)
    w.unmount()
  })
})

describe('SimDisciplineNote — 纪律提示位（N2）', () => {
  it('在制上限：n/≤2 实测呈现，超限转红', () => {
    const ok = mount(SimDisciplineNote, { props: { kind: 'wip-limit', wip: 2 } })
    expect(ok.find('[data-testid="sim-disc-note"]').text()).toBe('在制 2/≤2')
    expect(ok.find('[data-testid="sim-disc-note"]').classes()).not.toContain('sim-disc--over')
    ok.unmount()
    const over = mount(SimDisciplineNote, { props: { kind: 'wip-limit', wip: 3 } })
    expect(over.find('[data-testid="sim-disc-note"]').classes()).toContain('sim-disc--over')
    over.unmount()
  })

  it('另外两纪律句与缺席语义：不传 wip 不显示数字', () => {
    const lie = mount(SimDisciplineNote, { props: { kind: 'no-false-report' } })
    expect(lie.find('[data-testid="sim-disc-note"]').text()).toBe('不许谎报：未跑的如实写未跑')
    lie.unmount()
    const tester = mount(SimDisciplineNote, { props: { kind: 'tester-not-author' } })
    expect(tester.find('[data-testid="sim-disc-note"]').text()).toBe('测试者≠写码者')
    tester.unmount()
  })
})
